import { NextResponse } from 'next/server';
import { readActorFromRequest } from '@/platform/auth/server-actor';
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
import { getDatabase } from '@/platform/db/database';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: { sessionId: string } },
) {
  const actor = readActorFromRequest(request);
  if (!actor) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const body = await request.json().catch(() => null) as {
    nodeId?: unknown;
    expectedRevision?: unknown;
  } | null;
  const nodeId = typeof body?.nodeId === 'string' ? body.nodeId.trim() : '';
  const expectedRevision = body?.expectedRevision;
  if (!nodeId
    || typeof expectedRevision !== 'number'
    || !Number.isInteger(expectedRevision)
    || expectedRevision < 0) {
    return NextResponse.json({ error: 'Invalid start-lesson request' }, { status: 400 });
  }

  try {
    const database = getDatabase();
    const service = new ClassroomSessionService(
      new ClassroomSessionRepository(database),
      new ClassroomRosterRepository(database),
    );
    return noStore(service.startLesson(
      actor,
      params.sessionId,
      { nodeId, expectedRevision },
    ));
  } catch (error) {
    return errorResponse(error);
  }
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Classroom start lesson failed';
  if (error instanceof ClassroomRevisionConflictError) {
    return NextResponse.json({ error: message, currentRevision: error.currentRevision }, { status: 409 });
  }
  if (error instanceof ClassroomAuthorizationError) {
    return NextResponse.json({ error: message }, { status: 403 });
  }
  if (error instanceof ClassroomSessionNotFoundError) {
    return NextResponse.json({ error: 'Class session is not open' }, { status: 404 });
  }
  if (error instanceof ClassroomIntentError) {
    return NextResponse.json({ error: message }, { status: 400 });
  }
  return NextResponse.json({ error: message }, { status: 400 });
}

function noStore(body: unknown) {
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
