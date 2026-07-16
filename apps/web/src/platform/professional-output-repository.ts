import { randomUUID } from 'node:crypto';
import { p01Activities } from '../features/learning-activities/activity-catalog.ts';
import type { ActivityArtifact } from '../features/learning-activities/activity-definition.ts';
import { readP01EvidenceDefinition } from '../features/portfolio/evidence-library.ts';
import {
  isP01OutputFieldKey,
  projectP01OutputPrefill,
  type P01ActivityAttemptFact,
  type P01OutputFieldKey,
} from '../features/portfolio/p01-output-definition.ts';
import type { AppDatabase } from './db/database.ts';
import { SnapshotClock } from './snapshot-clock.ts';
import {
  ProfessionalOutputNotFoundError,
  ProfessionalOutputReviewStore,
  ProfessionalOutputStateError,
  ProfessionalOutputStateRevisionConflictError,
  type FrozenTaskScore,
  type ProfessionalOutputPortfolioFact,
  type ProfessionalOutputReview,
  type ProfessionalOutputReviewQueueItem,
  type ReviewProfessionalOutputInput,
} from './professional-output-review-store.ts';

export {
  ProfessionalOutputNotFoundError,
  ProfessionalOutputStateError,
  ProfessionalOutputStateRevisionConflictError,
} from './professional-output-review-store.ts';
export type {
  FrozenTaskScore,
  ProfessionalOutputPortfolioFact,
  ProfessionalOutputReview,
  ProfessionalOutputReviewAction,
  ProfessionalOutputReviewQueueItem,
  ProfessionalOutputRubricScores,
  ReviewProfessionalOutputInput,
} from './professional-output-review-store.ts';

export type P1OutputTaskId = 'P01' | 'P02' | 'P03';
export type ProfessionalOutputStatus = 'draft' | 'submitted' | 'returned' | 'verified';
export type ProfessionalOutputFieldValue = string | number | string[];
export interface ProfessionalOutputHead {
  outputId: string;
  studentId: string;
  taskId: P1OutputTaskId;
  currentVersion: number;
  stateRevision: number;
  status: ProfessionalOutputStatus;
}
export interface ProfessionalOutputUpstreamRef {
  outputId: string;
  version: number;
}
export interface ProfessionalOutputEvidenceLink {
  fieldKey: string;
  evidenceId: string;
}
export interface ProfessionalOutputFieldSource {
  fieldKey: string;
  sourceNodeId: string;
  sourceAttemptId: string;
}
export interface ProfessionalOutputReviewHistoryEntry {
  reviewId: string;
  reviewerId: string;
  status: 'returned' | 'verified';
  score?: number;
  feedback?: string;
  reviewedAt: string;
  outputVersion?: number;
  origin: 'demo' | 'user';
}
export interface ProfessionalOutputVersion {
  outputId: string;
  taskId: P1OutputTaskId;
  version: number;
  schemaVersion: 1;
  fields: Record<string, ProfessionalOutputFieldValue>;
  upstreamRefs: ProfessionalOutputUpstreamRef[];
  evidenceLinks: Record<string, string[]>;
  fieldSources: ProfessionalOutputFieldSource[];
}
export interface ProfessionalOutputAggregate {
  head: ProfessionalOutputHead;
  versions: ProfessionalOutputVersion[];
  submissionCount: number;
  reviewHistory: ProfessionalOutputReviewHistoryEntry[];
}
export interface ProfessionalOutputReviewResult {
  review: ProfessionalOutputReview;
  output: ProfessionalOutputAggregate;
  frozenTaskScore?: FrozenTaskScore;
}
export interface WriteProfessionalOutputInput {
  outputId?: string;
  studentId: string;
  taskId: P1OutputTaskId;
  expectedStateRevision: number;
  fields: Record<string, ProfessionalOutputFieldValue>;
  upstreamRefs: ProfessionalOutputUpstreamRef[];
  evidenceLinks?: Record<string, string[]>;
}
export class ProfessionalOutputUpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProfessionalOutputUpstreamError';
  }
}
export class ProfessionalOutputEvidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProfessionalOutputEvidenceError';
  }
}
export class ProfessionalOutputRevisionRequiredError extends Error {
  constructor() {
    super('Returned professional output must create a revised version before resubmission.');
    this.name = 'ProfessionalOutputRevisionRequiredError';
  }
}
interface HeadRow {
  outputId: string;
  studentId: string;
  taskId: P1OutputTaskId;
  status: ProfessionalOutputStatus;
  currentVersion: number;
  stateRevision: number;
}

