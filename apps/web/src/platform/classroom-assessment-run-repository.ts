import { randomUUID } from 'node:crypto';
import type { AppDatabase } from './db/database.ts';
import { getFormalAssessmentDefinitions } from './formal-assessment-catalog.server.ts';
import { SnapshotClock, type ScopedSnapshotTopic } from './snapshot-clock.ts';
import { parseTeachingCursorJson } from './teaching-cursor.ts';

export type ClassroomAssessmentRunStatus =
  | 'running'
  | 'paused'
  | 'reviewing'
  | 'closed'
  | 'expired';

export interface StoredClassroomAssessmentRun {
  runId: string;
  lessonRunId: string;
  sessionId: string;
  nodeId: string;
  gameId: string;
  status: ClassroomAssessmentRunStatus;
  startedAt: string;
  expiresAt: string;
  remainingSecondsWhenPaused?: number;
  reviewStartedAt?: string;
  closedAt?: string;
  closedReason?: 'all-submitted' | 'time-expired' | 'teacher-collected' | 'lesson-ended';
  revision: number;
}

export class ClassroomAssessmentRunConflictError extends Error {
  override readonly name = 'ClassroomAssessmentRunConflictError';
}

export class ClassroomAssessmentRunRevisionConflictError extends Error {
  override readonly name = 'ClassroomAssessmentRunRevisionConflictError';

  constructor(
    readonly expectedRevision: number,
    readonly currentRevision: number,
  ) {
    super(`Classroom assessment revision conflict: expected ${expectedRevision}, current ${currentRevision}.`);
  }
}

interface RepositoryOptions {
  randomId?: () => string;
}

interface StartAuthorityRow {
  classroomRevision: number;
  activeLessonRunId: string | null;
  lessonStatus: string;
  lessonRevision: number;
  lessonNodeId: string;
  teachingCursorJson: string;
}

interface AssessmentRunRow {
  run_id: string;
  lesson_run_id: string;
  session_id: string;
  node_id: string;
  game_id: string;
  status: ClassroomAssessmentRunStatus;
  started_at: string;
  expires_at: string;
  remaining_seconds_when_paused: number | null;
  review_started_at: string | null;
  closed_at: string | null;
  closed_reason: StoredClassroomAssessmentRun['closedReason'] | null;
  revision: number;
}

export class ClassroomAssessmentRunRepository {
  private readonly randomId: () => string;
  private readonly clock: SnapshotClock;

  constructor(
    private readonly database: AppDatabase,
    options: RepositoryOptions = {},
  ) {
    this.randomId = options.randomId ?? randomUUID;
    this.clock = new SnapshotClock(database);
  }

  readRun(runId: string): StoredClassroomAssessmentRun | undefined {
    const row = this.database.prepare(`
      SELECT run_id, lesson_run_id, session_id, node_id, game_id, status,
        started_at, expires_at, remaining_seconds_when_paused,
        review_started_at, closed_at, closed_reason, revision
      FROM classroom_assessment_runs WHERE run_id = ?
    `).get(runId) as AssessmentRunRow | undefined;
    return row ? runFromRow(row) : undefined;
  }

  readOpenRun(lessonRunId: string): StoredClassroomAssessmentRun | undefined {
    const row = this.database.prepare(`
      SELECT run_id, lesson_run_id, session_id, node_id, game_id, status,
        started_at, expires_at, remaining_seconds_when_paused,
        review_started_at, closed_at, closed_reason, revision
      FROM classroom_assessment_runs
      WHERE lesson_run_id = ? AND status IN ('running', 'paused', 'reviewing')
      ORDER BY julianday(started_at) DESC, run_id DESC LIMIT 1
    `).get(lessonRunId) as AssessmentRunRow | undefined;
    return row ? runFromRow(row) : undefined;
  }

