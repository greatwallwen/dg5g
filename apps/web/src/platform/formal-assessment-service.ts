import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { AuthenticatedActor } from './auth/actor.ts';
import { getDatabase, type AppDatabase } from './db/database.ts';
import {
  assessmentDimensionKeys,
  getFormalAssessmentDefinition,
  projectAssessmentPaper,
  type AssessmentDimensionKey,
  type AssessmentPaper,
  type FormalAssessmentDefinition,
  type RemediationTarget,
} from './formal-assessment-catalog.ts';
import { createLearningCommandService, LearningAuthorizationError } from './learning-command-service.ts';
import { getNodeLearningPolicy } from './learning-policy.ts';
import { SnapshotClock } from './snapshot-clock.ts';

export type { AssessmentPaper, RemediationTarget } from './formal-assessment-catalog.ts';

export interface AssessmentAnswers {
  evidenceClassification: string;
  linkReconstruction: string[];
  defectiveOutputRevision: string[];
  professionalConclusion: string;
}

export interface AssessmentDimensionDiagnosis {
  score: number;
  maxScore: 25;
  feedback: string;
  remediationTarget?: RemediationTarget;
}

export interface AssessmentDiagnosis {
  assessmentId: string;
  attemptId: string;
  nodeId: string;
  questionVersion: string;
  totalScore: number;
  passed: boolean;
  dimensions: Record<AssessmentDimensionKey, AssessmentDimensionDiagnosis>;
  remediationTargets: RemediationTarget[];
  origin: 'user';
  completedAt: string;
  version: number;
  globalVersion: number;
  paper: AssessmentPaper;
}

export interface IssuedAssessmentPaper {
  paper: AssessmentPaper;
  attemptToken: string;
  assessmentId: string;
  expiresAt: string;
}

export interface FormalAssessmentServiceOptions {
  now?: () => Date;
  randomId?: () => string;
  randomToken?: () => string;
  tokenTtlMs?: number;
}

export class AssessmentCatalogError extends Error {
  constructor(readonly nodeId: string) {
    super(`Formal assessment is unavailable for ${nodeId}.`);
    this.name = 'AssessmentCatalogError';
  }
}

export class AssessmentTokenError extends Error {
  constructor(readonly code: 'invalid-token' | 'expired-token' | 'used-token') {
    super(code === 'expired-token'
      ? 'The formal assessment token has expired.'
      : code === 'used-token'
        ? 'The formal assessment token has already been used.'
        : 'The formal assessment token is invalid.');
    this.name = 'AssessmentTokenError';
  }
}

export class AssessmentRemediationRequiredError extends Error {
  constructor(readonly targets: RemediationTarget[]) {
    super('Complete the targeted relearning activities before starting another formal assessment.');
    this.name = 'AssessmentRemediationRequiredError';
  }
}

interface TokenRow {
  assessmentId: string;
  studentId: string;
  nodeId: string;
  questionVersion: string;
  issuedAt: string;
  expiresAt: string;
  usedAt: string | null;
  instanceNodeId: string;
  instanceQuestionVersion: string;
  status: string;
}

interface LatestAttemptRow {
  score: number;
  diagnosticsJson: string;
  completedAt: string;
}

export class FormalAssessmentService {
  private readonly now: () => Date;
  private readonly randomId: () => string;
  private readonly randomToken: () => string;
  private readonly tokenTtlMs: number;

  constructor(
    private readonly database: AppDatabase,
    options: FormalAssessmentServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.randomId = options.randomId ?? randomUUID;
    this.randomToken = options.randomToken ?? (() => randomBytes(32).toString('base64url'));
    this.tokenTtlMs = options.tokenTtlMs ?? 30 * 60 * 1_000;
  }

  issuePaper(actor: AuthenticatedActor, nodeId: string): IssuedAssessmentPaper {
    const studentId = requireStudent(actor);
    createLearningCommandService(this.database).requireNodeAccess(actor, nodeId);
    const definition = requireDefinition(nodeId);
    const policy = getNodeLearningPolicy(nodeId);
    if (!policy?.requiresFormalTest || policy.assessmentRole !== 'node-test') {
      throw new AssessmentCatalogError(nodeId);
    }
    const missingTargets = this.readMissingRemediationTargets(studentId, definition);
    if (missingTargets.length > 0) throw new AssessmentRemediationRequiredError(missingTargets);

    const now = this.now();
    const openedAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + this.tokenTtlMs).toISOString();
    const assessmentId = `assessment-${this.randomId()}`;
    const attemptToken = this.randomToken();
    if (attemptToken.trim().length < 24) throw new Error('Formal assessment token entropy is insufficient.');