interface VersionRow {
  outputId: string;
  taskId: P1OutputTaskId;
  version: number;
  schemaVersion: 1;
  fieldsJson: string;
  upstreamRefsJson: string;
}

interface ReviewHistoryRow {
  reviewId: string;
  reviewerId: string;
  status: 'returned' | 'verified';
  score: number | null;
  feedback: string | null;
  reviewedAt: string;
  outputVersion: number | null;
  origin: 'demo' | 'user';
}

interface NormalizedWrite {
  outputId?: string;
  studentId: string;
  taskId: P1OutputTaskId;
  expectedStateRevision: number;
  fields: Record<string, ProfessionalOutputFieldValue>;
  fieldsJson: string;
  upstreamRefs: ProfessionalOutputUpstreamRef[];
  upstreamRefsJson: string;
  evidenceLinks: Record<string, string[]>;
  evidenceLinksJson: string;
}

const outputNodeByTask: Record<P1OutputTaskId, string> = {
  P01: 'P1T1-N04',
  P02: 'P1T2-N04',
  P03: 'P1T3-N04',
};

const immediateUpstreamTask: Partial<Record<P1OutputTaskId, P1OutputTaskId>> = {
  P02: 'P01',
  P03: 'P02',
};

export class ProfessionalOutputRepository {
  private readonly clock: SnapshotClock;

  constructor(
    private readonly database: AppDatabase,
    private readonly createOutputId: () => string = randomUUID,
  ) {
    this.clock = new SnapshotClock(database);
  }

  read(
    studentId: string,
    taskId: P1OutputTaskId,
    outputId?: string,
  ): ProfessionalOutputAggregate | undefined {
    assertNonEmpty('studentId', studentId);
    assertTaskId(taskId);
    if (outputId !== undefined) assertNonEmpty('outputId', outputId);
    return this.database.transaction(() => {
      const head = outputId
        ? this.requireOwnedHead(outputId, studentId, taskId)
        : this.readHeadForStudentTask(studentId, taskId);
      return head ? this.readAggregate(head) : undefined;
    })();
  }

  saveDraft(input: WriteProfessionalOutputInput): ProfessionalOutputAggregate {
    return this.write(input, 'draft');
  }

  submit(input: WriteProfessionalOutputInput): ProfessionalOutputAggregate {
    return this.write(input, 'submitted');
  }

  listSubmittedForTeacher(
    teacherId: string,
    classId: string,
  ): ProfessionalOutputReviewQueueItem[] {
    return new ProfessionalOutputReviewStore(this.database)
      .listSubmittedForTeacher(teacherId, classId);
  }

  readPortfolioFacts(studentId: string): ProfessionalOutputPortfolioFact[] {
    return new ProfessionalOutputReviewStore(this.database).readPortfolioFacts(studentId);
  }

  reviewSubmitted(input: ReviewProfessionalOutputInput): ProfessionalOutputReviewResult {
    const mutation = new ProfessionalOutputReviewStore(this.database).reviewSubmitted(input);
    const output = this.read(
      mutation.outputIdentity.studentId,
      mutation.outputIdentity.taskId,
      mutation.outputIdentity.outputId,
    );
    if (!output) throw new ProfessionalOutputNotFoundError(mutation.outputIdentity.outputId);
    return {
      review: mutation.review,
      output,
      ...(mutation.frozenTaskScore ? { frozenTaskScore: mutation.frozenTaskScore } : {}),
    };
  }

