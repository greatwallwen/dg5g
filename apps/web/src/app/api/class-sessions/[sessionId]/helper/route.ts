import { NextResponse } from 'next/server';
import {
  ClassroomSessionNotFoundError,
  ClassroomSessionRepository,
} from '@/platform/classroom-session-repository';
import { getDatabase } from '@/platform/db/database';
import type { ClassroomPageState } from '@/platform/models';

const pageStates = new Set<ClassroomPageState>(['closed', 'opening', 'ready', 'hidden', 'error']);
const ackStates = new Set(['delivered', 'applied', 'failed']);

export async function GET(request: Request, { params }: { params: { sessionId: string } }) {
  if (!hasHelperToken(request)) {
    return NextResponse.json({ error: 'Classroom Helper token is invalid' }, { status: 403 });
  }
  const store = repository();
  const session = store.readSession(params.sessionId);
  if (!session) return sessionNotFound();
  const snapshot = store.readDeviceSnapshot(session.sessionId);
  return noStore({
    command: snapshot.command,
    lesson: session.state.lesson,
    serverTime: new Date().toISOString(),
  });
}

export async function PATCH(request: Request, { params }: { params: { sessionId: string } }) {
  if (!hasHelperToken(request)) {
    return NextResponse.json({ error: 'Classroom Helper token is invalid' }, { status: 403 });
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid Helper payload' }, { status: 400 });
  const store = repository();
  if (!store.readSession(params.sessionId)) return sessionNotFound();
  try {
    if (body.kind === 'heartbeat') {
      if (!isHeartbeat(body)) {
        return NextResponse.json({ error: 'Invalid Helper heartbeat' }, { status: 400 });
      }
      store.recordHeartbeat(params.sessionId, {
        deviceId: body.deviceId,
        actorRole: body.actorRole,
        ...(body.studentId ? { studentId: body.studentId } : {}),
        pageState: body.pageState,
        lastAppliedRevision: body.lastAppliedRevision,
      });
    } else if (body.kind === 'ack') {
      if (!isAck(body)) {
        return NextResponse.json({ error: 'Invalid Helper acknowledgement' }, { status: 400 });
      }
      store.recordAck(params.sessionId, {
        commandId: body.commandId,
        deviceId: body.deviceId,
        studentId: body.studentId,
        state: body.state,
        ...(body.reason ? { reason: body.reason } : {}),
      });
    } else {
      return NextResponse.json({ error: 'Invalid Helper payload kind' }, { status: 400 });
    }
    return noStore({
      snapshot: store.readDeviceSnapshot(params.sessionId),
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof ClassroomSessionNotFoundError) return sessionNotFound();
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Helper update failed',
    }, { status: 409 });
  }
}

function repository(): ClassroomSessionRepository {
  return new ClassroomSessionRepository(getDatabase());
}

function isHeartbeat(body: Record<string, unknown>): body is Record<string, unknown> & {
  deviceId: string;
  actorRole: 'teacher' | 'student';
  studentId?: string;
  pageState: ClassroomPageState;
  lastAppliedRevision: number;
} {
  return typeof body.deviceId === 'string'
    && (body.actorRole === 'teacher' || body.actorRole === 'student')
    && (body.actorRole === 'teacher' || typeof body.studentId === 'string')
    && pageStates.has(body.pageState as ClassroomPageState)
    && Number.isInteger(body.lastAppliedRevision)
    && Number(body.lastAppliedRevision) >= 0;
}

function isAck(body: Record<string, unknown>): body is Record<string, unknown> & {
  commandId: string;
  deviceId: string;
  studentId: string;
  state: 'delivered' | 'applied' | 'failed';
  reason?: string;
} {
  return typeof body.commandId === 'string'
    && typeof body.deviceId === 'string'
    && typeof body.studentId === 'string'
    && ackStates.has(String(body.state))
    && (body.reason === undefined || typeof body.reason === 'string');
}

function hasHelperToken(request: Request): boolean {
  const expected = process.env.DGBOOK_HELPER_TOKEN
    ?? (process.env.NODE_ENV === 'production' ? undefined : 'dgbook-helper-demo-2026');
  if (!expected) return false;
  return request.headers.get('x-dgbook-helper-token') === expected;
}

function sessionNotFound() {
  return NextResponse.json({ error: 'Class session is not open' }, { status: 404 });
}

function noStore(body: unknown) {
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
