import { randomUUID } from 'node:crypto';
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

export interface ProfessionalOutputVersion {
  outputId: string;
  taskId: P1OutputTaskId;
  version: number;
  schemaVersion: 1;
  fields: Record<string, ProfessionalOutputFieldValue>;
  upstreamRefs: ProfessionalOutputUpstreamRef[];
}

export interface ProfessionalOutputAggregate {
  head: ProfessionalOutputHead;
  versions: ProfessionalOutputVersion[];
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
}

export class ProfessionalOutputUpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProfessionalOutputUpstreamError';
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

interface NormalizedWrite {
  outputId?: string;
  studentId: string;
  taskId: P1OutputTaskId;
  expectedStateRevision: number;
  fields: Record<string, ProfessionalOutputFieldValue>;
  fieldsJson: string;
  upstreamRefs: ProfessionalOutputUpstreamRef[];
  upstreamRefsJson: string;
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
      const outputId = head?.outputId ?? command.outputId ?? this.createOutputId();
      assertNonEmpty('outputId', outputId);
      const currentVersion = head?.currentVersion ?? 0;
      const current = currentVersion > 0
        ? this.readVersion(outputId, currentVersion)
        : undefined;
      const appendVersion = !current
        || current.fieldsJson !== command.fieldsJson
        || current.upstreamRefsJson !== command.upstreamRefsJson;
      const nextVersion = appendVersion ? currentVersion + 1 : currentVersion;
      const nextRevision = actualRevision + 1;
      const nodeId = outputNodeByTask[command.taskId];

      if (!head) {
        this.database.prepare(`
          INSERT INTO professional_outputs (
            output_id, student_id, task_id, node_id, status, content_json,
            submitted_at, current_version, state_revision, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
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
              state_revision = ?, updated_at = CURRENT_TIMESTAMP
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
        event_id, student_id, node_id, channel, event_type, payload_json
      ) VALUES (?, ?, ?, 'self-study', ?, ?)
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
      versions: rows.map(toVersion),
    };
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
  return {
    ...(input.outputId === undefined ? {} : { outputId: input.outputId }),
    studentId: input.studentId,
    taskId: input.taskId,
    expectedStateRevision: input.expectedStateRevision,
    fields,
    fieldsJson: stableJson(fields),
    upstreamRefs,
    upstreamRefsJson: stableJson(upstreamRefs),
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

function toVersion(row: VersionRow): ProfessionalOutputVersion {
  return {
    outputId: row.outputId,
    taskId: row.taskId,
    version: row.version,
    schemaVersion: row.schemaVersion,
    fields: JSON.parse(row.fieldsJson) as Record<string, ProfessionalOutputFieldValue>,
    upstreamRefs: JSON.parse(row.upstreamRefsJson) as ProfessionalOutputUpstreamRef[],
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