  private write(
    input: WriteProfessionalOutputInput,
    targetStatus: 'draft' | 'submitted',
  ): ProfessionalOutputAggregate {
    const command = normalizeWrite(input);
    return this.database.transaction(() => {
      const taskHead = this.readHeadForStudentTask(command.studentId, command.taskId);
      const requestedHead = command.outputId
        ? this.readHeadById(command.outputId)
        : undefined;
      if (requestedHead
        && (requestedHead.studentId !== command.studentId || requestedHead.taskId !== command.taskId)) {
        throw new ProfessionalOutputNotFoundError(command.outputId);
      }
      if (command.outputId && !requestedHead && taskHead) {
        throw new ProfessionalOutputNotFoundError(command.outputId);
      }
      if (requestedHead && taskHead?.outputId !== requestedHead.outputId) {
        throw new ProfessionalOutputNotFoundError(command.outputId);
      }
      const head = requestedHead ?? taskHead;
      const actualRevision = head?.stateRevision ?? 0;
      if (actualRevision !== command.expectedStateRevision) {
        throw new ProfessionalOutputStateRevisionConflictError(
          head?.outputId ?? command.outputId,
          command.expectedStateRevision,
          actualRevision,
        );
      }
      if (head?.status === 'submitted' || head?.status === 'verified') {
        throw new ProfessionalOutputStateError(head.status);
      }

      this.assertUpstreamRefs(command);
      this.assertEvidenceLinks(command);
      const outputId = head?.outputId ?? command.outputId ?? this.createOutputId();
      assertNonEmpty('outputId', outputId);
      const currentVersion = head?.currentVersion ?? 0;
      const current = currentVersion > 0
        ? this.readVersion(outputId, currentVersion)
        : undefined;
      const currentEvidenceLinks = current
        ? this.readEvidenceLinks(outputId, currentVersion)
        : {};
      const currentFieldSources = current
        ? this.readFieldSources(outputId, currentVersion)
        : [];
      const fieldSources = this.deriveFieldSources(command, currentFieldSources);
      const appendVersion = !current
        || current.fieldsJson !== command.fieldsJson
        || current.upstreamRefsJson !== command.upstreamRefsJson
        || stableJson(currentEvidenceLinks) !== command.evidenceLinksJson
        || stableJson(currentFieldSources) !== stableJson(fieldSources);
      if (targetStatus === 'submitted' && current) {
        const returnedVersion = this.latestReturnedVersion(outputId)
          ?? (head?.status === 'returned' ? currentVersion : undefined);
        const returned = returnedVersion === undefined
          ? undefined
          : this.readVersion(outputId, returnedVersion);
        if (returned
          && stableJson(JSON.parse(returned.fieldsJson)) === command.fieldsJson
          && stableJson(this.readEvidenceLinks(outputId, returned.version)) === command.evidenceLinksJson) {
          throw new ProfessionalOutputRevisionRequiredError();
        }
      }
      const nextVersion = appendVersion ? currentVersion + 1 : currentVersion;
      const nextRevision = actualRevision + 1;
      const nodeId = outputNodeByTask[command.taskId];

      if (!head) {
        this.database.prepare(`
          INSERT INTO professional_outputs (
            output_id, student_id, task_id, node_id, status, content_json,
            submitted_at, current_version, state_revision, origin, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'user', CURRENT_TIMESTAMP)
        `).run(
          outputId,
          command.studentId,
          command.taskId,
          nodeId,
          targetStatus,
          command.fieldsJson,
          targetStatus === 'submitted' ? new Date().toISOString() : null,
          nextVersion,
          nextRevision,
        );
      } else {
        this.database.prepare(`
          UPDATE professional_outputs
          SET status = ?, content_json = ?, submitted_at = ?, current_version = ?,
              state_revision = ?, origin = 'user', updated_at = CURRENT_TIMESTAMP
          WHERE output_id = ?
        `).run(
          targetStatus,
          command.fieldsJson,
          targetStatus === 'submitted' ? new Date().toISOString() : null,
          nextVersion,
          nextRevision,
          outputId,
        );
      }

      if (appendVersion) {
        this.database.prepare(`
          INSERT INTO professional_output_versions (
            output_id, task_id, version, schema_version, fields_json, upstream_refs_json
          ) VALUES (?, ?, ?, 1, ?, ?)
        `).run(
          outputId,
          command.taskId,
          nextVersion,
          command.fieldsJson,
          command.upstreamRefsJson,
        );
        this.insertEvidenceLinks(outputId, nextVersion, command.evidenceLinks);
        this.insertFieldSources(outputId, nextVersion, fieldSources);
      }

      this.appendLearningEvent({
        outputId,
        studentId: command.studentId,
        taskId: command.taskId,
        nodeId,
        version: nextVersion,
        stateRevision: nextRevision,
        status: targetStatus,
        upstreamRefs: command.upstreamRefs,
      });
      this.advanceSnapshotVersions(command.studentId);
      return this.readAggregate(this.requireOwnedHead(outputId, command.studentId, command.taskId));
    })();
  }

