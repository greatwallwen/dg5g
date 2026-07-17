import type {
  P1PortfolioDetailFacts,
  PortfolioAssessmentFact,
  PortfolioEvidenceFact,
  PortfolioReviewFact,
  PortfolioVersionFact,
} from '../features/portfolio/p1-portfolio-detail-model.ts';
import type { LearningOrigin } from './learning-origin.ts';
import type {
  P1OutputTaskId,
  ProfessionalOutputFieldValue,
  ProfessionalOutputStatus,
} from './professional-output-repository.ts';
import type { AppDatabase } from './db/database.ts';
import {
  getFormalAssessmentDefinitionByVersion,
  getFormalAssessmentValidationPolicy,
} from './formal-assessment-catalog.server.ts';
import { calculateTaskCompositeScore } from './learning-mastery.ts';
import {
  validatePersistedAssessmentDiagnostic,
  type PersistedAssessmentCandidate,
  type ValidatedPersistedAssessmentDiagnostic,
} from './persisted-assessment-diagnostic.ts';
import { readHighestValidUserFormalAssessment } from './validated-user-formal-assessment.ts';

interface HeadRow {
  outputId: string;
  studentId: string;
  taskId: P1OutputTaskId;
  currentVersion: number;
  stateRevision: number;
  status: ProfessionalOutputStatus;
  origin: LearningOrigin;
}

interface VersionRow {
  outputId: string;
  taskId: P1OutputTaskId;
  version: number;
  schemaVersion: 1;
  fieldsJson: string;
  upstreamRefsJson: string;
}

interface FormalRow extends PersistedAssessmentCandidate {
  origin: LearningOrigin;
}

interface FrozenRow {
  detailsJson: string;
  provisionalScore: number;
  officialScore: number | null;
  origin: LearningOrigin;
}

const assessmentNodeByTask: Record<P1OutputTaskId, string> = {
  P01: 'P1T1-N02',
  P02: 'P1T2-N02',
  P03: 'P1T3-N02',
};

export class ProfessionalOutputPortfolioReader {
  constructor(private readonly database: AppDatabase) {}

  read(studentId: string, taskId: P1OutputTaskId): P1PortfolioDetailFacts {
    assertNonEmpty('studentId', studentId);
    assertTaskId(taskId);
    const head = this.readHead(studentId, taskId);
    if (!head) return { taskId };
    const reviewHistory = this.readReviews(head.outputId);
    return {
      taskId,
      output: {
        head,
        versions: this.readVersions(head.outputId),
        submissionCount: this.readSubmissionCount(head.outputId),
        reviewHistory,
      },
      ...this.readAssessment(studentId, taskId, head, reviewHistory),
    };
  }

  private readHead(studentId: string, taskId: P1OutputTaskId): HeadRow | undefined {
    return this.database.prepare(`
      SELECT output_id AS outputId, student_id AS studentId, task_id AS taskId,
        current_version AS currentVersion, state_revision AS stateRevision,
        status, origin
      FROM professional_outputs
      WHERE student_id = ? AND task_id = ?
    `).get(studentId, taskId) as HeadRow | undefined;
  }

  private readVersions(outputId: string): PortfolioVersionFact[] {
    const rows = this.database.prepare(`
      SELECT output_id AS outputId, task_id AS taskId, version,
        schema_version AS schemaVersion, fields_json AS fieldsJson,
        upstream_refs_json AS upstreamRefsJson
      FROM professional_output_versions
      WHERE output_id = ? ORDER BY version
    `).all(outputId) as VersionRow[];
    return rows.map((row) => ({
      outputId: row.outputId,
      taskId: row.taskId,
      version: row.version,
      schemaVersion: row.schemaVersion,
      fields: parseFields(row.fieldsJson),
      upstreamRefs: parseJsonArray(row.upstreamRefsJson),
      evidenceLinks: this.readEvidence(row.outputId, row.version),
      evidenceGaps: this.readEvidenceGaps(row.outputId, row.version),
      fieldSources: this.database.prepare(`
        SELECT field_key AS fieldKey, source_node_id AS sourceNodeId,
          source_attempt_id AS sourceAttemptId
        FROM output_field_sources
        WHERE output_id = ? AND version = ?
        ORDER BY field_key, source_node_id, source_attempt_id
      `).all(row.outputId, row.version) as PortfolioVersionFact['fieldSources'],
    }));
  }

