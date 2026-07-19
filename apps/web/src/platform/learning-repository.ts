import type { AppDatabase } from './db/database.ts';
import {
  SnapshotClock,
  SnapshotTopicNotFoundError,
  type SnapshotTopic,
} from './snapshot-clock.ts';
import type { LearningOrigin } from './learning-origin.ts';
import { readFormalAssessmentLearningFacts } from './formal-assessment-fact-reader.ts';

export type { SnapshotTopic } from './snapshot-clock.ts';
export type LearningChannel = 'self-study' | 'classroom' | 'game';

export interface AppendLearningEventInput {
  eventId: string;
  studentId: string;
  nodeId: string;
  channel: LearningChannel;
  eventType: string;
  payload?: Record<string, unknown>;
  occurredAt?: string;
}

export interface RecordFormalAttemptInput {
  attemptId: string;
  studentId: string;
  nodeId: string;
  assessmentId?: string;
  gameId?: string;
  score: number;
  durationSeconds?: number;
  mistakeKnowledgePointIds?: string[];
  completedAt?: string;
}

export interface StoredLearningEvent {
  eventId: string;
  studentId: string;
  nodeId: string;
  channel: LearningChannel;
  eventType: string;
  payload: unknown;
  occurredAt: string;
  origin: LearningOrigin;
}

export interface StoredPracticeAttempt {
  attemptId: string;
  studentId: string;
  activityId: string;
  nodeId: string;
  passed: boolean;
  response: unknown;
  result: unknown;
  artifact: unknown;
  deliveryChannel: 'self-study' | 'classroom';
  classroomSessionId?: string;
  classroomRunId?: string;
  attemptNumber: number;
  attemptedAt: string;
  origin: LearningOrigin;
}

export interface StoredFormalAttempt {
  attemptId: string;
  studentId: string;
  nodeId: string;
  assessmentId?: string;
  gameId?: string;
  score: number;
  durationSeconds?: number;
  mistakeKnowledgePointIds: string[];
  completedAt: string;
  questionVersion?: string;
  answers: unknown;
  diagnostics: unknown;
  origin: LearningOrigin;
  instanceAssessmentId?: string;
  instanceNodeId?: string;
  instanceGameId?: string;
  instanceQuestionVersion?: string;
  instanceStatus?: string;
}

export interface StoredFormalAssessmentInstance {
  assessmentId: string;
  nodeId: string;
  gameId: string;
  questionVersion: string;
  status: 'preparing' | 'running' | 'closed';
  classroomRunStatus?: 'running' | 'paused' | 'reviewing' | 'closed' | 'expired';
  expiresAt?: string;
  closureReason?: 'submitted' | 'expired' | 'cancelled';
  createdAt: string;
  origin: LearningOrigin;
}

export interface StoredProfessionalOutput {
  outputId: string;
  studentId: string;
  taskId: string;
  nodeId: string;
  status: 'draft' | 'submitted' | 'returned' | 'verified';
  currentVersion: number;
  stateRevision: number;
  content: unknown;
  submittedAt?: string;
  createdAt: string;
  updatedAt: string;
  origin: LearningOrigin;
}

export interface StoredFrozenTaskScore {
  scoreId: string;
  studentId: string;
  taskId: string;
  snapshotVersion: number;
  provisionalScore: number;
  officialScore?: number;
  details: unknown;
  frozenAt: string;
  origin: LearningOrigin;
}

export interface StoredOutputReview {
  reviewId: string;
  outputId: string;
  reviewerId: string;
  status: 'returned' | 'verified';
  score?: number;
  feedback?: string;
  reviewedAt: string;
  outputVersion?: number;
  origin: LearningOrigin;
}

export interface StudentLearningFacts {
  studentId: string;
  version: number;
  globalVersion: number;
  events: StoredLearningEvent[];
  practiceAttempts: StoredPracticeAttempt[];
  assessmentInstances: StoredFormalAssessmentInstance[];
  attempts: StoredFormalAttempt[];
  outputs: StoredProfessionalOutput[];
  outputVersions: StoredProfessionalOutputVersion[];
  reviews: StoredOutputReview[];
  frozenTaskScores: StoredFrozenTaskScore[];
}

export interface ClassStudentLearningFacts {
  classId: string;
  globalVersion: number;
  students: StudentLearningFacts[];
}