  private assertUpstreamRefs(command: NormalizedWrite): void {
    const expectedTask = immediateUpstreamTask[command.taskId];
    if (!expectedTask) {
      if (command.upstreamRefs.length > 0) {
        throw new ProfessionalOutputUpstreamError('P01 cannot reference an upstream professional output.');
      }
      return;
    }
    if (command.upstreamRefs.length !== 1) {
      throw new ProfessionalOutputUpstreamError(`${command.taskId} requires one ${expectedTask} output version reference.`);
    }
    const [reference] = command.upstreamRefs;
    const upstream = this.database.prepare(`
      SELECT output.student_id AS studentId, output.task_id AS taskId
      FROM professional_output_versions AS version
      INNER JOIN professional_outputs AS output ON output.output_id = version.output_id
      WHERE version.output_id = ? AND version.version = ?
    `).get(reference!.outputId, reference!.version) as {
      studentId: string;
      taskId: P1OutputTaskId;
    } | undefined;
    if (!upstream
      || upstream.studentId !== command.studentId
      || upstream.taskId !== expectedTask) {
      throw new ProfessionalOutputUpstreamError(
        `${command.taskId} upstream reference must identify this student's persisted ${expectedTask} version.`,
      );
    }
  }

  private assertEvidenceLinks(command: NormalizedWrite): void {
    for (const [fieldKey, evidenceIds] of Object.entries(command.evidenceLinks)) {
      if (!(fieldKey in command.fields)) {
        throw new ProfessionalOutputEvidenceError(
          `Evidence field must exist in this output version: ${fieldKey}.`,
        );
      }
      if (command.taskId !== 'P01' || !isP01OutputFieldKey(fieldKey)) {
        throw new ProfessionalOutputEvidenceError(
          `Evidence links are not supported for output field: ${fieldKey}.`,
        );
      }
      for (const evidenceId of evidenceIds) {
        const definition = readP01EvidenceDefinition(evidenceId);
        if (!definition || !definition.allowedFieldKeys.includes(fieldKey)) {
          throw new ProfessionalOutputEvidenceError(
            `Evidence ${evidenceId} cannot be linked to ${fieldKey}.`,
          );
        }
        const persisted = this.database.prepare(`
          SELECT 1 FROM evidence_library WHERE evidence_id = ?
        `).pluck().get(evidenceId);
        if (persisted !== 1) {
          throw new ProfessionalOutputEvidenceError(`Evidence is not seeded: ${evidenceId}.`);
        }
      }
    }
  }

  private deriveFieldSources(
    command: NormalizedWrite,
    current: ProfessionalOutputFieldSource[],
  ): ProfessionalOutputFieldSource[] {
    if (command.taskId !== 'P01') return [];
    const attempts = this.readLatestPassedP01ActivityFacts(command.studentId);
    const prefill = projectP01OutputPrefill(attempts, p01Activities);
    const derived = Object.entries(prefill).flatMap(([fieldKey, field]) => {
      if (!isP01OutputFieldKey(fieldKey) || !(fieldKey in command.fields)) return [];
      return field.sources.map(({ sourceNodeId, sourceAttemptId }) => ({
        fieldKey,
        sourceNodeId,
        sourceAttemptId,
      }));
    });
    return normalizeFieldSources([...current, ...derived]);
  }

  private readLatestPassedP01ActivityFacts(studentId: string): P01ActivityAttemptFact[] {
    const rows = this.database.prepare(`
      SELECT attempt_id AS attemptId, student_id AS studentId,
        activity_id AS activityId, node_id AS nodeId, passed, origin,
        attempted_at AS attemptedAt, artifact_json AS artifactJson
      FROM practice_attempts
      WHERE student_id = ? AND passed = 1
        AND node_id IN ('P1T1-N01', 'P1T1-N02', 'P1T1-N03')
      ORDER BY attempted_at, attempt_id
    `).all(studentId) as Array<Omit<P01ActivityAttemptFact, 'passed' | 'artifact'> & {
      passed: 0 | 1;
      artifactJson: string;
    }>;
    return rows.map(({ artifactJson, passed, ...row }) => ({
      ...row,
      passed: passed === 1,
      artifact: JSON.parse(artifactJson) as ActivityArtifact,
    }));
  }

