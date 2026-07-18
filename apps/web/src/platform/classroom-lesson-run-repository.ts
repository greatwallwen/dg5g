import { randomUUID } from 'node:crypto';
import type { AppDatabase } from './db/database.ts';
import type { ClassroomCommand } from './models.ts';
import { SnapshotClock } from './snapshot-clock.ts';
import {
  createInitialTeachingCursor,
  parseTeachingCursor,
  parseTeachingCursorJson,
  type ClassroomLessonId,
  type ClassroomLessonRunStatus,
  type TeachingCursor,
} from './teaching-cursor.ts';
export type { ClassroomLessonRunStatus } from './teaching-cursor.ts';

export interface StoredClassroomLessonRun {
  lessonRunId: string;
  sessionId: string;
  lessonId: ClassroomLessonId;
  taskId: TeachingCursor['taskId'];
  nodeId: string;
  status: ClassroomLessonRunStatus;
  teachingCursor: TeachingCursor;
  revision: number;
  startedAt?: string;
  pausedAt?: string;
  closedAt?: string;
  createdAt: string;
}

export class ClassroomLessonRunNotFoundError extends Error {
  override readonly name = 'ClassroomLessonRunNotFoundError';

  constructor(id: string) {
    super(`Classroom lesson run not found: ${id}`);
  }
}

export class ClassroomLessonRunRevisionConflictError extends Error {
  override readonly name = 'ClassroomLessonRunRevisionConflictError';

  constructor(
    readonly sessionId: string,
    readonly expectedRevision: number,
    readonly currentRevision: number,
  ) {
    super(`Classroom lesson revision conflict: expected ${expectedRevision}, current ${currentRevision}.`);
  }
}

export class ClassroomLessonRunConflictError extends Error {
  override readonly name = 'ClassroomLessonRunConflictError';
}

export interface LessonRunTransitionContext {
  database: AppDatabase;
  run: StoredClassroomLessonRun;
  at: string;
}

export type TeachingCursorMutation = Omit<
  TeachingCursor,
  'lessonRunId' | 'lessonId' | 'taskId' | 'revision' | 'updatedAt'
>;

export type BeforeLessonRunClose = (context: LessonRunTransitionContext) => void;

type LessonRunRow = {
  lesson_run_id: string;
  session_id: string;
  lesson_id: string;
  task_id: string;
  node_id: string;
  status: ClassroomLessonRunStatus;
  teaching_cursor_json: string;
  revision: number;
  started_at: string | null;
  paused_at: string | null;
  closed_at: string | null;
  created_at: string;
};

type SessionAuthorityRow = {
  revision: number;
  active_lesson_run_id: string | null;
};

export class ClassroomLessonRunRepository {
  private readonly clock: SnapshotClock;

  constructor(private readonly database: AppDatabase) {
    this.clock = new SnapshotClock(database);
  }

  readLessonRun(lessonRunId: string): StoredClassroomLessonRun | undefined {
    const row = this.database.prepare(`
      SELECT lesson_run_id, session_id, lesson_id, task_id, node_id, status,
        teaching_cursor_json, revision, started_at, paused_at, closed_at, created_at
      FROM classroom_lesson_runs
      WHERE lesson_run_id = ?
    `).get(lessonRunId) as LessonRunRow | undefined;
    return row ? lessonRunFromRow(row) : undefined;
  }

  readOpenLessonRun(sessionId: string): StoredClassroomLessonRun | undefined {
    const row = this.database.prepare(`
      SELECT lesson_run_id, session_id, lesson_id, task_id, node_id, status,
        teaching_cursor_json, revision, started_at, paused_at, closed_at, created_at
      FROM classroom_lesson_runs
      WHERE session_id = ? AND status IN ('preparing', 'active', 'paused')
      ORDER BY julianday(created_at) DESC, lesson_run_id DESC
      LIMIT 1
    `).get(sessionId) as LessonRunRow | undefined;
    return row ? lessonRunFromRow(row) : undefined;
  }

  readLatestLessonRun(sessionId: string): StoredClassroomLessonRun | undefined {
    const row = this.database.prepare(`
      SELECT lesson_run_id, session_id, lesson_id, task_id, node_id, status,
        teaching_cursor_json, revision, started_at, paused_at, closed_at, created_at
      FROM classroom_lesson_runs
      WHERE session_id = ?
      ORDER BY revision DESC, julianday(created_at) DESC, lesson_run_id DESC
      LIMIT 1
    `).get(sessionId) as LessonRunRow | undefined;
    return row ? lessonRunFromRow(row) : undefined;
  }