  private readEvidenceGaps(outputId: string, version: number): PortfolioVersionFact['evidenceGaps'] {
    const rows = this.database.prepare(`
      SELECT field_key AS fieldKey, gap_text AS gapText,
        next_action_text AS nextActionText
      FROM output_evidence_gaps
      WHERE output_id = ? AND version = ?
      ORDER BY field_key
    `).all(outputId, version) as Array<{
      fieldKey: string;
      gapText: string;
      nextActionText: string;
    }>;
    return Object.fromEntries(rows.map(({ fieldKey, ...gap }) => [fieldKey, gap]));
  }

  private readEvidence(outputId: string, version: number): PortfolioVersionFact['evidenceLinks'] {
    const rows = this.database.prepare(`
      SELECT link.field_key AS fieldKey, evidence.evidence_id AS evidenceId,
        evidence.title, evidence.kind, evidence.asset_url AS assetUrl,
        evidence.metadata_json AS metadataJson, evidence.origin
      FROM output_evidence_links AS link
      INNER JOIN evidence_library AS evidence ON evidence.evidence_id = link.evidence_id
      WHERE link.output_id = ? AND link.version = ?
      ORDER BY link.field_key, evidence.evidence_id
    `).all(outputId, version) as Array<Omit<PortfolioEvidenceFact, 'metadata'> & {
      fieldKey: string;
      metadataJson: string;
    }>;
    const links: PortfolioVersionFact['evidenceLinks'] = {};
    for (const { fieldKey, metadataJson, ...row } of rows) {
      (links[fieldKey] ??= []).push({ ...row, metadata: stringMetadata(metadataJson) });
    }
    return links;
  }

  private readReviews(outputId: string): PortfolioReviewFact[] {
    const rows = this.database.prepare(`
      SELECT review.review_id AS reviewId, review.reviewer_id AS reviewerId,
        review.status, review.score, review.feedback, review.reviewed_at AS reviewedAt,
        review.origin, CAST((
          SELECT json_extract(event.payload_json, '$.version')
          FROM learning_events AS event
          WHERE json_extract(event.payload_json, '$.reviewId') = review.review_id
          ORDER BY event.occurred_at DESC, event.event_id DESC LIMIT 1
        ) AS INTEGER) AS outputVersion
      FROM output_reviews AS review
      WHERE review.output_id = ?
      ORDER BY review.reviewed_at, review.review_id
    `).all(outputId) as Array<Omit<PortfolioReviewFact, 'annotations' | 'score' | 'feedback'> & {
      score: number | null;
      feedback: string | null;
      outputVersion: number | null;
    }>;
    return rows.flatMap((row) => row.outputVersion === null || row.outputVersion < 1 ? [] : [{
      reviewId: row.reviewId,
      reviewerId: row.reviewerId,
      status: row.status,
      outputVersion: row.outputVersion,
      ...(row.score === null ? {} : { score: row.score }),
      ...(row.feedback === null ? {} : { feedback: row.feedback }),
      reviewedAt: row.reviewedAt,
      origin: row.origin,
      annotations: this.database.prepare(`
        SELECT field_key AS fieldKey, comment
        FROM output_review_annotations WHERE review_id = ? ORDER BY field_key
      `).all(row.reviewId) as PortfolioReviewFact['annotations'],
    }]);
  }

  private readSubmissionCount(outputId: string): number {
    return this.database.prepare(`
      SELECT COUNT(*) FROM learning_events
      WHERE event_type = 'evidence_submitted'
        AND json_extract(payload_json, '$.outputId') = ?
    `).pluck().get(outputId) as number;
  }

  private readAssessment(
    studentId: string,
    taskId: P1OutputTaskId,
    head: HeadRow,
    reviewHistory: PortfolioReviewFact[],
  ): Pick<P1PortfolioDetailFacts, 'assessment' | 'assessmentLinkStatus'> {
    const nodeId = assessmentNodeByTask[taskId];
    const frozen = this.database.prepare(`
      SELECT details_json AS detailsJson, provisional_score AS provisionalScore,
        official_score AS officialScore, origin
      FROM frozen_task_scores
      WHERE student_id = ? AND task_id = ?
      ORDER BY CASE origin WHEN 'user' THEN 0 ELSE 1 END,
        snapshot_version DESC, frozen_at DESC, score_id DESC LIMIT 1
    `).get(studentId, taskId) as FrozenRow | undefined;
    if (!frozen && head.origin === 'user' && head.status === 'submitted') {
      const assessment = readHighestValidUserFormalAssessment(this.database, studentId, nodeId, 80);
      return optionalAssessment(assessment ? projectValidatedAssessment(assessment) : undefined);
    }
    if (!frozen) return optionalAssessment(this.readCurrentAssessment(studentId, nodeId));
    const frozenDetails = parseJsonRecord(frozen.detailsJson);
    const canonicalAttemptId = stringProperty(frozenDetails, 'nodeTestAttemptId');
    const aliasAttemptId = stringProperty(frozenDetails, 'attemptId');
    if (canonicalAttemptId && aliasAttemptId && canonicalAttemptId !== aliasAttemptId) {
      return { assessmentLinkStatus: 'legacy-unlinked' };
    }
    const attemptId = canonicalAttemptId ?? aliasAttemptId;
    if (!attemptId) return { assessmentLinkStatus: 'legacy-unlinked' };
    const row = this.readFormalById(studentId, nodeId, attemptId);
    const assessment = row ? projectFormalRow(row) : undefined;
    if (!row || !assessment || !frozenAssessmentMatches({
      assessment, frozen, details: frozenDetails, head, nodeId, reviewHistory, row,
    })) return { assessmentLinkStatus: 'legacy-unlinked' };
    return optionalAssessment(assessment);
  }