  startRun(
    input: {
      sessionId: string;
      lessonRunId: string;
      nodeId: string;
      gameId: string;
      expectedClassroomRevision: number;
      durationSeconds: number;
    },
    now = new Date(),
  ): StoredClassroomAssessmentRun {
    if (!Number.isInteger(input.expectedClassroomRevision) || input.expectedClassroomRevision < 0) {
      throw new TypeError('expectedClassroomRevision must be a non-negative integer.');
    }
    if (!Number.isInteger(input.durationSeconds) || input.durationSeconds <= 0) {
      throw new TypeError('durationSeconds must be a positive integer.');
    }
    const at = now.toISOString();
    const expiresAt = new Date(now.getTime() + input.durationSeconds * 1_000).toISOString();
    const runId = `assessment-run-${this.randomId()}`;

    return this.database.transaction(() => {
      const authority = this.database.prepare(`
        SELECT classroom.revision AS classroomRevision,
          classroom.active_lesson_run_id AS activeLessonRunId,
          lesson.status AS lessonStatus, lesson.revision AS lessonRevision,
          lesson.node_id AS lessonNodeId, lesson.teaching_cursor_json AS teachingCursorJson
        FROM classroom_sessions AS classroom
        INNER JOIN classroom_lesson_runs AS lesson
          ON lesson.session_id = classroom.session_id AND lesson.lesson_run_id = ?
        WHERE classroom.session_id = ?
      `).get(input.lessonRunId, input.sessionId) as StartAuthorityRow | undefined;
      if (!authority) throw new ClassroomAssessmentRunConflictError('Active lesson run not found.');
      const currentRevision = Math.max(authority.classroomRevision, authority.lessonRevision);
      if (authority.classroomRevision !== input.expectedClassroomRevision
        || authority.lessonRevision !== input.expectedClassroomRevision) {
        throw new ClassroomAssessmentRunRevisionConflictError(
          input.expectedClassroomRevision,
          currentRevision,
        );
      }
      const cursor = parseTeachingCursorJson(authority.teachingCursorJson);
      if (authority.activeLessonRunId !== input.lessonRunId
        || authority.lessonStatus !== 'active'
        || authority.lessonNodeId !== input.nodeId
        || cursor?.lessonRunId !== input.lessonRunId
        || cursor?.phase !== 'assessment'
        || cursor.nodeId !== input.nodeId) {
        throw new ClassroomAssessmentRunConflictError(
          'Assessment requires the active lesson at its matching assessment cursor.',
        );
      }
      const gameMatches = getFormalAssessmentDefinitions(input.nodeId)
        .some((definition) => definition.gameId === input.gameId);
      if (!gameMatches) {
        throw new ClassroomAssessmentRunConflictError('Assessment game does not match the teaching cursor node.');
      }
      if (this.readOpenRun(input.lessonRunId)) {
        throw new ClassroomAssessmentRunConflictError('Only one assessment run may be open per lesson.');
      }
      const pendingReview = this.database.prepare(`
        SELECT EXISTS(
          SELECT 1 FROM classroom_assessment_runs AS prior
          WHERE prior.lesson_run_id = ? AND prior.session_id = ?
            AND prior.status IN ('closed', 'expired')
            AND prior.review_started_at IS NULL
            AND EXISTS (
              SELECT 1 FROM formal_assessment_instances AS instance
              INNER JOIN formal_attempts AS attempt
                ON attempt.assessment_id = instance.assessment_id AND attempt.origin = 'user'
              WHERE instance.classroom_run_id = prior.run_id
                AND instance.closure_reason = 'submitted'
            )
        )
      `).pluck().get(input.lessonRunId, input.sessionId) === 1;
      if (pendingReview) {
        throw new ClassroomAssessmentRunConflictError(
          'Review and collect the prior submitted assessment before starting another run.',
        );
      }
      this.database.prepare(`
        INSERT INTO classroom_assessment_runs (
          run_id, lesson_run_id, session_id, node_id, game_id, status,
          started_at, expires_at, revision
        ) VALUES (?, ?, ?, ?, ?, 'running', ?, ?, 0)
      `).run(
        runId, input.lessonRunId, input.sessionId, input.nodeId, input.gameId, at, expiresAt,
      );
      const started = this.readRun(runId);
      if (!started) throw new Error('Assessment run insert was not readable.');
      this.clock.advance([`classroom:${input.sessionId}`], at);
      return started;
    }).immediate();
  }

  pauseRun(runId: string, expectedRevision: number, now = new Date()): StoredClassroomAssessmentRun {
    return this.transition(runId, expectedRevision, (current) => {
      if (current.status !== 'running') {
        throw new ClassroomAssessmentRunConflictError('Only a running assessment can be paused.');
      }
      const remaining = Math.max(0, Math.ceil((Date.parse(current.expiresAt) - now.getTime()) / 1_000));
      if (remaining === 0) {
        throw new ClassroomAssessmentRunConflictError('Expired assessment cannot be paused.');
      }
      this.database.prepare(`
        UPDATE classroom_assessment_runs
        SET status = 'paused', remaining_seconds_when_paused = ?, revision = revision + 1
        WHERE run_id = ? AND revision = ? AND status = 'running'
      `).run(remaining, runId, expectedRevision);
      this.database.prepare(`
        UPDATE formal_assessment_tokens SET used_at = ?
        WHERE used_at IS NULL AND assessment_id IN (
          SELECT assessment_id FROM formal_assessment_instances
          WHERE classroom_run_id = ? AND status = 'running'
        )
      `).run(now.toISOString(), runId);
    }, false, now);
  }

