import type { SessionPatch } from '../../platform/class-session-protocol.ts';
import type { ClassSession } from '../../platform/models.ts';
import {
  selectNewerClassSession,
  type ClassroomTransport,
  type ClassroomTransportResult,
} from './classroom-transport.ts';

export type TeacherPatchMutationResult =
  | { ok: true; session: ClassSession }
  | {
      ok: false;
      session: ClassSession;
      status: number;
      error: string;
      currentRevision?: number;
      revisionSynchronized: boolean;
    };

export async function applyTeacherPatchWithRecovery(
  transport: ClassroomTransport,
  sessionId: string,
  current: ClassSession,
  patch: SessionPatch,
  isCurrent: () => boolean = () => true,
): Promise<TeacherPatchMutationResult> {
  if (!isCurrent()) return cancelled(current);
  const first = await transport.patchSession(
    sessionId,
    'teacher',
    undefined,
    patch,
    revisionOf(current),
  );
  if (first.ok) return success(current, first);
  if (first.status !== 409) return failure(current, first, true);
  if (!isCurrent()) return cancelled(current, first.currentRevision);

  const refreshed = await transport.fetchSession(sessionId, 'teacher');
  if (!refreshed.ok) return failure(current, refreshed, false, first.currentRevision);

  const authoritative = selectNewerClassSession(current, refreshed.data);
  if (!isCurrent()) return cancelled(authoritative, first.currentRevision);
  const retryRevision = Math.max(revisionOf(authoritative), first.currentRevision ?? 0);
  const retry = await transport.patchSession(
    sessionId,
    'teacher',
    undefined,
    patch,
    retryRevision,
  );
  return retry.ok
    ? success(authoritative, retry)
    : failure(authoritative, retry, retry.status !== 409);
}

function cancelled(
  session: ClassSession,
  currentRevision?: number,
): TeacherPatchMutationResult {
  return {
    ok: false,
    session,
    status: 0,
    error: 'Classroom operation was superseded.',
    revisionSynchronized: false,
    ...(currentRevision === undefined ? {} : { currentRevision }),
  };
}

function revisionOf(session: ClassSession): number {
  return session.lessonState?.revision ?? 0;
}

function success(
  current: ClassSession,
  result: Extract<ClassroomTransportResult<ClassSession>, { ok: true }>,
): TeacherPatchMutationResult {
  return { ok: true, session: selectNewerClassSession(current, result.data) };
}

function failure(
  session: ClassSession,
  result: Extract<ClassroomTransportResult<unknown>, { ok: false }>,
  revisionSynchronized: boolean,
  conflictRevision = result.currentRevision,
): TeacherPatchMutationResult {
  return {
    ok: false,
    session,
    status: result.status,
    error: result.error,
    revisionSynchronized,
    ...(conflictRevision === undefined ? {} : { currentRevision: conflictRevision }),
  };
}