  private insertEvidenceLinks(
    outputId: string,
    version: number,
    links: Record<string, string[]>,
  ): void {
    const insert = this.database.prepare(`
      INSERT INTO output_evidence_links (output_id, version, field_key, evidence_id)
      VALUES (?, ?, ?, ?)
    `);
    for (const [fieldKey, evidenceIds] of Object.entries(links)) {
      for (const evidenceId of evidenceIds) insert.run(outputId, version, fieldKey, evidenceId);
    }
  }

  private insertFieldSources(
    outputId: string,
    version: number,
    sources: ProfessionalOutputFieldSource[],
  ): void {
    const insert = this.database.prepare(`
      INSERT INTO output_field_sources (
        output_id, version, field_key, source_node_id, source_attempt_id
      ) VALUES (?, ?, ?, ?, ?)
    `);
    for (const source of sources) {
      insert.run(
        outputId,
        version,
        source.fieldKey,
        source.sourceNodeId,
        source.sourceAttemptId,
      );
    }
  }

  private latestReturnedVersion(outputId: string): number | undefined {
    const value = this.database.prepare(`
      SELECT CAST(json_extract(event.payload_json, '$.version') AS INTEGER)
      FROM output_reviews AS review
      LEFT JOIN learning_events AS event
        ON json_extract(event.payload_json, '$.reviewId') = review.review_id
      WHERE review.output_id = ? AND review.status = 'returned'
      ORDER BY CAST(json_extract(event.payload_json, '$.stateRevision') AS INTEGER) DESC,
        review.reviewed_at DESC, review.review_id DESC
      LIMIT 1
    `).pluck().get(outputId) as number | null | undefined;
    return value === null || value === undefined ? undefined : value;
  }

  private appendLearningEvent(input: {
    outputId: string;
    studentId: string;
    taskId: P1OutputTaskId;
    nodeId: string;
    version: number;
    stateRevision: number;
    status: 'draft' | 'submitted';
    upstreamRefs: ProfessionalOutputUpstreamRef[];
  }): void {
    this.database.prepare(`
      INSERT INTO learning_events (
        event_id, student_id, node_id, channel, event_type, payload_json, origin
      ) VALUES (?, ?, ?, 'self-study', ?, ?, 'user')
    `).run(
      `${input.outputId}:r${input.stateRevision}:${input.status}`,
      input.studentId,
      input.nodeId,
      input.status === 'draft' ? 'evidence_draft_saved' : 'evidence_submitted',
      JSON.stringify({
        outputId: input.outputId,
        taskId: input.taskId,
        version: input.version,
        stateRevision: input.stateRevision,
        upstreamRefs: input.upstreamRefs,
      }),
    );
  }

  private advanceSnapshotVersions(studentId: string): void {
    this.clock.advance([`learning:${studentId}`]);
  }

  private readAggregate(head: HeadRow): ProfessionalOutputAggregate {
    const rows = this.database.prepare(`
      SELECT
        output_id AS outputId,
        task_id AS taskId,
        version,
        schema_version AS schemaVersion,
        fields_json AS fieldsJson,
        upstream_refs_json AS upstreamRefsJson
      FROM professional_output_versions
      WHERE output_id = ?
      ORDER BY version
    `).all(head.outputId) as VersionRow[];
    return {
      head: toHead(head),
      versions: rows.map((row) => this.toVersion(row)),
      submissionCount: this.readSubmissionCount(head.outputId),
      reviewHistory: this.readReviewHistory(head.outputId),
    };
  }

  private toVersion(row: VersionRow): ProfessionalOutputVersion {
    return {
      outputId: row.outputId,
      taskId: row.taskId,
      version: row.version,
      schemaVersion: row.schemaVersion,
      fields: JSON.parse(row.fieldsJson) as Record<string, ProfessionalOutputFieldValue>,
      upstreamRefs: JSON.parse(row.upstreamRefsJson) as ProfessionalOutputUpstreamRef[],
      evidenceLinks: this.readEvidenceLinks(row.outputId, row.version),
      fieldSources: this.readFieldSources(row.outputId, row.version),
    };
  }

  private readEvidenceLinks(outputId: string, version: number): Record<string, string[]> {
    const rows = this.database.prepare(`
      SELECT field_key AS fieldKey, evidence_id AS evidenceId
      FROM output_evidence_links
      WHERE output_id = ? AND version = ?
      ORDER BY field_key, evidence_id
    `).all(outputId, version) as ProfessionalOutputEvidenceLink[];
    const links: Record<string, string[]> = {};
    for (const { fieldKey, evidenceId } of rows) {
      (links[fieldKey] ??= []).push(evidenceId);
    }
    return links;
  }