  startLessonRun(
    input: {
      sessionId: string;
      lessonId: ClassroomLessonId;
      expectedRevision: number;
    },
    now = new Date(),
  ): { run: StoredClassroomLessonRun; command: ClassroomCommand } {
    assertExpectedRevision(input.expectedRevision);
    const at = now.toISOString();
    const nextRevision = input.expectedRevision + 1;
    const lessonRunId = `lesson-run-${randomUUID()}`;
    const teachingCursor = createInitialTeachingCursor({
      lessonRunId,
      lessonId: input.lessonId,
      revision: nextRevision,
      now,
    });
    const command = createCommand(
      input.sessionId,
      nextRevision,
      teachingCursor,
      'prepare',
      now,
    );

    const transaction = this.database.transaction(() => {
      const session = this.readSessionAuthority(input.sessionId);
      if (session.revision !== input.expectedRevision) {
        throw new ClassroomLessonRunRevisionConflictError(
          input.sessionId,
          input.expectedRevision,
          session.revision,
        );
      }
      if (session.active_lesson_run_id || this.readOpenLessonRun(input.sessionId)) {
        throw new ClassroomLessonRunConflictError('Close the open lesson run before starting another lesson.');
      }

      this.database.prepare(`
        INSERT INTO classroom_lesson_runs (
          lesson_run_id, session_id, lesson_id, task_id, node_id, status,
          teaching_cursor_json, revision, created_at
        ) VALUES (?, ?, ?, ?, ?, 'preparing', ?, ?, ?)
      `).run(
        lessonRunId,
        input.sessionId,
        teachingCursor.lessonId,
        teachingCursor.taskId,
        teachingCursor.nodeId,
        JSON.stringify(teachingCursor),
        nextRevision,
        at,
      );
      const sessionMutation = this.database.prepare(`
        UPDATE classroom_sessions
        SET status = 'preparing', active_node_id = ?, active_unit_id = ?,
          active_lesson_run_id = ?, revision = revision + 1, updated_at = ?
        WHERE session_id = ? AND revision = ? AND active_lesson_run_id IS NULL
      `).run(
        teachingCursor.nodeId,
        teachingCursor.unitId,
        lessonRunId,
        at,
        input.sessionId,
        input.expectedRevision,
      );
      if (sessionMutation.changes !== 1) {
        const current = this.readSessionAuthority(input.sessionId);
        if (current.revision !== input.expectedRevision) {
          throw new ClassroomLessonRunRevisionConflictError(
            input.sessionId,
            input.expectedRevision,
            current.revision,
          );
        }
        throw new ClassroomLessonRunConflictError('Close the open lesson run before starting another lesson.');
      }
      this.insertCommand(command);
      this.clock.advance([`classroom:${input.sessionId}`], at);
      const run = this.readLessonRun(lessonRunId);
      if (!run) throw new ClassroomLessonRunNotFoundError(lessonRunId);
      return { run, command };
    });
    return transaction.immediate();
  }

