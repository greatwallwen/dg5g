import { NextResponse } from 'next/server';
import { readActorFromRequest } from '@/platform/auth/server-actor';
import { projectClassSession } from '@/platform/class-session-projection';
import type { SessionPatch } from '@/platform/class-session-protocol';
import {
  ClassroomAuthorizationError,
  ClassroomIntentError,
  ClassroomSessionService,
} from '@/platform/classroom-session-service';
import {
  ClassroomRevisionConflictError,
  ClassroomSessionNotFoundError,
  ClassroomSessionRepository,
} from '@/platform/classroom-session-repository';
import { ClassroomRosterRepository } from '@/platform/classroom-roster-repository';
import { ClassroomLessonRunRepository } from '@/platform/classroom-lesson-run-repository';
import { parseClassroomLessonIntent } from '@/platform/classroom-state';
import { getDatabase } from '@/platform/db/database';
import { ClassSessionAccessError } from '@/platform/fixtures';
import { parseStudentClassroomAction } from '@/platform/student-classroom-action';
import { applyStudentClassroomAction } from '@/platform/student-classroom-action-service';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { sessionId: string } },
) {
  const actor = readActorFromRequest(request);
  if (!actor) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  try {
    const view = new URL(request.url).searchParams.get('view') === 'projector'
      ? 'projector' as const
      : 'actor' as const;
    const classroom = service();
    const session = view === 'projector'
      ? classroom.read(actor, params.sessionId, 'projector')
      : classroom.read(actor, params.sessionId);
    if (!session) return sessionNotFound();
    return noStore({ session });
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
  const body = await request.json().catch(() => null) as {
    patch?: unknown;
    intent?: unknown;
    action?: unknown;
    expectedRevision?: unknown;
  } | null;
  if (!body) return NextResponse.json({ error: 'Invalid class-session request' }, { status: 400 });
  const classroom = service();
  try {
    const authorized = classroom.read(actor, params.sessionId);
    if (!authorized) return sessionNotFound();

    if (body.intent !== undefined) {
      return NextResponse.json({ error: 'Teaching cursor intents require the narrow lesson endpoint' }, { status: 400 });
    }

    if (actor.role === 'student') {
      if (body.patch !== undefined) {
        return NextResponse.json({ error: 'Students must use a narrow classroom action' }, { status: 400 });
      }
      const action = parseStudentClassroomAction(body.action);
      if (!action || !actor.studentId) {
        return NextResponse.json({ error: 'Invalid student classroom action' }, { status: 400 });
      }
      const session = applyStudentClassroomAction(params.sessionId, actor.studentId, action);
      return noStore({
        session: projectClassSession(session, 'student', actor.studentId),
      });
    }

    if (body.action !== undefined) {
      return NextResponse.json({ error: 'Student actions require a student session' }, { status: 403 });
    }
    const expectedRevision = Number(body.expectedRevision);
    if (!body.patch
      || typeof body.patch !== 'object'
      || !Number.isInteger(expectedRevision)
      || expectedRevision < 0) {
      return NextResponse.json({ error: 'Teacher patch requires expectedRevision' }, { status: 400 });
    }
    const session = classroom.patchTeacherState(
      actor,
      params.sessionId,
      body.patch as SessionPatch,
      expectedRevision,
    );
    return noStore({ session });
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
  );
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Classroom request failed';
  if (error instanceof ClassroomRevisionConflictError) {
    return NextResponse.json({ error: message, currentRevision: error.currentRevision }, { status: 409 });
  }
  if (error instanceof ClassroomAuthorizationError) {
    return NextResponse.json({ error: message }, { status: 403 });
  }
  if (error instanceof ClassroomSessionNotFoundError || error instanceof ClassSessionAccessError) {
    return sessionNotFound();
  }
  if (error instanceof ClassroomIntentError) {
    return NextResponse.json({ error: message }, { status: 400 });
  }
  return NextResponse.json({ error: message }, { status: 400 });
}

function sessionNotFound() {
  return NextResponse.json({ error: 'Class session is not open' }, { status: 404 });
}

function noStore(body: unknown) {
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
