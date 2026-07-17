import { NextResponse } from 'next/server';
import { readActivityDefinition } from '@/features/learning-activities/activity-catalog';
import {
  parseActivityDeliveryContext,
  type ActivityDeliveryContext,
} from '@/features/learning-activities/activity-delivery-context';
import {
  ActivityAttemptConflictError,
  ActivityRepository,
} from '@/features/learning-activities/activity-repository';
import type { AuthenticatedActor } from '@/platform/auth/actor';
import { readActorFromRequest } from '@/platform/auth/server-actor';
import { getDatabase, type AppDatabase } from '@/platform/db/database';
import {
  createLearningCommandService,
  describeLearningCommandError,
} from '@/platform/learning-command-service';

export const dynamic = 'force-dynamic';

const bodyKeys = ['attemptId', 'delivery', 'response'];

export async function GET(request: Request, { params }: { params: { activityId: string } }) {
  const actor = readStudentActor(request);
  if (actor instanceof Response) return actor;
  const activity = readActivityDefinition(params.activityId);
  if (!activity) return NextResponse.json({ error: 'Activity not found' }, { status: 404 });
  const database = getDatabase();
  try {
    createLearningCommandService(database).requireNodeAccess(actor, activity.activity.nodeId);
    return noStore(new ActivityRepository(database).readProgress(actor.studentId!, activity.activity.id));
  } catch (error) {
    return activityErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: { activityId: string } }) {
  const actor = readStudentActor(request);
  if (actor instanceof Response) return actor;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!isExactAttemptBody(body)) {
    return NextResponse.json({ error: 'Invalid activity attempt command' }, { status: 400 });
  }
  const activity = readActivityDefinition(params.activityId);
  if (!activity) return NextResponse.json({ error: 'Activity not found' }, { status: 404 });

  const database = getDatabase();
  try {
    const delivery = parseActivityDeliveryContext(body.delivery);
    const repository = new ActivityRepository(database);
    const result = repository.recordEvaluatedAttempt({
      attemptId: body.attemptId as string,
      studentId: actor.studentId!,
      activity,
      response: body.response,
      delivery,
    }, () => {
      createLearningCommandService(database).requireNodeAccess(actor, activity.activity.nodeId);
      if (delivery.channel === 'classroom') {
        requireJoinedClassroomActivity(
          database,
          actor,
          activity.activity.nodeId,
          activity.activity.id,
          delivery,
        );
      }
    });
    return noStore(result);
  } catch (error) {
    return activityErrorResponse(error);
  }
}

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

class ActivityClassroomAuthorizationError extends Error {
  override readonly name = 'ActivityClassroomAuthorizationError';
}

class ActivityClassroomContextError extends Error {
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

function readStudentActor(request: Request): AuthenticatedActor | Response {
  const actor = readActorFromRequest(request);
  if (!actor) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (actor.role !== 'student' || !actor.studentId || actor.studentId !== actor.userId) {
    return NextResponse.json({ error: 'Student role required' }, { status: 403 });
  }
  return actor;
}

function activityErrorResponse(error: unknown): Response {
  const problem = describeLearningCommandError(error);
  if (problem) return NextResponse.json(problem.body, { status: problem.status });
  if (error instanceof ActivityAttemptConflictError
    || error instanceof ActivityClassroomContextError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof ActivityClassroomAuthorizationError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof TypeError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  throw error;
}

function isExactAttemptBody(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === bodyKeys.length && keys.every((key, index) => key === bodyKeys[index]);
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

function noStore(body: unknown): Response {
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
