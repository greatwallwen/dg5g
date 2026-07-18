import { NextResponse } from 'next/server';
import { readActorFromRequest } from '@/platform/auth/server-actor';
import {
  ClassroomAuthorizationError,
  ClassroomSessionService,
} from '@/platform/classroom-session-service';
import {
  ClassroomSessionNotFoundError,
  ClassroomSessionRepository,
} from '@/platform/classroom-session-repository';
import { ClassroomRosterRepository } from '@/platform/classroom-roster-repository';
import { getDatabase } from '@/platform/db/database';

export const dynamic = 'force-dynamic';

const bodyKeys = [
  'deviceId',
  'visibilityState',
  'pageState',
  'lastSeenClassroomRevision',
] as const;

type PresenceBody = Record<string, unknown> & {
  deviceId: string;
  visibilityState: 'visible' | 'hidden';
  pageState: 'closed' | 'opening' | 'ready' | 'hidden' | 'error';
  lastSeenClassroomRevision: number;
};

export async function POST(
  request: Request,
  { params }: { params: { sessionId: string } },
) {
  const actor = readActorFromRequest(request);
  if (!actor) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!isPresenceBody(body)) {
    return NextResponse.json({ error: 'Invalid browser presence request' }, { status: 400 });
  }
  const view = new URL(request.url).searchParams.get('view');
  if (view !== null && view !== 'projector') {
    return NextResponse.json({ error: 'Invalid browser presence surface' }, { status: 400 });
  }
  try {
    const presence = service().recordBrowserPresence(
      actor,
      params.sessionId,
      view === 'projector' ? 'projector' : 'actor',
      {
        deviceId: body.deviceId,
        visibilityState: body.visibilityState,
        pageState: body.pageState,
        lastSeenClassroomRevision: body.lastSeenClassroomRevision,
      },
    );
    return NextResponse.json({ presence }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Browser presence failed';
    if (error instanceof ClassroomAuthorizationError) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (error instanceof ClassroomSessionNotFoundError) {
      return NextResponse.json({ error: 'Class session is not open' }, { status: 404 });
    }
    const status = /already bound|revision cannot exceed/i.test(message) ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

function service(): ClassroomSessionService {
  const database = getDatabase();
  return new ClassroomSessionService(
    new ClassroomSessionRepository(database),
    new ClassroomRosterRepository(database),
  );
}

function isPresenceBody(value: Record<string, unknown> | null): value is PresenceBody {
  if (!value
    || Object.keys(value).length !== bodyKeys.length
    || !bodyKeys.every((key) => key in value)) return false;
  return typeof value.deviceId === 'string'
    && value.deviceId.trim().length > 0
    && value.deviceId.length <= 200
    && (value.visibilityState === 'visible' || value.visibilityState === 'hidden')
    && (value.pageState === 'closed'
      || value.pageState === 'opening'
      || value.pageState === 'ready'
      || value.pageState === 'hidden'
      || value.pageState === 'error')
    && Number.isSafeInteger(value.lastSeenClassroomRevision)
    && Number(value.lastSeenClassroomRevision) >= 0;
}