  resumeRun(runId: string, expectedRevision: number, now = new Date()): StoredClassroomAssessmentRun {
    return this.transition(runId, expectedRevision, (current) => {
      if (current.status !== 'paused' || current.remainingSecondsWhenPaused === undefined) {
        throw new ClassroomAssessmentRunConflictError('Only a paused assessment can be resumed.');
      }
      const expiresAt = new Date(
        now.getTime() + current.remainingSecondsWhenPaused * 1_000,
      ).toISOString();
      this.database.prepare(`
        UPDATE classroom_assessment_runs
        SET status = 'running', expires_at = ?, remaining_seconds_when_paused = NULL,
          revision = revision + 1
        WHERE run_id = ? AND revision = ? AND status = 'paused'
      `).run(expiresAt, runId, expectedRevision);
      this.database.prepare(`
        UPDATE formal_assessment_instances SET expires_at = ?
        WHERE classroom_run_id = ? AND status = 'running'
      `).run(expiresAt, runId);
    }, false, now);
  }

  collectRun(runId: string, expectedRevision: number, now = new Date()): StoredClassroomAssessmentRun {
    return this.transition(runId, expectedRevision, (current) => {
      if (!['running', 'paused', 'reviewing'].includes(current.status)) {
        throw new ClassroomAssessmentRunConflictError('Assessment run is not collectable.');
      }
      const at = now.toISOString();
      this.database.prepare(`
        UPDATE classroom_assessment_runs
        SET status = 'closed', closed_at = ?, closed_reason = 'teacher-collected',
          remaining_seconds_when_paused = NULL, revision = revision + 1
        WHERE run_id = ? AND revision = ? AND status IN ('running', 'paused', 'reviewing')
      `).run(at, runId, expectedRevision);
      this.closeOpenInstances(runId, at, 'cancelled');
    }, false, now);
  }

  expireIfDue(runId: string, now = new Date()): StoredClassroomAssessmentRun {
    const transaction = this.database.transaction(() => {
      const current = this.requireRun(runId);
      if (current.status !== 'running' || Date.parse(current.expiresAt) > now.getTime()) return current;
      const at = now.toISOString();
      this.database.prepare(`
        UPDATE classroom_assessment_runs
        SET status = 'expired', closed_at = ?, closed_reason = 'time-expired',
          remaining_seconds_when_paused = NULL, revision = revision + 1
        WHERE run_id = ? AND revision = ? AND status = 'running'
      `).run(at, runId, current.revision);
      this.closeOpenInstances(runId, at, 'expired');
      this.clock.advance([`classroom:${current.sessionId}`], at);
      return this.requireRun(runId);
    });
    return transaction.immediate();
  }

  beginReview(runId: string, expectedRevision: number, now = new Date()): StoredClassroomAssessmentRun {
    return this.transition(runId, expectedRevision, (current) => {
      if (current.reviewStartedAt && current.status !== 'reviewing') {
        throw new ClassroomAssessmentRunConflictError(
          'A completed review cannot be reopened after collection.',
        );
      }
      const counts = this.readSubmissionCounts(runId);
      const mayReview = counts.submitted > 0 && (
        counts.submitted === counts.eligible
        || current.status === 'expired'
        || current.closedReason === 'teacher-collected'
      );
      if (!mayReview) {
        throw new ClassroomAssessmentRunConflictError(
          'Review requires a submission and completion, expiry, or teacher collection.',
        );
      }
      if (current.status === 'reviewing') return;
      if (!['running', 'paused', 'closed', 'expired'].includes(current.status)) {
        throw new ClassroomAssessmentRunConflictError('Assessment run cannot enter review.');
      }
      this.database.prepare(`
        UPDATE classroom_assessment_runs
        SET status = 'reviewing', review_started_at = ?,
          remaining_seconds_when_paused = NULL, revision = revision + 1
        WHERE run_id = ? AND revision = ?
          AND status IN ('running', 'paused', 'closed', 'expired')
      `).run(now.toISOString(), runId, expectedRevision);
    }, true, now);
  }