  transitionLessonRun(
    input: {
      sessionId: string;
      lessonRunId: string;
      expectedRevision: number;
      nextStatus: ClassroomLessonRunStatus;
    },
    now = new Date(),
    beforeClose?: BeforeLessonRunClose,
  ): { run: StoredClassroomLessonRun; command: ClassroomCommand } {
    assertExpectedRevision(input.expectedRevision);
    const at = now.toISOString();
    const transaction = this.database.transaction(() => {
      const session = this.readSessionAuthority(input.sessionId);
      const current = this.readLessonRun(input.lessonRunId);
      if (!current || current.sessionId !== input.sessionId) {
        throw new ClassroomLessonRunNotFoundError(input.lessonRunId);
      }
      if (session.revision !== input.expectedRevision || current.revision !== input.expectedRevision) {
        throw new ClassroomLessonRunRevisionConflictError(
          input.sessionId,
          input.expectedRevision,
          Math.max(session.revision, current.revision),
        );
      }
      if (current.status === 'closed' || !isLegalStatusTransition(current.status, input.nextStatus)) {
        throw new ClassroomLessonRunConflictError(
          `Illegal lesson lifecycle transition: ${current.status} -> ${input.nextStatus}.`,
        );
      }
      if (session.active_lesson_run_id !== current.lessonRunId) {
        throw new ClassroomLessonRunConflictError('Lesson run is not active for this classroom session.');
      }
      if (input.nextStatus === 'closed') beforeClose?.({ database: this.database, run: current, at });

      const nextRevision = input.expectedRevision + 1;
      const nextCursor: TeachingCursor = {
        ...current.teachingCursor,
        ...(input.nextStatus === 'closed' ? { phase: 'close' as const } : {}),
        ...(input.nextStatus === 'paused' || input.nextStatus === 'closed'
          ? { playbackStatus: input.nextStatus === 'closed' ? 'ended' as const : 'paused' as const }
          : {}),
        revision: nextRevision,
        updatedAt: at,
      };
      const runMutation = this.database.prepare(`
        UPDATE classroom_lesson_runs
        SET status = ?, teaching_cursor_json = ?, revision = revision + 1,
          started_at = CASE WHEN ? = 'active' THEN COALESCE(started_at, ?) ELSE started_at END,
          paused_at = CASE WHEN ? = 'paused' THEN ? WHEN ? = 'active' THEN NULL ELSE paused_at END,
          closed_at = CASE WHEN ? = 'closed' THEN ? ELSE closed_at END
        WHERE lesson_run_id = ? AND session_id = ? AND revision = ? AND status = ?
      `).run(
        input.nextStatus,
        JSON.stringify(nextCursor),
        input.nextStatus,
        at,
        input.nextStatus,
        at,
        input.nextStatus,
        input.nextStatus,
        at,
        input.lessonRunId,
        input.sessionId,
        input.expectedRevision,
        current.status,
      );
      if (runMutation.changes !== 1) {
        throw new ClassroomLessonRunRevisionConflictError(
          input.sessionId,
          input.expectedRevision,
          this.readSessionAuthority(input.sessionId).revision,
        );
      }
      const sessionMutation = this.database.prepare(`
        UPDATE classroom_sessions
        SET status = ?, active_node_id = ?, active_unit_id = ?,
          active_lesson_run_id = CASE WHEN ? = 'closed' THEN NULL ELSE ? END,
          revision = revision + 1, updated_at = ?
        WHERE session_id = ? AND revision = ? AND active_lesson_run_id = ?
      `).run(
        input.nextStatus === 'closed' ? 'preparing' : input.nextStatus,
        nextCursor.nodeId,
        nextCursor.unitId,
        input.nextStatus,
        input.lessonRunId,
        at,
        input.sessionId,
        input.expectedRevision,
        input.lessonRunId,
      );
      if (sessionMutation.changes !== 1) {
        throw new ClassroomLessonRunRevisionConflictError(
          input.sessionId,
          input.expectedRevision,
          this.readSessionAuthority(input.sessionId).revision,
        );
      }
      const command = createCommand(
        input.sessionId,
        nextRevision,
        nextCursor,
        commandPhaseForCursor(nextCursor),
        now,
      );
      this.insertCommand(command);
      this.clock.advance([`classroom:${input.sessionId}`], at);
      const run = this.readLessonRun(input.lessonRunId);
      if (!run) throw new ClassroomLessonRunNotFoundError(input.lessonRunId);
      return { run, command };
    });
    return transaction.immediate();
  }

  updateTeachingCursor(
    input: {
      sessionId: string;
      lessonRunId: string;
      expectedRevision: number;
      next: TeachingCursorMutation;
    },
    now = new Date(),
  ): { run: StoredClassroomLessonRun; command: ClassroomCommand } {
    assertExpectedRevision(input.expectedRevision);
    const at = now.toISOString();
    const transaction = this.database.transaction(() => {
      const session = this.readSessionAuthority(input.sessionId);
      const current = this.readLessonRun(input.lessonRunId);
      if (!current || current.sessionId !== input.sessionId) {
        throw new ClassroomLessonRunNotFoundError(input.lessonRunId);
      }
      if (session.revision !== input.expectedRevision || current.revision !== input.expectedRevision) {
        throw new ClassroomLessonRunRevisionConflictError(
          input.sessionId,
          input.expectedRevision,
          Math.max(session.revision, current.revision),
        );
      }
      if (current.status !== 'active' || session.active_lesson_run_id !== current.lessonRunId) {
        throw new ClassroomLessonRunConflictError('Teaching cursor requires the active, unpaused lesson run.');
      }
      const nextRevision = input.expectedRevision + 1;
      const nextCursor = parseTeachingCursor({
        ...input.next,
        lessonRunId: current.lessonRunId,
        lessonId: current.lessonId,
        taskId: current.taskId,
        revision: nextRevision,
        updatedAt: at,
      }, { expectedLessonRunId: current.lessonRunId });
      if (!nextCursor) {
        throw new ClassroomLessonRunConflictError('Teaching cursor mutation conflicts with the lesson package.');
      }
      const runMutation = this.database.prepare(`
        UPDATE classroom_lesson_runs
        SET node_id = ?, teaching_cursor_json = ?, revision = revision + 1
        WHERE lesson_run_id = ? AND session_id = ? AND revision = ?
          AND status = 'active'
      `).run(
        nextCursor.nodeId,
        JSON.stringify(nextCursor),
        current.lessonRunId,
        current.sessionId,
        input.expectedRevision,
      );
      if (runMutation.changes !== 1) {
        throw new ClassroomLessonRunRevisionConflictError(
          input.sessionId,
          input.expectedRevision,
          this.readSessionAuthority(input.sessionId).revision,
        );
      }
      const sessionMutation = this.database.prepare(`
        UPDATE classroom_sessions
        SET active_node_id = ?, active_unit_id = ?, status = ?,
          revision = revision + 1, updated_at = ?
        WHERE session_id = ? AND active_lesson_run_id = ? AND revision = ?
      `).run(
        nextCursor.nodeId,
        nextCursor.unitId,
        current.status,
        at,
        input.sessionId,
        input.lessonRunId,
        input.expectedRevision,
      );
      if (sessionMutation.changes !== 1) {
        throw new ClassroomLessonRunRevisionConflictError(
          input.sessionId,
          input.expectedRevision,
          this.readSessionAuthority(input.sessionId).revision,
        );
      }
      const command = createCommand(
        input.sessionId,
        nextRevision,
        nextCursor,
        commandPhaseForCursor(nextCursor),
        now,
      );
      this.insertCommand(command);
      this.clock.advance([`classroom:${input.sessionId}`], at);
      const run = this.readLessonRun(input.lessonRunId);
      if (!run) throw new ClassroomLessonRunNotFoundError(input.lessonRunId);
      return { run, command };
    });
    return transaction.immediate();
  }

