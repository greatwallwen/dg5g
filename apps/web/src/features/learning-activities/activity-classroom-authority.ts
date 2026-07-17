import type { AuthenticatedActor } from '@/platform/auth/actor';
import type { AppDatabase } from '@/platform/db/database';
import type { ActivityDeliveryContext } from './activity-delivery-context';

interface ClassroomAuthorityRow {
  classId: string;
  sessionStatus: 'preparing' | 'active' | 'paused' | 'closed';
  activeNodeId: string | null;
  activeLessonRunId: string | null;
  isMember: number;
  participationState: 'joined' | 'left' | null;
  lessonRunStatus: 'preparing' | 'active' | 'paused' | 'closed' | null;
  lessonRunNodeId: string | null;
  teachingCursorJson: string | null;
}

export class ActivityClassroomAuthorizationError extends Error {
  override readonly name = 'ActivityClassroomAuthorizationError';
}

export class ActivityClassroomContextError extends Error {
  override readonly name = 'ActivityClassroomContextError';
}

/**
 * classroomRunId is the public contract name. It maps to
 * classroom_lesson_runs.lesson_run_id and practice_attempts.classroom_run_id.
 */
export function requireJoinedClassroomActivity(
  database: AppDatabase,
  actor: AuthenticatedActor,
  nodeId: string,
  canonicalActivityId: string,
  delivery: Extract<ActivityDeliveryContext, { channel: 'classroom' }>,
): void {
  const row = database.prepare(`
    SELECT classroom.class_id AS classId, classroom.status AS sessionStatus,
      classroom.active_node_id AS activeNodeId,
      classroom.active_lesson_run_id AS activeLessonRunId,
      EXISTS(
        SELECT 1 FROM classroom_members AS member
        WHERE member.session_id = classroom.session_id AND member.student_id = ?
      ) AS isMember,
      participation.state AS participationState,
      lesson_run.status AS lessonRunStatus,
      lesson_run.node_id AS lessonRunNodeId,
      lesson_run.teaching_cursor_json AS teachingCursorJson
    FROM classroom_sessions AS classroom
    LEFT JOIN classroom_participation AS participation
      ON participation.session_id = classroom.session_id
     AND participation.student_id = ?
    LEFT JOIN classroom_lesson_runs AS lesson_run
      ON lesson_run.lesson_run_id = ?
     AND lesson_run.session_id = classroom.session_id
    WHERE classroom.session_id = ?
  `).get(
    actor.studentId,
    actor.studentId,
    delivery.classroomRunId,
    delivery.sessionId,
  ) as ClassroomAuthorityRow | undefined;

  if (!row || row.classId !== actor.classId || row.isMember !== 1
    || row.participationState !== 'joined') {
    throw new ActivityClassroomAuthorizationError(
      'Classroom activity requires joined membership for the authenticated student.',
    );
  }
  if (row.sessionStatus !== 'active'
    || row.activeLessonRunId !== delivery.classroomRunId
    || row.activeNodeId !== nodeId
    || row.lessonRunStatus !== 'active'
    || row.lessonRunNodeId !== nodeId) {
    throw new ActivityClassroomContextError('Classroom activity is outside the active lesson run.');
  }
  const cursor = parseJsonRecord(row.teachingCursorJson);
  if (cursor?.canonicalActivityId !== canonicalActivityId) {
    throw new ActivityClassroomContextError(
      'Classroom activity does not match the authoritative teaching cursor.',
    );
  }
}

function parseJsonRecord(source: string | null): Record<string, unknown> | undefined {
  if (!source) return undefined;
  try {
    const value = JSON.parse(source) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}