  readSubmissionCounts(runId: string): { eligible: number; submitted: number } {
    const row = this.database.prepare(`
      SELECT COUNT(*) AS eligible,
        SUM(CASE WHEN instance.status = 'closed' AND instance.closure_reason = 'submitted'
          AND EXISTS (
            SELECT 1 FROM formal_attempts AS attempt
            WHERE attempt.assessment_id = instance.assessment_id AND attempt.origin = 'user'
          ) THEN 1 ELSE 0 END) AS submitted
      FROM formal_assessment_instances AS instance
      WHERE instance.classroom_run_id = ?
    `).get(runId) as { eligible: number; submitted: number | null };
    return { eligible: Number(row.eligible), submitted: Number(row.submitted ?? 0) };
  }

  private transition(
    runId: string,
    expectedRevision: number,
    mutate: (current: StoredClassroomAssessmentRun) => void,
    allowTerminalNoop = false,
    snapshotAt = new Date(),
  ): StoredClassroomAssessmentRun {
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
      throw new TypeError('expectedRevision must be a non-negative integer.');
    }
    return this.database.transaction(() => {
      const current = this.requireRun(runId);
      if (current.revision !== expectedRevision) {
        throw new ClassroomAssessmentRunRevisionConflictError(expectedRevision, current.revision);
      }
      const before = current.revision;
      mutate(current);
      const next = this.requireRun(runId);
      if (next.revision === before + 1) {
        this.clock.advance([`classroom:${next.sessionId}`], snapshotAt.toISOString());
      } else if (!allowTerminalNoop) {
        throw new ClassroomAssessmentRunRevisionConflictError(expectedRevision, next.revision);
      }
      return next;
    }).immediate();
  }

  private requireRun(runId: string): StoredClassroomAssessmentRun {
    const run = this.readRun(runId);
    if (!run) throw new ClassroomAssessmentRunConflictError('Assessment run not found.');
    return run;
  }

  private closeOpenInstances(
    runId: string,
    at: string,
    reason: 'expired' | 'cancelled',
  ): void {
    this.database.prepare(`
      UPDATE formal_assessment_instances
      SET status = 'closed', closed_at = ?, closure_reason = ?
      WHERE classroom_run_id = ? AND status = 'running'
    `).run(at, reason, runId);
    this.database.prepare(`
      UPDATE formal_assessment_tokens SET used_at = ?
      WHERE used_at IS NULL AND assessment_id IN (
        SELECT assessment_id FROM formal_assessment_instances WHERE classroom_run_id = ?
      )
    `).run(at, runId);
  }
}

function runFromRow(row: AssessmentRunRow): StoredClassroomAssessmentRun {
  return {
    runId: row.run_id,
    lessonRunId: row.lesson_run_id,
    sessionId: row.session_id,
    nodeId: row.node_id,
    gameId: row.game_id,
    status: row.status,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    ...(row.remaining_seconds_when_paused === null
      ? {} : { remainingSecondsWhenPaused: row.remaining_seconds_when_paused }),
    ...(row.review_started_at ? { reviewStartedAt: row.review_started_at } : {}),
    ...(row.closed_at ? { closedAt: row.closed_at } : {}),
    ...(row.closed_reason ? { closedReason: row.closed_reason } : {}),
    revision: row.revision,
  };
}

export function recordClassroomAssessmentSubmission(
  database: AppDatabase,
  input: {
    classroomRunId: string | null;
    classroomSessionId: string | null;
    studentId: string;
    completedAt: string;
  },
): ScopedSnapshotTopic[] {
  if (input.classroomRunId) {
    const openInstances = Number(database.prepare(`
      SELECT COUNT(*) FROM formal_assessment_instances
      WHERE classroom_run_id = ? AND status = 'running'
    `).pluck().get(input.classroomRunId));
    if (openInstances === 0) {
      database.prepare(`
        UPDATE classroom_assessment_runs
        SET status = 'closed', closed_at = ?, closed_reason = 'all-submitted',
          remaining_seconds_when_paused = NULL, revision = revision + 1
        WHERE run_id = ? AND status = 'running'
      `).run(input.completedAt, input.classroomRunId);
    }
  }
  return [
    `learning:${input.studentId}`,
    ...(input.classroomRunId && input.classroomSessionId
      ? [`classroom:${input.classroomSessionId}` as const] : []),
  ];
}