  private readSessionAuthority(sessionId: string): SessionAuthorityRow {
    const row = this.database.prepare(`
      SELECT revision, active_lesson_run_id
      FROM classroom_sessions
      WHERE session_id = ?
    `).get(sessionId) as SessionAuthorityRow | undefined;
    if (!row) throw new ClassroomLessonRunNotFoundError(sessionId);
    return row;
  }

  private insertCommand(command: ClassroomCommand): void {
    this.database.prepare(`
      INSERT INTO classroom_commands (
        command_id, session_id, revision, kind, target_student_id,
        payload_json, created_at, expires_at
      ) VALUES (?, ?, ?, 'classroom_state', NULL, ?, ?, ?)
    `).run(
      command.commandId,
      command.sessionId,
      command.revision,
      JSON.stringify({
        phase: command.phase,
        route: command.route,
        nodeId: command.nodeId,
        unitId: command.unitId,
      }),
      command.createdAt,
      command.expiresAt,
    );
    this.database.prepare(`
      INSERT INTO command_acks (command_id, device_id, state, acknowledged_at)
      SELECT ?, device.device_id, 'queued', ?
      FROM device_presence AS device
      INNER JOIN classroom_members AS member
        ON member.session_id = device.session_id
        AND member.student_id = device.user_id
      INNER JOIN users AS user ON user.id = member.student_id
      WHERE device.session_id = ?
        AND device.role = 'student'
        AND user.role = 'student'
        AND user.is_active = 1
    `).run(command.commandId, command.createdAt, command.sessionId);
  }
}

function lessonRunFromRow(row: LessonRunRow): StoredClassroomLessonRun {
  const teachingCursor = parseTeachingCursorJson(row.teaching_cursor_json);
  if (!teachingCursor
    || teachingCursor.lessonRunId !== row.lesson_run_id
    || teachingCursor.lessonId !== row.lesson_id
    || teachingCursor.taskId !== row.task_id
    || teachingCursor.nodeId !== row.node_id
    || teachingCursor.revision !== row.revision) {
    throw new ClassroomLessonRunConflictError(`Invalid teaching cursor for lesson run: ${row.lesson_run_id}.`);
  }
  return {
    lessonRunId: row.lesson_run_id,
    sessionId: row.session_id,
    lessonId: teachingCursor.lessonId,
    taskId: teachingCursor.taskId,
    nodeId: row.node_id,
    status: row.status,
    teachingCursor,
    revision: row.revision,
    ...(row.started_at ? { startedAt: row.started_at } : {}),
    ...(row.paused_at ? { pausedAt: row.paused_at } : {}),
    ...(row.closed_at ? { closedAt: row.closed_at } : {}),
    createdAt: row.created_at,
  };
}

function createCommand(
  sessionId: string,
  revision: number,
  cursor: TeachingCursor,
  phase: ClassroomCommand['phase'],
  now: Date,
): ClassroomCommand {
  return {
    commandId: `${sessionId}-r${revision}-${randomUUID().slice(0, 8)}`,
    sessionId,
    phase,
    route: `/classroom/${sessionId}`,
    nodeId: cursor.nodeId,
    unitId: cursor.unitId,
    revision,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 15_000).toISOString(),
  };
}

function assertExpectedRevision(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError('Expected classroom revision must be a safe non-negative integer.');
  }
}

function isLegalStatusTransition(
  current: ClassroomLessonRunStatus,
  next: ClassroomLessonRunStatus,
): boolean {
  if (current === 'preparing') return next === 'active';
  if (current === 'active') return next === 'paused' || next === 'closed';
  if (current === 'paused') return next === 'active' || next === 'closed';
  return false;
}

function commandPhaseForCursor(cursor: TeachingCursor): ClassroomCommand['phase'] {
  return cursor.phase === 'assessment' ? 'challenge' : cursor.phase;
}