    this.database.transaction(() => {
      this.database.prepare(`
        INSERT INTO formal_assessment_instances (
          assessment_id, node_id, game_id, question_version, status, opened_at, created_at
        ) VALUES (?, ?, ?, ?, 'running', ?, ?)
      `).run(
        assessmentId,
        nodeId,
        definition.gameId,
        definition.paper.questionVersion,
        openedAt,
        openedAt,
      );
      this.database.prepare(`
        INSERT INTO formal_assessment_tokens (
          token_hash, assessment_id, student_id, node_id, question_version, issued_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        hashToken(attemptToken),
        assessmentId,
        studentId,
        nodeId,
        definition.paper.questionVersion,
        openedAt,
        expiresAt,
      );
    })();

    return {
      paper: projectAssessmentPaper(definition),
      attemptToken,
      assessmentId,
      expiresAt,
    };
  }

  submitAnswers(
    actor: AuthenticatedActor,
    attemptToken: string,
    answers: AssessmentAnswers,
    expectedNodeId?: string,
  ): AssessmentDiagnosis {
    const studentId = requireStudent(actor);
    if (typeof attemptToken !== 'string' || attemptToken.trim().length < 24) {
      throw new AssessmentTokenError('invalid-token');
    }
    const normalizedAnswers = normalizeAnswers(answers);
    const completedAt = this.now().toISOString();

    return this.database.transaction(() => {
      const tokenHash = hashToken(attemptToken);
      const token = this.readToken(tokenHash);
      if (!token || token.studentId !== studentId) throw new AssessmentTokenError('invalid-token');
      if (token.usedAt !== null) throw new AssessmentTokenError('used-token');
      if (new Date(token.expiresAt).getTime() <= new Date(completedAt).getTime()) {
        throw new AssessmentTokenError('expired-token');
      }
      if (expectedNodeId !== undefined && token.nodeId !== expectedNodeId) {
        throw new AssessmentTokenError('invalid-token');
      }
      if (token.status !== 'running'
        || token.nodeId !== token.instanceNodeId
        || token.questionVersion !== token.instanceQuestionVersion) {
        throw new AssessmentTokenError('invalid-token');
      }

      const definition = requireDefinition(token.nodeId);
      if (definition.paper.questionVersion !== token.questionVersion) {
        throw new AssessmentTokenError('invalid-token');
      }
      const graded = gradeAnswers(definition, normalizedAnswers);
      const attemptId = `formal-attempt-${this.randomId()}`;
      const diagnosisBase = {
        assessmentId: token.assessmentId,
        attemptId,
        nodeId: token.nodeId,
        questionVersion: token.questionVersion,
        totalScore: graded.totalScore,
        passed: graded.totalScore >= definition.paper.passScore,
        dimensions: graded.dimensions,
        remediationTargets: graded.remediationTargets,
        origin: 'user' as const,
        completedAt,
      };
      const durationSeconds = Math.max(0, Math.round(
        (new Date(completedAt).getTime() - new Date(token.issuedAt).getTime()) / 1_000,
      ));

      const consumed = this.database.prepare(`
        UPDATE formal_assessment_tokens SET used_at = ?
        WHERE token_hash = ? AND used_at IS NULL
      `).run(completedAt, tokenHash);
      if (consumed.changes !== 1) throw new AssessmentTokenError('used-token');
      this.database.prepare(`
        INSERT INTO formal_attempts (
          attempt_id, student_id, node_id, assessment_id, game_id, score, duration_seconds,
          mistake_knowledge_point_ids_json, completed_at, question_version, answers_json,
          diagnostics_json, origin
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user')
      `).run(
        attemptId,
        studentId,
        token.nodeId,
        token.assessmentId,
        definition.gameId,
        graded.totalScore,
        durationSeconds,
        JSON.stringify(graded.remediationTargets.map(({ sectionId }) => sectionId)),
        completedAt,
        token.questionVersion,
        JSON.stringify(normalizedAnswers),
        JSON.stringify(diagnosisBase),
      );
      this.database.prepare(`
        UPDATE formal_assessment_instances
        SET status = 'closed', closed_at = ?
        WHERE assessment_id = ? AND status = 'running'
      `).run(completedAt, token.assessmentId);
      const versions = new SnapshotClock(this.database).advance(
        [`learning:${studentId}`],
        completedAt,
      );

      return {
        ...diagnosisBase,
        version: versions.topicVersions[`learning:${studentId}`],
        globalVersion: versions.globalVersion,
        paper: projectAssessmentPaper(definition),
      };
    })();
  }

  private readToken(tokenHash: string): TokenRow | undefined {
    return this.database.prepare(`
      SELECT token.assessment_id AS assessmentId, token.student_id AS studentId,
        token.node_id AS nodeId, token.question_version AS questionVersion,
        token.issued_at AS issuedAt, token.expires_at AS expiresAt, token.used_at AS usedAt,
        instance.node_id AS instanceNodeId,
        instance.question_version AS instanceQuestionVersion,
        instance.status
      FROM formal_assessment_tokens AS token
      INNER JOIN formal_assessment_instances AS instance
        ON instance.assessment_id = token.assessment_id
      WHERE token.token_hash = ?
    `).get(tokenHash) as TokenRow | undefined;
  }

  private readMissingRemediationTargets(
    studentId: string,
    definition: FormalAssessmentDefinition,
  ): RemediationTarget[] {
    const latest = this.database.prepare(`
      SELECT score, diagnostics_json AS diagnosticsJson, completed_at AS completedAt
      FROM formal_attempts
      WHERE student_id = ? AND node_id = ? AND question_version = ? AND origin = 'user'
      ORDER BY julianday(completed_at) DESC, attempt_id DESC
      LIMIT 1
    `).get(
      studentId,
      definition.paper.nodeId,
      definition.paper.questionVersion,
    ) as LatestAttemptRow | undefined;
    if (!latest || latest.score >= definition.paper.passScore) return [];

    const targets = parseRemediationTargets(latest.diagnosticsJson);
    const completed = this.database.prepare(`
      SELECT EXISTS(
        SELECT 1 FROM practice_attempts
        WHERE student_id = @studentId
          AND node_id = @nodeId
          AND passed = 1
          AND origin = 'user'
          AND julianday(attempted_at) > julianday(@completedAt)
          AND json_extract(result_json, '$.remediationTarget.nodeId') = @nodeId
          AND json_extract(result_json, '$.remediationTarget.sectionId') = @sectionId
      )
    `).pluck();
    return targets.filter((target) => completed.get({
      studentId,
      nodeId: target.nodeId,
      sectionId: target.sectionId,
      completedAt: latest.completedAt,
    }) !== 1);
  }
}

export function createFormalAssessmentService(
  database: AppDatabase = getDatabase(),
): FormalAssessmentService {
  return new FormalAssessmentService(database);
}

function requireStudent(actor: AuthenticatedActor): string {
  if (actor.role !== 'student' || !actor.studentId || actor.studentId !== actor.userId) {
    throw new LearningAuthorizationError();
  }
  return actor.studentId;
}

function requireDefinition(nodeId: string): FormalAssessmentDefinition {
  const definition = getFormalAssessmentDefinition(nodeId);
  if (!definition) throw new AssessmentCatalogError(nodeId);
  return definition;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function normalizeAnswers(value: AssessmentAnswers): AssessmentAnswers {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Assessment answers must be an object.');
  }
  const record = value as unknown as Record<string, unknown>;
  if (Object.keys(record).length !== assessmentDimensionKeys.length
    || assessmentDimensionKeys.some((key) => !Object.hasOwn(record, key))) {
    throw new TypeError('Assessment answers must contain exactly the four assessment dimensions.');
  }
  if (typeof record.evidenceClassification !== 'string'
    || !Array.isArray(record.linkReconstruction)
    || record.linkReconstruction.some((item) => typeof item !== 'string')
    || !Array.isArray(record.defectiveOutputRevision)
    || record.defectiveOutputRevision.some((item) => typeof item !== 'string')
    || typeof record.professionalConclusion !== 'string') {
    throw new TypeError('Assessment answers have invalid value types.');
  }
  return {
    evidenceClassification: record.evidenceClassification,
    linkReconstruction: [...record.linkReconstruction] as string[],
    defectiveOutputRevision: [...record.defectiveOutputRevision] as string[],
    professionalConclusion: record.professionalConclusion.trim(),
  };
}

function gradeAnswers(definition: FormalAssessmentDefinition, answers: AssessmentAnswers) {
  const dimensions = {} as Record<AssessmentDimensionKey, AssessmentDimensionDiagnosis>;
  const evidenceScore = definition.grading.evidenceClassification.acceptedOptionIds
    ?.includes(answers.evidenceClassification) ? 25 : 0;
  dimensions.evidenceClassification = diagnosis(
    evidenceScore,
    evidenceScore === 25 ? '设备身份的直接证据选择准确。' : '需要区分位置环境、端口状态与设备身份的直接证据。',
    definition.grading.evidenceClassification.remediationTarget,
  );

  const expectedOrder = definition.grading.linkReconstruction.orderedOptionIds ?? [];
  const orderMatches = expectedOrder.reduce(
    (count, optionId, index) => count + (answers.linkReconstruction[index] === optionId ? 1 : 0),
    0,
  );
  const linkScore = expectedOrder.length === 0 ? 0 : Math.round(orderMatches * 25 / expectedOrder.length);
  dimensions.linkReconstruction = diagnosis(
    linkScore,
    linkScore === 25 ? '链路对象与连接方向完整。' : '链路必须同时保留两端设备、两端端口和中间线缆方向。',
    definition.grading.linkReconstruction.remediationTarget,
  );

  const selected = new Set(answers.defectiveOutputRevision);
  const required = definition.grading.defectiveOutputRevision.requiredOptionIds ?? [];
  const forbidden = definition.grading.defectiveOutputRevision.forbiddenOptionIds ?? [];
  const revisionUnits = required.filter((optionId) => selected.has(optionId)).length
    - forbidden.filter((optionId) => selected.has(optionId)).length;
  const revisionScore = Math.max(0, Math.min(25, Math.round(revisionUnits * 25 / Math.max(1, required.length))));
  dimensions.defectiveOutputRevision = diagnosis(
    revisionScore,
    revisionScore === 25 ? '修订动作恢复了字段来源、照片索引和连接方向。' : '修订应保留证据缺口，并补齐字段来源、照片索引与方向。',
    definition.grading.defectiveOutputRevision.remediationTarget,
  );

  const conclusion = answers.professionalConclusion.toLocaleLowerCase('zh-CN');
  const criteria = definition.grading.professionalConclusion.conclusionCriteria ?? [];
  const conclusionMatches = criteria.filter((variants) => variants.some((term) => conclusion.includes(term))).length;
  const conclusionScore = Math.min(25, conclusionMatches * 5);
  dimensions.professionalConclusion = diagnosis(
    conclusionScore,
    conclusionScore === 25 ? '结论区分了已确认事实、证据缺口、风险与复核动作。' : '职业结论需要说明已确认事实、未确认风险和可执行的复核动作。',
    definition.grading.professionalConclusion.remediationTarget,
  );

  const totalScore = assessmentDimensionKeys.reduce((total, key) => total + dimensions[key].score, 0);
  const remediationTargets = assessmentDimensionKeys
    .filter((key) => dimensions[key].score < 20)
    .map((key) => definition.grading[key].remediationTarget);
  return { dimensions, totalScore, remediationTargets };
}

function diagnosis(
  score: number,
  feedback: string,
  remediationTarget: RemediationTarget,
): AssessmentDimensionDiagnosis {
  return {
    score,
    maxScore: 25,
    feedback,
    ...(score < 20 ? { remediationTarget } : {}),
  };
}

function parseRemediationTargets(diagnosticsJson: string): RemediationTarget[] {
  try {
    const parsed = JSON.parse(diagnosticsJson) as { remediationTargets?: unknown };
    if (!Array.isArray(parsed.remediationTargets)) return [];
    return parsed.remediationTargets.filter((target): target is RemediationTarget => (
      typeof target === 'object'
      && target !== null
      && typeof (target as RemediationTarget).nodeId === 'string'
      && typeof (target as RemediationTarget).sectionId === 'string'
    ));
  } catch {
    return [];
  }
}
