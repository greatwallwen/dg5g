import { NextResponse } from 'next/server';
import { readActivityDefinition } from '@/features/learning-activities/activity-catalog';
import {
  ActivityAttemptVersionConflictError,
  ActivityRepository,
} from '@/features/learning-activities/activity-repository';
import { readActorFromRequest } from '@/platform/auth/server-actor';
import { getDatabase } from '@/platform/db/database';
import {
  createLearningCommandService,
  describeLearningCommandError,
} from '@/platform/learning-command-service';

export const dynamic = 'force-dynamic';

const bodyKeys = ['attemptId', 'expectedVersion', 'response'];

export async function POST(request: Request, { params }: { params: { activityId: string } }) {
  const actor = readActorFromRequest(request);
  if (!actor) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (actor.role !== 'student' || !actor.studentId || actor.studentId !== actor.userId) {
    return NextResponse.json({ error: 'Student role required' }, { status: 403 });
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!isExactAttemptBody(body)) {
    return NextResponse.json({ error: 'Invalid activity attempt command' }, { status: 400 });
  }
  const activity = readActivityDefinition(params.activityId);
  if (!activity) return NextResponse.json({ error: 'Activity not found' }, { status: 404 });

  const database = getDatabase();
  try {
    createLearningCommandService(database).requireNodeAccess(actor, activity.activity.nodeId);
    const result = new ActivityRepository(database).recordEvaluatedAttempt({
      attemptId: body.attemptId as string,
      studentId: actor.studentId,
      activity,
      response: body.response,
      expectedVersion: body.expectedVersion as number,
    });
    return NextResponse.json(result);
  } catch (error) {
    const problem = describeLearningCommandError(error);
    if (problem) {
      return NextResponse.json(problem.body, { status: problem.status });
    }
    if (error instanceof ActivityAttemptVersionConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof TypeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

function isExactAttemptBody(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === bodyKeys.length && keys.every((key, index) => key === bodyKeys[index]);
}