export interface LearningWriteResult {
  inserted: boolean;
  version: number;
  globalVersion: number;
}

export class LearningVersionConflictError extends Error {
  readonly topic: `learning:${string}`;
  readonly expectedVersion: number;
  readonly actualVersion: number;

  constructor(topic: `learning:${string}`, expectedVersion: number, actualVersion: number) {
    super(`Learning snapshot version conflict for ${topic}: expected ${expectedVersion}, actual ${actualVersion}.`);
    this.name = 'LearningVersionConflictError';
    this.topic = topic;
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

export class LearningFactIdConflictError extends Error {
  constructor(kind: 'event' | 'attempt', id: string) {
    super(`Learning ${kind} ID is already bound to different facts: ${id}.`);
    this.name = 'LearningFactIdConflictError';
  }
}

interface EventRow {
  eventId: string;
  studentId: string;
  nodeId: string;
  channel: LearningChannel;
  eventType: string;
  payloadJson: string;
  occurredAt: string;
  origin: LearningOrigin;
}

export interface StoredProfessionalOutputVersion {
  outputId: string;
  taskId: string;
  version: number;
}
interface PracticeAttemptRow extends Omit<StoredPracticeAttempt,
  'passed' | 'response' | 'result' | 'artifact' | 'classroomSessionId' | 'classroomRunId'> {
  passed: 0 | 1;
  responseJson: string;
  resultJson: string;
  artifactJson: string;
  classroomSessionId: string | null;
  classroomRunId: string | null;
}

interface FormalAttemptWriteRow {
  studentId: string;
  nodeId: string;
  assessmentId: string | null;
  gameId: string | null;
  score: number;
  durationSeconds: number | null;
  mistakeKnowledgePointIdsJson: string;
  completedAt: string;
}

interface ProfessionalOutputRow {
  outputId: string;
  studentId: string;
  taskId: string;
  nodeId: string;
  status: StoredProfessionalOutput['status'];
  currentVersion: number;
  stateRevision: number;
  contentJson: string;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  origin: LearningOrigin;
}

interface FrozenTaskScoreRow {
  scoreId: string;
  studentId: string;
  taskId: string;
  snapshotVersion: number;
  provisionalScore: number;
  officialScore: number | null;
  detailsJson: string;
  frozenAt: string;
  origin: LearningOrigin;
}

interface OutputReviewRow {
  reviewId: string;
  outputId: string;
  reviewerId: string;
  status: StoredOutputReview['status'];
  score: number | null;
  feedback: string | null;
  reviewedAt: string;
  outputVersion: number | null;
  origin: LearningOrigin;
}

export class LearningRepository {
  private readonly database: AppDatabase;
  private readonly clock: SnapshotClock;

  constructor(database: AppDatabase) {
    this.database = database;
    this.clock = new SnapshotClock(database);
  }

  readTopicVersion(topic: SnapshotTopic): number {
    try {
      return this.clock.read(topic).version;
    } catch (error) {
      if (error instanceof SnapshotTopicNotFoundError) return 0;
      throw error;
    }
  }

  teacherOwnsClass(teacherId: string, classId: string): boolean {
    assertNonEmpty('teacherId', teacherId);
    assertNonEmpty('classId', classId);
    return this.database.prepare(`
      SELECT EXISTS(
        SELECT 1
        FROM classroom_sessions
        WHERE class_id = ? AND teacher_id = ?
      )
    `).pluck().get(classId, teacherId) === 1;
  }

  readClassStudentIds(teacherId: string, classId: string): string[] {
    assertNonEmpty('teacherId', teacherId);
    assertNonEmpty('classId', classId);
    return this.database.prepare(`
      WITH authoritative_session AS (
        SELECT session_id
        FROM classroom_sessions
        WHERE teacher_id = ? AND class_id = ?
        ORDER BY
          CASE status
            WHEN 'active' THEN 0
            WHEN 'paused' THEN 1
            WHEN 'preparing' THEN 2
            ELSE 3
          END,
          updated_at DESC,
          session_id
        LIMIT 1
      )
      SELECT member.student_id
      FROM authoritative_session AS classroom
      INNER JOIN classroom_members AS member
        ON member.session_id = classroom.session_id
      INNER JOIN users AS student
        ON student.id = member.student_id
      WHERE student.role = 'student'
        AND student.is_active = 1
      ORDER BY member.student_id
    `).pluck().all(teacherId, classId) as string[];
  }

  readClassStudentFacts(teacherId: string, classId: string): ClassStudentLearningFacts {
    assertNonEmpty('teacherId', teacherId);
    assertNonEmpty('classId', classId);
    return this.database.transaction(() => {
      const studentIds = this.readClassStudentIds(teacherId, classId);
      const globalVersion = this.readTopicVersion('global');
      const students = studentIds.map((studentId) => {
        const facts = this.readStudentFacts(studentId);
        return { ...facts, globalVersion };
      });
      return { classId, globalVersion, students };
    })();
  }

  studentCanSubmitClassroomEvent(studentId: string, classId: string, nodeId: string): boolean {
    assertNonEmpty('studentId', studentId);
    assertNonEmpty('classId', classId);
    assertNonEmpty('nodeId', nodeId);
    return this.database.prepare(`
      WITH authoritative_session AS (
        SELECT session_id, status, active_node_id
        FROM classroom_sessions
        WHERE class_id = ?
        ORDER BY
          CASE status
            WHEN 'active' THEN 0
            WHEN 'paused' THEN 1
            WHEN 'preparing' THEN 2
            ELSE 3
          END,
          updated_at DESC,
          session_id
        LIMIT 1
      )
      SELECT EXISTS(
        SELECT 1
        FROM authoritative_session AS classroom
        INNER JOIN classroom_members AS member
          ON member.session_id = classroom.session_id
        WHERE member.student_id = ?
          AND classroom.status IN ('active', 'paused')
          AND classroom.active_node_id = ?
      )
    `).pluck().get(classId, studentId, nodeId) === 1;
  }

  appendEvent(input: AppendLearningEventInput, expectedVersion: number): LearningWriteResult {
    const event = normalizeEvent(input);
    assertExpectedVersion(expectedVersion);
    return this.database.transaction(() => {
      const topic = learningTopic(event.studentId);
      const existing = this.readEventRow(event.eventId);
      if (existing) {
        if (!sameEvent(existing, event)) throw new LearningFactIdConflictError('event', event.eventId);
        return this.readWriteResult(topic, false);
      }
      this.assertLearningVersion(topic, expectedVersion);
      this.database.prepare(`
        INSERT INTO learning_events (
          event_id, student_id, node_id, channel, event_type, payload_json, occurred_at, origin
        ) VALUES (
          @eventId, @studentId, @nodeId, @channel, @eventType, @payloadJson,
          COALESCE(@occurredAt, CURRENT_TIMESTAMP), 'user'
        )
      `).run(event);
      this.clock.advance([topic]);
      return this.readWriteResult(topic, true);
    })();
  }

  recordFormalAttempt(input: RecordFormalAttemptInput, expectedVersion: number): LearningWriteResult {
    const attempt = normalizeAttempt(input);
    assertExpectedVersion(expectedVersion);
    return this.database.transaction(() => {
      const topic = learningTopic(attempt.studentId);
      const existing = this.readAttemptRow(attempt.attemptId);
      if (existing) {
        if (!sameAttempt(existing, attempt)) throw new LearningFactIdConflictError('attempt', attempt.attemptId);
        return this.readWriteResult(topic, false);
      }
      this.assertLearningVersion(topic, expectedVersion);
      this.database.prepare(`
        INSERT INTO formal_attempts (
          attempt_id, student_id, node_id, assessment_id, game_id, score, duration_seconds,
          mistake_knowledge_point_ids_json, completed_at, origin
        ) VALUES (
          @attemptId, @studentId, @nodeId, @assessmentId, @gameId, @score, @durationSeconds,
          @mistakeKnowledgePointIdsJson, COALESCE(@completedAt, CURRENT_TIMESTAMP), 'user'
        )
      `).run(attempt);
      this.clock.advance([topic]);
      return this.readWriteResult(topic, true);
    })();
  }

  readStudentFacts(studentId: string): StudentLearningFacts {
    assertNonEmpty('studentId', studentId);
    const readWithinCurrentSnapshot = (): StudentLearningFacts => {
      const topic = learningTopic(studentId);
      const events = this.database.prepare(`
        SELECT
          event_id AS eventId,
          student_id AS studentId,
          node_id AS nodeId,
          channel,
          event_type AS eventType,
          payload_json AS payloadJson,
          occurred_at AS occurredAt
          , origin
        FROM learning_events
        WHERE student_id = ?
        ORDER BY occurred_at, event_id
      `).all(studentId) as EventRow[];
      const practiceAttempts = this.database.prepare(`
        SELECT attempt_id AS attemptId, student_id AS studentId,
          activity_id AS activityId, node_id AS nodeId, passed,
          response_json AS responseJson, result_json AS resultJson,
          artifact_json AS artifactJson, delivery_channel AS deliveryChannel,
          classroom_session_id AS classroomSessionId,
          classroom_run_id AS classroomRunId, attempt_number AS attemptNumber,
          attempted_at AS attemptedAt, origin
        FROM practice_attempts
        WHERE student_id = ?
        ORDER BY attempted_at, attempt_id
      `).all(studentId) as PracticeAttemptRow[];
      const { assessmentInstances, attempts } = readFormalAssessmentLearningFacts(
        this.database,
        studentId,
      );
      const outputs = this.database.prepare(`
        SELECT
          output_id AS outputId,
          student_id AS studentId,
          task_id AS taskId,
          node_id AS nodeId,
          status,
          current_version AS currentVersion,
          state_revision AS stateRevision,
          content_json AS contentJson,
          submitted_at AS submittedAt,
          created_at AS createdAt,
          updated_at AS updatedAt
          , origin
        FROM professional_outputs
        WHERE student_id = ?
        ORDER BY updated_at, output_id
      `).all(studentId) as ProfessionalOutputRow[];
      const outputVersions = this.database.prepare(`
        SELECT version.output_id AS outputId, version.task_id AS taskId, version.version
        FROM professional_output_versions AS version
        INNER JOIN professional_outputs AS output ON output.output_id = version.output_id
        WHERE output.student_id = ?
        ORDER BY version.output_id, version.version
      `).all(studentId) as StoredProfessionalOutputVersion[];
      const reviews = this.database.prepare(`
        SELECT
          review.review_id AS reviewId,
          review.output_id AS outputId,
          review.reviewer_id AS reviewerId,
          review.status,
          review.score,
          review.feedback,
          review.reviewed_at AS reviewedAt,
          CAST((
            SELECT json_extract(event.payload_json, '$.version')
            FROM learning_events AS event
            WHERE json_extract(event.payload_json, '$.reviewId') = review.review_id
            ORDER BY event.occurred_at DESC, event.event_id DESC LIMIT 1
          ) AS INTEGER) AS outputVersion,
          review.origin
        FROM output_reviews AS review
        INNER JOIN professional_outputs AS output
          ON output.output_id = review.output_id
        WHERE output.student_id = ?
        ORDER BY review.reviewed_at, review.review_id
      `).all(studentId) as OutputReviewRow[];
      const frozenTaskScores = this.database.prepare(`
        SELECT
          score_id AS scoreId,
          student_id AS studentId,
          task_id AS taskId,
          snapshot_version AS snapshotVersion,
          provisional_score AS provisionalScore,
          official_score AS officialScore,
          details_json AS detailsJson,
          frozen_at AS frozenAt,
          origin
        FROM frozen_task_scores
        WHERE student_id = ?
        ORDER BY snapshot_version, frozen_at, score_id
      `).all(studentId) as FrozenTaskScoreRow[];
      return {
        studentId,
        version: this.readTopicVersion(topic),
        globalVersion: this.readTopicVersion('global'),
        events: events.map(toStoredEvent),
        practiceAttempts: practiceAttempts.map(toStoredPracticeAttempt),
        assessmentInstances,
        attempts,
        outputs: outputs.map(toStoredOutput),
        outputVersions,
        reviews: reviews.map(toStoredReview),
        frozenTaskScores: frozenTaskScores.map(toStoredFrozenTaskScore),
      };
    };
    return this.database.inTransaction
      ? readWithinCurrentSnapshot()
      : this.database.transaction(readWithinCurrentSnapshot)();
  }

  private assertLearningVersion(topic: `learning:${string}`, expectedVersion: number): void {
    const actualVersion = this.readTopicVersion(topic);
    if (actualVersion !== expectedVersion) {
      throw new LearningVersionConflictError(topic, expectedVersion, actualVersion);
    }
  }

  private readWriteResult(topic: `learning:${string}`, inserted: boolean): LearningWriteResult {
    return {
      inserted,
      version: this.readTopicVersion(topic),
      globalVersion: this.readTopicVersion('global'),
    };
  }

  private readEventRow(eventId: string): EventRow | undefined {
    return this.database.prepare(`
      SELECT
        event_id AS eventId,
        student_id AS studentId,
        node_id AS nodeId,
        channel,
        event_type AS eventType,
        payload_json AS payloadJson,
        occurred_at AS occurredAt
        , origin
      FROM learning_events
      WHERE event_id = ?
    `).get(eventId) as EventRow | undefined;
  }

  private readAttemptRow(attemptId: string): FormalAttemptWriteRow | undefined {
    return this.database.prepare(`
      SELECT
        attempt_id AS attemptId,
        student_id AS studentId,
        node_id AS nodeId,
        assessment_id AS assessmentId,
        game_id AS gameId,
        score,
        duration_seconds AS durationSeconds,
        mistake_knowledge_point_ids_json AS mistakeKnowledgePointIdsJson,
        completed_at AS completedAt
        , question_version AS questionVersion,
        answers_json AS answersJson,
        diagnostics_json AS diagnosticsJson,
        origin
      FROM formal_attempts
      WHERE attempt_id = ?
    `).get(attemptId) as FormalAttemptWriteRow | undefined;
  }
}

function normalizeEvent(input: AppendLearningEventInput) {
  assertNonEmpty('eventId', input.eventId);
  assertNonEmpty('studentId', input.studentId);
  assertNonEmpty('nodeId', input.nodeId);
  assertNonEmpty('eventType', input.eventType);
  if (!['self-study', 'classroom', 'game'].includes(input.channel)) {
    throw new TypeError(`Unsupported learning channel: ${String(input.channel)}.`);
  }
  const occurredAt = normalizeOptionalTimestamp('occurredAt', input.occurredAt);
  const payload = input.payload ?? {};
  return {
    eventId: input.eventId,
    studentId: input.studentId,
    nodeId: input.nodeId,
    channel: input.channel,
    eventType: input.eventType,
    payloadJson: serializeJson('payload', payload),
    occurredAt,
  };
}

function sameEvent(existing: EventRow, candidate: ReturnType<typeof normalizeEvent>): boolean {
  return existing.studentId === candidate.studentId
    && existing.nodeId === candidate.nodeId
    && existing.channel === candidate.channel
    && existing.eventType === candidate.eventType
    && existing.payloadJson === candidate.payloadJson
    && (candidate.occurredAt === null || existing.occurredAt === candidate.occurredAt);
}

function normalizeAttempt(input: RecordFormalAttemptInput) {
  assertNonEmpty('attemptId', input.attemptId);
  assertNonEmpty('studentId', input.studentId);
  assertNonEmpty('nodeId', input.nodeId);
  if (input.assessmentId !== undefined) assertNonEmpty('assessmentId', input.assessmentId);
  if (input.gameId !== undefined) assertNonEmpty('gameId', input.gameId);
  if (!Number.isFinite(input.score) || input.score < 0 || input.score > 100) {
    throw new TypeError('score must be a finite number from 0 through 100.');
  }
  if (input.durationSeconds !== undefined
    && (!Number.isSafeInteger(input.durationSeconds) || input.durationSeconds < 0)) {
    throw new TypeError('durationSeconds must be a non-negative safe integer.');
  }
  const mistakeKnowledgePointIds = input.mistakeKnowledgePointIds ?? [];
  if (!Array.isArray(mistakeKnowledgePointIds)
    || mistakeKnowledgePointIds.some((id) => typeof id !== 'string' || id.trim().length === 0)) {
    throw new TypeError('mistakeKnowledgePointIds must contain non-empty strings.');
  }
  return {
    attemptId: input.attemptId,
    studentId: input.studentId,
    nodeId: input.nodeId,
    assessmentId: input.assessmentId ?? null,
    gameId: input.gameId ?? null,
    score: input.score,
    durationSeconds: input.durationSeconds ?? null,
    mistakeKnowledgePointIdsJson: serializeJson('mistakeKnowledgePointIds', mistakeKnowledgePointIds),
    completedAt: normalizeOptionalTimestamp('completedAt', input.completedAt),
  };
}

function sameAttempt(existing: FormalAttemptWriteRow, candidate: ReturnType<typeof normalizeAttempt>): boolean {
  return existing.studentId === candidate.studentId
    && existing.nodeId === candidate.nodeId
    && existing.assessmentId === candidate.assessmentId
    && existing.gameId === candidate.gameId
    && existing.score === candidate.score
    && existing.durationSeconds === candidate.durationSeconds
    && existing.mistakeKnowledgePointIdsJson === candidate.mistakeKnowledgePointIdsJson
    && (candidate.completedAt === null || existing.completedAt === candidate.completedAt);
}

function toStoredEvent(row: EventRow): StoredLearningEvent {
  return {
    eventId: row.eventId,
    studentId: row.studentId,
    nodeId: row.nodeId,
    channel: row.channel,
    eventType: row.eventType,
    payload: parseJson(row.payloadJson),
    occurredAt: row.occurredAt,
    origin: row.origin,
  };
}

function toStoredPracticeAttempt(row: PracticeAttemptRow): StoredPracticeAttempt {
  return {
    attemptId: row.attemptId,
    studentId: row.studentId,
    activityId: row.activityId,
    nodeId: row.nodeId,
    passed: row.passed === 1,
    response: parseJson(row.responseJson),
    result: parseJson(row.resultJson),
    artifact: parseJson(row.artifactJson),
    deliveryChannel: row.deliveryChannel,
    ...(row.classroomSessionId === null ? {} : { classroomSessionId: row.classroomSessionId }),
    ...(row.classroomRunId === null ? {} : { classroomRunId: row.classroomRunId }),
    attemptNumber: row.attemptNumber,
    attemptedAt: row.attemptedAt,
    origin: row.origin,
  };
}

function toStoredOutput(row: ProfessionalOutputRow): StoredProfessionalOutput {
  return {
    outputId: row.outputId,
    studentId: row.studentId,
    taskId: row.taskId,
    nodeId: row.nodeId,
    status: row.status,
    currentVersion: row.currentVersion,
    stateRevision: row.stateRevision,
    content: parseJson(row.contentJson),
    ...(row.submittedAt === null ? {} : { submittedAt: row.submittedAt }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    origin: row.origin,
  };
}

function toStoredFrozenTaskScore(row: FrozenTaskScoreRow): StoredFrozenTaskScore {
  return {
    scoreId: row.scoreId,
    studentId: row.studentId,
    taskId: row.taskId,
    snapshotVersion: row.snapshotVersion,
    provisionalScore: row.provisionalScore,
    ...(row.officialScore === null ? {} : { officialScore: row.officialScore }),
    details: parseJson(row.detailsJson),
    frozenAt: row.frozenAt,
    origin: row.origin,
  };
}

function toStoredReview(row: OutputReviewRow): StoredOutputReview {
  return {
    reviewId: row.reviewId,
    outputId: row.outputId,
    reviewerId: row.reviewerId,
    status: row.status,
    ...(row.score === null ? {} : { score: row.score }),
    ...(row.feedback === null ? {} : { feedback: row.feedback }),
    reviewedAt: row.reviewedAt,
    ...(row.outputVersion === null ? {} : { outputVersion: row.outputVersion }),
    origin: row.origin,
  };
}

function learningTopic(studentId: string): `learning:${string}` {
  return `learning:${studentId}`;
}

function assertExpectedVersion(version: number): void {
  if (!Number.isSafeInteger(version) || version < 0) {
    throw new TypeError('expectedVersion must be a non-negative safe integer.');
  }
}

function assertNonEmpty(field: string, value: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-empty string.`);
  }
}

function normalizeOptionalTimestamp(field: string, value: string | undefined): string | null {
  if (value === undefined) return null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new TypeError(`${field} must be a valid timestamp.`);
  }
  return value;
}

function serializeJson(field: string, value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new TypeError();
    return serialized;
  } catch {
    throw new TypeError(`${field} must be JSON serializable.`);
  }
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