  private readFormalById(studentId: string, nodeId: string, attemptId: string): FormalRow | undefined {
    return this.database.prepare(`${formalSelect()} WHERE attempt.attempt_id = ? AND attempt.student_id = ? AND attempt.node_id = ?`)
      .get(attemptId, studentId, nodeId) as FormalRow | undefined;
  }

  private readCurrentAssessment(studentId: string, nodeId: string): PortfolioAssessmentFact | undefined {
    const rows = this.database.prepare(`${formalSelect()}
      WHERE attempt.student_id = ? AND attempt.node_id = ?
      ORDER BY CASE attempt.origin WHEN 'user' THEN 0 ELSE 1 END,
        julianday(attempt.completed_at) DESC, attempt.attempt_id DESC
    `).all(studentId, nodeId) as FormalRow[];
    for (const row of rows) {
      const assessment = projectFormalRow(row);
      if (assessment) return assessment;
    }
    return undefined;
  }
}

function formalSelect(): string {
  return `SELECT attempt.attempt_id AS attemptId, attempt.student_id AS studentId,
    attempt.node_id AS nodeId, attempt.assessment_id AS assessmentId,
    attempt.game_id AS gameId, attempt.question_version AS questionVersion,
    attempt.score, attempt.diagnostics_json AS diagnosticsJson,
    attempt.origin, attempt.completed_at AS completedAt,
    instance.assessment_id AS instanceAssessmentId,
    instance.node_id AS instanceNodeId, instance.game_id AS instanceGameId,
    instance.question_version AS instanceQuestionVersion,
    instance.status AS instanceStatus
    FROM formal_attempts AS attempt
    INNER JOIN formal_assessment_instances AS instance
      ON instance.assessment_id = attempt.assessment_id`;
}

function projectFormalRow(row: FormalRow): PortfolioAssessmentFact | undefined {
  const policy = getFormalAssessmentValidationPolicy(row.nodeId);
  if (!policy) return undefined;
  const value = validatePersistedAssessmentDiagnostic(row, policy);
  if (!value) return undefined;
  const definition = getFormalAssessmentDefinitionByVersion(value.nodeId, value.questionVersion);
  if (!definition || definition.gameId !== value.gameId) return undefined;
  return projectValidatedAssessment(value);
}

function projectValidatedAssessment(
  value: ValidatedPersistedAssessmentDiagnostic,
): PortfolioAssessmentFact {
  return {
    assessmentId: value.assessmentId,
    attemptId: value.attemptId,
    nodeId: value.nodeId,
    questionVersion: value.questionVersion,
    totalScore: value.totalScore,
    passed: value.passed,
    dimensions: value.dimensions as PortfolioAssessmentFact['dimensions'],
    remediationTargets: value.remediationTargets as PortfolioAssessmentFact['remediationTargets'],
    origin: value.origin,
    completedAt: value.completedAt,
  };
}