  private readFieldSources(outputId: string, version: number): ProfessionalOutputFieldSource[] {
    return this.database.prepare(`
      SELECT field_key AS fieldKey, source_node_id AS sourceNodeId,
        source_attempt_id AS sourceAttemptId
      FROM output_field_sources
      WHERE output_id = ? AND version = ?
      ORDER BY field_key, source_node_id, source_attempt_id
    `).all(outputId, version) as ProfessionalOutputFieldSource[];
  }

  private readSubmissionCount(outputId: string): number {
    return this.database.prepare(`
      SELECT COUNT(*) FROM learning_events
      WHERE event_type = 'evidence_submitted'
        AND json_extract(payload_json, '$.outputId') = ?
    `).pluck().get(outputId) as number;
  }

  private readReviewHistory(outputId: string): ProfessionalOutputReviewHistoryEntry[] {
    const rows = this.database.prepare(`
      SELECT review.review_id AS reviewId, review.reviewer_id AS reviewerId,
        review.status, review.score, review.feedback,
        review.reviewed_at AS reviewedAt, review.origin,
        CAST((
          SELECT json_extract(event.payload_json, '$.version')
          FROM learning_events AS event
          WHERE json_extract(event.payload_json, '$.reviewId') = review.review_id
          ORDER BY event.occurred_at DESC, event.event_id DESC LIMIT 1
        ) AS INTEGER) AS outputVersion
      FROM output_reviews AS review
      WHERE review.output_id = ?
      ORDER BY review.reviewed_at, review.review_id
    `).all(outputId) as ReviewHistoryRow[];
    return rows.map((row) => ({
      reviewId: row.reviewId,
      reviewerId: row.reviewerId,
      status: row.status,
      ...(row.score === null ? {} : { score: row.score }),
      ...(row.feedback === null ? {} : { feedback: row.feedback }),
      reviewedAt: row.reviewedAt,
      ...(row.outputVersion === null ? {} : { outputVersion: row.outputVersion }),
      origin: row.origin,
    }));
  }

  private readVersion(outputId: string, version: number): VersionRow | undefined {
    return this.database.prepare(`
      SELECT output_id AS outputId, task_id AS taskId, version,
        schema_version AS schemaVersion, fields_json AS fieldsJson,
        upstream_refs_json AS upstreamRefsJson
      FROM professional_output_versions
      WHERE output_id = ? AND version = ?
    `).get(outputId, version) as VersionRow | undefined;
  }

  private readHeadForStudentTask(studentId: string, taskId: P1OutputTaskId): HeadRow | undefined {
    return this.database.prepare(`${headSelect()} WHERE student_id = ? AND task_id = ?`)
      .get(studentId, taskId) as HeadRow | undefined;
  }

  private readHeadById(outputId: string): HeadRow | undefined {
    return this.database.prepare(`${headSelect()} WHERE output_id = ?`)
      .get(outputId) as HeadRow | undefined;
  }

  private requireOwnedHead(outputId: string, studentId: string, taskId: P1OutputTaskId): HeadRow {
    const head = this.readHeadById(outputId);
    if (!head || head.studentId !== studentId || head.taskId !== taskId) {
      throw new ProfessionalOutputNotFoundError(outputId);
    }
    return head;
  }
}

function headSelect(): string {
  return `
    SELECT output_id AS outputId, student_id AS studentId, task_id AS taskId,
      status, current_version AS currentVersion, state_revision AS stateRevision
    FROM professional_outputs
  `;
}

