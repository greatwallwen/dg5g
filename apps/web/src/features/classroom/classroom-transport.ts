import type { ClassroomLessonIntent } from '../../platform/classroom-state.ts';
import type { SessionPatch, SessionRole } from '../../platform/class-session-protocol.ts';
import type { ClassSession, ClassroomCommand, CommandAck } from '../../platform/models.ts';
import { studentClassroomActionFromPatch } from '../../platform/student-classroom-action.ts';

export type ClassroomTransportResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; currentRevision?: number };

export interface ClassroomTransport {
  fetchSession(sessionId: string, role: SessionRole, studentId?: string): Promise<ClassroomTransportResult<ClassSession>>;
  patchSession(sessionId: string, role: Exclude<SessionRole, 'projector'>, studentId: string | undefined, patch: SessionPatch, expectedRevision?: number): Promise<ClassroomTransportResult<ClassSession>>;
  submitIntent(sessionId: string, lessonRunId: string, intent: ClassroomLessonIntent, expectedRevision: number, responseView?: 'projector'): Promise<ClassroomTransportResult<{ session: ClassSession; command: ClassroomCommand }>>;
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function createHttpClassroomTransport(fetchImpl: FetchLike = fetch): ClassroomTransport {
  return {
    fetchSession(sessionId, role, studentId) {
      void studentId;
      return requestSession(fetchImpl, sessionUrl(sessionId, role), {
        cache: 'no-store',
        credentials: 'same-origin',
      });
    },
    patchSession(sessionId, role, studentId, patch, expectedRevision) {
      void studentId;
      if (role === 'student') {
        const action = studentClassroomActionFromPatch(patch);
        if (!action) {
          return Promise.resolve({ ok: false, status: 400, error: 'Invalid student classroom action' });
        }
        return requestSession(fetchImpl, sessionUrl(sessionId), patchInit({ action }));
      }
      if (!Number.isInteger(expectedRevision) || Number(expectedRevision) < 0) {
        return Promise.resolve({ ok: false, status: 400, error: 'Teacher patch requires expectedRevision' });
      }
      return requestSession(fetchImpl, sessionUrl(sessionId), patchInit({ patch, expectedRevision }));
    },
    async submitIntent(sessionId, lessonRunId, intent, expectedRevision, responseView) {
      const result = await requestJson<{ session?: ClassSession; command?: ClassroomCommand }>(
        fetchImpl,
        lessonUrl(sessionId, responseView),
        patchInit({ lessonRunId, intent, expectedRevision }),
      );
      if (!result.ok) return result;
      if (!result.data.session || !result.data.command) {
        return { ok: false, status: 502, error: 'Classroom intent response is incomplete' };
      }
      return { ok: true, data: { session: result.data.session, command: result.data.command } };
    },
  };
}

export function selectNewerClassSession(current: ClassSession, incoming: ClassSession): ClassSession {
  const currentRevision = current.lessonState?.revision;
  const incomingRevision = incoming.lessonState?.revision;
  let selected: ClassSession;
  if (currentRevision !== undefined || incomingRevision !== undefined) {
    if (incomingRevision === undefined || (currentRevision !== undefined && incomingRevision < currentRevision)) {
      selected = current;
    } else if (currentRevision === undefined || incomingRevision > currentRevision) {
      selected = { ...current, ...incoming };
    } else {
      const currentTime = Date.parse(current.lastUpdatedAt ?? '') || 0;
      const incomingTime = Date.parse(incoming.lastUpdatedAt ?? '') || 0;
      selected = incomingTime >= currentTime ? { ...current, ...incoming } : current;
    }
  } else {
    const currentTime = Date.parse(current.lastUpdatedAt ?? '') || 0;
    const incomingTime = Date.parse(incoming.lastUpdatedAt ?? '') || 0;
    selected = incomingTime >= currentTime ? { ...current, ...incoming } : current;
  }
  return {
    ...selected,
    commandAcks: mergeCommandAcks(current.commandAcks, incoming.commandAcks),
  };
}

function mergeCommandAcks(current: CommandAck[] | undefined, incoming: CommandAck[] | undefined): CommandAck[] | undefined {
  if (!current?.length) return incoming;
  if (!incoming?.length) return current;
  const rank = { queued: 0, delivered: 1, failed: 2, expired: 3, applied: 4 } as const;
  const merged = new Map<string, CommandAck>();
  for (const ack of [...current, ...incoming]) {
    const key = `${ack.commandId}:${ack.deviceId}`;
    const existing = merged.get(key);
    if (!existing || rank[ack.state] > rank[existing.state]) merged.set(key, ack);
  }
  return [...merged.values()];
}

async function requestSession(
  fetchImpl: FetchLike,
  url: string,
  init?: RequestInit,
): Promise<ClassroomTransportResult<ClassSession>> {
  const result = await requestJson<{ session?: ClassSession }>(fetchImpl, url, init);
  if (!result.ok) return result;
  return result.data.session
    ? { ok: true, data: result.data.session }
    : { ok: false, status: 502, error: 'Classroom session response is incomplete' };
}

async function requestJson<T>(
  fetchImpl: FetchLike,
  url: string,
  init?: RequestInit,
): Promise<ClassroomTransportResult<T>> {
  try {
    const response = await fetchImpl(url, init);
    const body = await response.json().catch(() => ({})) as T & { error?: string; currentRevision?: number };
    if (!response.ok) {
      const currentRevision = Number.isInteger(body.currentRevision) && Number(body.currentRevision) >= 0
        ? Number(body.currentRevision)
        : undefined;
      return {
        ok: false,
        status: response.status,
        error: body.error ?? `Classroom request failed (${response.status})`,
        ...(currentRevision === undefined ? {} : { currentRevision }),
      };
    }
    return { ok: true, data: body };
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.message : 'Classroom network request failed' };
  }
}

function sessionUrl(sessionId: string, role?: SessionRole): string {
  const base = `/api/class-sessions/${encodeURIComponent(sessionId)}`;
  return role === 'projector' ? `${base}?view=projector` : base;
}

function lessonUrl(sessionId: string, role?: SessionRole): string {
  const base = `/api/class-sessions/${encodeURIComponent(sessionId)}/lesson`;
  return role === 'projector' ? `${base}?view=projector` : base;
}

function patchInit(body: unknown): RequestInit {
  return {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