function frozenAssessmentMatches(input: {
  assessment: PortfolioAssessmentFact;
  frozen: FrozenRow;
  details: Record<string, unknown> | undefined;
  head: HeadRow;
  nodeId: string;
  reviewHistory: PortfolioReviewFact[];
  row: FormalRow;
}): boolean {
  const { assessment, frozen, details, head, nodeId, reviewHistory, row } = input;
  if (!details || head.status !== 'verified' || !assessment.passed
    || frozen.origin !== head.origin || assessment.origin !== frozen.origin) return false;
  if (stringProperty(details, 'assessmentId') !== assessment.assessmentId
    || stringProperty(details, 'questionVersion') !== assessment.questionVersion) return false;

  const test = recordProperty(details, 'test');
  const frozenNodeId = stringProperty(test, 'nodeId') ?? stringProperty(details, 'nodeId');
  const frozenGameId = stringProperty(test, 'gameId') ?? stringProperty(details, 'gameId');
  const frozenFormalScore = numberProperty(test, 'score')
    ?? numberProperty(details, 'nodeTestHighestScore');
  if (frozenNodeId !== nodeId || frozenFormalScore !== assessment.totalScore) return false;
  if ((test && frozenGameId !== row.gameId) || (!test && frozenGameId && frozenGameId !== row.gameId)) {
    return false;
  }

  const output = recordProperty(details, 'output');
  const frozenOutputId = stringProperty(output, 'outputId') ?? stringProperty(details, 'outputId');
  const frozenOutputVersion = numberProperty(output, 'version')
    ?? numberProperty(details, 'outputVersion');
  const frozenRubricScore = numberProperty(output, 'rubricScore')
    ?? numberProperty(details, 'outputRubricScore');
  if (frozenOutputId !== head.outputId || frozenOutputVersion !== head.currentVersion) return false;

  const reviewId = stringProperty(details, 'reviewId');
  const review = reviewId
    ? reviewHistory.find((candidate) => candidate.reviewId === reviewId)
    : [...reviewHistory].reverse().find((candidate) => (
      candidate.status === 'verified' && candidate.outputVersion === head.currentVersion
    ));
  if (!review || review.status !== 'verified' || review.outputVersion !== head.currentVersion
    || review.origin !== frozen.origin || review.score === undefined
    || frozenRubricScore !== review.score) return false;

  const formulaVersion = stringProperty(details, 'formulaVersion');
  if (formulaVersion && formulaVersion !== 'task-score-40-60-v1') return false;
  if (test && numberProperty(test, 'weight') !== 0.4) return false;
  if (output && numberProperty(output, 'weight') !== 0.6) return false;
  const weights = recordProperty(details, 'weights');
  if (weights && (numberProperty(weights, 'nodeTest') !== 0.4
    || numberProperty(weights, 'professionalOutput') !== 0.6)) return false;

  const expectedComposite = calculateTaskCompositeScore({
    nodeTestHighestScore: assessment.totalScore,
    outputRubricScore: review.score,
  }).taskCompositeScore;
  const frozenComposite = numberProperty(details, 'taskCompositeScore');
  return expectedComposite !== undefined
    && frozenComposite === expectedComposite
    && frozen.provisionalScore === expectedComposite
    && frozen.officialScore === expectedComposite;
}

function parseFields(value: string): Record<string, ProfessionalOutputFieldValue> {
  const record = parseJsonRecord(value);
  if (!record) return {};
  return Object.fromEntries(Object.entries(record).filter((entry): entry is [string, ProfessionalOutputFieldValue] => {
    const field = entry[1];
    return typeof field === 'string' || (typeof field === 'number' && Number.isFinite(field))
      || (Array.isArray(field) && field.every((item) => typeof item === 'string'));
  }));
}

function stringMetadata(value: string): Record<string, string> {
  const source = parseJsonRecord(value) ?? {};
  return Object.fromEntries(['evidenceType', 'annotation'].flatMap((key) => (
    typeof source[key] === 'string' ? [[key, source[key]]] : []
  )));
}

function parseJsonRecord(value: string | undefined): Record<string, unknown> | undefined {
  if (!value) return undefined;
  try { const parsed: unknown = JSON.parse(value); return isRecord(parsed) ? parsed : undefined; } catch { return undefined; }
}

function parseJsonArray<T>(value: string): T[] {
  try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed as T[] : []; } catch { return []; }
}

function optionalAssessment(value: PortfolioAssessmentFact | undefined): Pick<P1PortfolioDetailFacts, 'assessment'> {
  return value ? { assessment: value } : {};
}

function stringProperty(value: Record<string, unknown> | undefined, key: string): string | undefined {
  const item = value?.[key]; return typeof item === 'string' && item.trim() ? item : undefined;
}

function numberProperty(value: Record<string, unknown> | undefined, key: string): number | undefined {
  const item = value?.[key]; return typeof item === 'number' && Number.isFinite(item) ? item : undefined;
}

function recordProperty(
  value: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined {
  const item = value?.[key]; return isRecord(item) ? item : undefined;
}

function assertTaskId(value: string): asserts value is P1OutputTaskId {
  if (value !== 'P01' && value !== 'P02' && value !== 'P03') throw new TypeError('Invalid P1 task id.');
}

function assertNonEmpty(field: string, value: string): void {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${field} must be non-empty.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