function normalizeWrite(input: WriteProfessionalOutputInput): NormalizedWrite {
  assertNonEmpty('studentId', input.studentId);
  assertTaskId(input.taskId);
  if (input.outputId !== undefined) assertNonEmpty('outputId', input.outputId);
  if (!Number.isSafeInteger(input.expectedStateRevision) || input.expectedStateRevision < 0) {
    throw new TypeError('expectedStateRevision must be a non-negative safe integer.');
  }
  if (!isRecord(input.fields) || Object.keys(input.fields).length === 0) {
    throw new TypeError('fields must be a non-empty object.');
  }
  const fields = Object.fromEntries(Object.entries(input.fields).map(([key, value]) => {
    assertNonEmpty('field name', key);
    if (input.taskId === 'P01' && !isP01OutputFieldKey(key)) {
      throw new TypeError(`Unsupported P01 professional output field: ${key}.`);
    }
    if (typeof value === 'string') return [key, value];
    if (typeof value === 'number' && Number.isFinite(value)) return [key, value];
    if (Array.isArray(value)
      && value.every((item) => typeof item === 'string')) return [key, [...value]];
    throw new TypeError(`Unsupported professional output field: ${key}.`);
  })) as Record<string, ProfessionalOutputFieldValue>;
  if (!Array.isArray(input.upstreamRefs)) throw new TypeError('upstreamRefs must be an array.');
  const seen = new Set<string>();
  const upstreamRefs = input.upstreamRefs.map((reference, index) => {
    if (!isRecord(reference)) throw new TypeError(`upstreamRefs[${index}] must be an object.`);
    const outputId = reference.outputId;
    const version = reference.version;
    assertNonEmpty(`upstreamRefs[${index}].outputId`, outputId as string);
    if (!Number.isSafeInteger(version) || Number(version) <= 0) {
      throw new TypeError(`upstreamRefs[${index}].version must be a positive safe integer.`);
    }
    const identity = `${String(outputId)}:${Number(version)}`;
    if (seen.has(identity)) throw new TypeError('upstreamRefs must be unique.');
    seen.add(identity);
    return { outputId: String(outputId), version: Number(version) };
  });
  const evidenceInput = input.evidenceLinks ?? {};
  if (!isRecord(evidenceInput)) throw new TypeError('evidenceLinks must be an object.');
  if (input.taskId !== 'P01' && Object.keys(evidenceInput).length > 0) {
    throw new ProfessionalOutputEvidenceError(`${input.taskId} does not support P01 evidence links.`);
  }
  const evidenceLinks = Object.fromEntries(Object.entries(evidenceInput).map(([fieldKey, value]) => {
    assertNonEmpty('evidence field name', fieldKey);
    if (!isP01OutputFieldKey(fieldKey)) {
      throw new ProfessionalOutputEvidenceError(`Unknown evidence field: ${fieldKey}.`);
    }
    if (!Array.isArray(value)) {
      throw new TypeError(`evidenceLinks.${fieldKey} must be an array.`);
    }
    const ids = value.map((evidenceId, index) => {
      if (typeof evidenceId !== 'string' || !evidenceId.trim()) {
        throw new TypeError(`evidenceLinks.${fieldKey}[${index}] must be a non-empty string.`);
      }
      return evidenceId.trim();
    });
    return [fieldKey, [...new Set(ids)].sort()];
  })) as Record<P01OutputFieldKey, string[]>;
  return {
    ...(input.outputId === undefined ? {} : { outputId: input.outputId }),
    studentId: input.studentId,
    taskId: input.taskId,
    expectedStateRevision: input.expectedStateRevision,
    fields,
    fieldsJson: stableJson(fields),
    upstreamRefs,
    upstreamRefsJson: stableJson(upstreamRefs),
    evidenceLinks,
    evidenceLinksJson: stableJson(evidenceLinks),
  };
}

function toHead(row: HeadRow): ProfessionalOutputHead {
  return {
    outputId: row.outputId,
    studentId: row.studentId,
    taskId: row.taskId,
    currentVersion: row.currentVersion,
    stateRevision: row.stateRevision,
    status: row.status,
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function normalizeFieldSources(
  sources: ProfessionalOutputFieldSource[],
): ProfessionalOutputFieldSource[] {
  const unique = new Map(sources.map((source) => [
    `${source.fieldKey}\u0000${source.sourceNodeId}\u0000${source.sourceAttemptId}`,
    source,
  ]));
  return [...unique.values()].sort((left, right) => (
    left.fieldKey.localeCompare(right.fieldKey)
    || left.sourceNodeId.localeCompare(right.sourceNodeId)
    || left.sourceAttemptId.localeCompare(right.sourceAttemptId)
  ));
}

function assertTaskId(taskId: string): asserts taskId is P1OutputTaskId {
  if (!['P01', 'P02', 'P03'].includes(taskId)) {
    throw new TypeError(`Unsupported P1 output task: ${String(taskId)}.`);
  }
}

function assertNonEmpty(field: string, value: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-empty string.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
