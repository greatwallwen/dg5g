import { NextResponse } from 'next/server';
import { readActorFromRequest } from '@/platform/auth/server-actor';
import { projectClassSession } from '@/platform/class-session-projection';
import {
  ClassroomAuthorizationError,
  ClassroomIntentError,
  ClassroomSessionService,
} from '@/platform/classroom-session-service';
import {
  ClassroomLessonLifecycleService,
  ClassroomLessonLifecycleConflictError,
  type LessonLifecycleCommand,
} from '@/platform/classroom-lesson-lifecycle-service';
import {
  ClassroomLessonRunConflictError,
  ClassroomLessonRunNotFoundError,
  ClassroomLessonRunRepository,
  ClassroomLessonRunRevisionConflictError,
} from '@/platform/classroom-lesson-run-repository';
import {
  ClassroomRevisionConflictError,
  ClassroomSessionNotFoundError,
  ClassroomSessionRepository,
} from '@/platform/classroom-session-repository';
import { ClassroomRosterRepository } from '@/platform/classroom-roster-repository';
import { parseClassroomLessonIntent } from '@/platform/classroom-state';
import { getDatabase } from '@/platform/db/database';
import { isClassroomLessonId } from '@/platform/teaching-cursor';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: { sessionId: string } },
) {
  const actor = readActorFromRequest(request);
  if (!actor) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const expectedRevision = expectedRevisionFrom(body);
  const lessonId = typeof body?.lessonId === 'string' && isClassroomLessonId(body.lessonId)
    ? body.lessonId
    : undefined;
  const nodeId = typeof body?.nodeId === 'string' ? body.nodeId.trim() : undefined;
  const commandType = typeof body?.command === 'object' && body.command
    ? (body.command as Record<string, unknown>).type
    : body?.command;
  if (expectedRevision === undefined
    || (!lessonId && !nodeId)
    || (commandType !== undefined && commandType !== 'prepare')) {
    return NextResponse.json({ error: 'Invalid start-lesson request' }, { status: 400 });
  }
  try {
    return noStore(service().startLesson(
      actor,
      params.sessionId,
      { ...(lessonId ? { lessonId } : {}), ...(nodeId ? { nodeId } : {}), expectedRevision },
    ));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { sessionId: string } },
) {
  const actor = readActorFromRequest(request);
  if (!actor) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const lessonRunId = typeof body?.lessonRunId === 'string' ? body.lessonRunId.trim() : '';
  const expectedRevision = expectedRevisionFrom(body);
  if (!lessonRunId || expectedRevision === undefined) {
    return NextResponse.json({ error: 'Invalid lesson-run request' }, { status: 400 });
  }
  try {
    const classroom = service();
    if (body?.intent !== undefined) {
      const intent = parseClassroomLessonIntent(body.intent);
      if (!intent) return NextResponse.json({ error: 'Invalid teaching cursor intent' }, { status: 400 });
      const result = classroom.applyTeachingCursorIntent(
        actor, params.sessionId, lessonRunId, intent, expectedRevision,
      );
      return noStore(new URL(request.url).searchParams.get('view') === 'projector'
        ? { ...result, session: projectClassSession(result.session, 'projector') }
        : result);
    }
    const command = parseLifecycleCommand(body?.command, expectedRevision);
    if (!command) return NextResponse.json({ error: 'Invalid lesson lifecycle command' }, { status: 400 });
    return noStore(classroom.executeLessonLifecycle(
      actor, params.sessionId, lessonRunId, command,
    ));
  } catch (error) {
    return errorResponse(error);
  }
}

function service(): ClassroomSessionService {
  const database = getDatabase();
  const lessonRuns = new ClassroomLessonRunRepository(database);
  return new ClassroomSessionService(
    new ClassroomSessionRepository(database),
    new ClassroomRosterRepository(database),
    undefined,
    lessonRuns,
    new ClassroomLessonLifecycleService(lessonRuns),
  );
}

function expectedRevisionFrom(body: Record<string, unknown> | null): number | undefined {
  const nested = typeof body?.command === 'object' && body.command
    ? (body.command as Record<string, unknown>).expectedRevision
    : undefined;
  const value = body?.expectedRevision ?? nested;
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function parseLifecycleCommand(value: unknown, expectedRevision: number): LessonLifecycleCommand | undefined {
  const command = typeof value === 'string'
    ? { type: value }
    : value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
  if (!command) return undefined;
  if (command.type === 'pause' || command.type === 'resume' || command.type === 'start') {
    return { type: command.type, expectedRevision };
  }
  if (command.type === 'close' && typeof command.collectAssessment === 'boolean') {
    return { type: 'close', expectedRevision, collectAssessment: command.collectAssessment };
  }
  return undefined;
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Classroom lesson request failed';
  if (error instanceof ClassroomRevisionConflictError
    || error instanceof ClassroomLessonRunRevisionConflictError) {
    return NextResponse.json({ error: message, currentRevision: error.currentRevision }, { status: 409 });
  }
  if (error instanceof ClassroomLessonLifecycleConflictError
    || error instanceof ClassroomLessonRunConflictError) {
    return NextResponse.json({ error: message }, { status: 409 });
  }
  if (error instanceof ClassroomAuthorizationError) {
    return NextResponse.json({ error: message }, { status: 403 });
  }
  if (error instanceof ClassroomSessionNotFoundError
    || error instanceof ClassroomLessonRunNotFoundError) {
    return NextResponse.json({ error: 'Class session or lesson run is not open' }, { status: 404 });
  }
  if (error instanceof ClassroomIntentError || error instanceof TypeError) {
    return NextResponse.json({ error: message }, { status: 400 });
  }
  return NextResponse.json({ error: message }, { status: 400 });
}

function noStore(body: unknown) {
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
