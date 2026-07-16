import { NextResponse } from 'next/server';
import {
  AuthoritativeSnapshotAuthorizationError,
  AuthoritativeSnapshotReader,
  type SnapshotAudience,
} from '@/platform/authoritative-snapshot';
import { readActorFromRequest } from '@/platform/auth/server-actor';
import { ClassroomSessionNotFoundError } from '@/platform/classroom-session-repository';
import { getDatabase } from '@/platform/db/database';

const audiences = new Set<SnapshotAudience>(['student', 'teacher', 'projector', 'graph']);
const allowedQueryKeys = new Set(['audience', 'sessionId']);

export async function GET(request: Request): Promise<NextResponse> {
  const actor = readActorFromRequest(request);
  if (!actor) return problem('Authentication required', 401);

  const url = new URL(request.url);
  if (request.body !== null || hasDeclaredBody(request)) {
    return problem('Snapshot reads do not accept a request body.', 400);
  }
  if ([...url.searchParams.keys()].some((key) => !allowedQueryKeys.has(key))) {
    return problem('Snapshot reads accept only audience and sessionId query fields.', 400);
  }

  const audienceValues = url.searchParams.getAll('audience');
  const audience = audienceValues.length === 1 ? audienceValues[0] : undefined;
  if (!isSnapshotAudience(audience)) {
    return problem('Snapshot audience must be student, teacher, projector, or graph.', 400);
  }

  const sessionValues = url.searchParams.getAll('sessionId');
  if (sessionValues.length > 1 || (sessionValues.length === 1 && !sessionValues[0]?.trim())) {
    return problem('Snapshot sessionId must be a single non-empty value.', 400);
  }
  const sessionId = sessionValues[0];

  try {
    const reader = new AuthoritativeSnapshotReader(getDatabase());
    const options = sessionId === undefined ? {} : { sessionId };
    const snapshot = audience === 'student'
      ? reader.read(actor, 'student', options)
      : audience === 'teacher'
        ? reader.read(actor, 'teacher', options)
        : audience === 'projector'
          ? reader.read(actor, 'projector', options)
          : reader.read(actor, 'graph', options);
    return noStoreJson(snapshot);
  } catch (error) {
    if (error instanceof ClassroomSessionNotFoundError) {
      return problem(error.message, 404);
    }
    if (error instanceof AuthoritativeSnapshotAuthorizationError) {
      return problem(error.message, 403);
    }
    throw error;
  }
}

function isSnapshotAudience(value: string | undefined): value is SnapshotAudience {
  return value !== undefined && audiences.has(value as SnapshotAudience);
}

function hasDeclaredBody(request: Request): boolean {
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null && Number(contentLength) > 0) return true;
  return request.headers.has('transfer-encoding');
}

function problem(error: string, status: number): NextResponse {
  return noStoreJson({ error }, { status });
}

function noStoreJson(body: unknown, init?: ResponseInit): NextResponse {
  const headers = new Headers(init?.headers);
  headers.set('Cache-Control', 'no-store');
  return NextResponse.json(body, { ...init, headers });
}
