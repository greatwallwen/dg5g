'use client';

import type {
  ClassroomParticipation,
  ClassroomParticipationMode,
} from '../../platform/classroom-participation-repository.ts';

export interface ClassroomParticipationSnapshot {
  participation: ClassroomParticipation | null;
  joinedCount: number;
  followingCount: number;
}

export class ClassroomParticipationClientError extends Error {
  override readonly name = 'ClassroomParticipationClientError';

  constructor(message: string, readonly status: number) {
    super(message);
  }
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function createClassroomParticipationClient(fetchImpl: FetchLike = fetch) {
  return {
    read(sessionId: string) {
      return request(fetchImpl, sessionId, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
      });
    },
    join(sessionId: string) {
      return request(fetchImpl, sessionId, {
        method: 'PUT',
        credentials: 'same-origin',
      });
    },
    setMode(sessionId: string, mode: ClassroomParticipationMode) {
      return request(fetchImpl, sessionId, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
    },
    leave(sessionId: string) {
      return request(fetchImpl, sessionId, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
    },
  };
}

export function readClassroomParticipation(sessionId: string): Promise<ClassroomParticipationSnapshot> {
  return createClassroomParticipationClient().read(sessionId);
}

export function joinClassroomParticipation(sessionId: string): Promise<ClassroomParticipationSnapshot> {
  return createClassroomParticipationClient().join(sessionId);
}

export function setClassroomParticipationMode(
  sessionId: string,
  mode: ClassroomParticipationMode,
): Promise<ClassroomParticipationSnapshot> {
  return createClassroomParticipationClient().setMode(sessionId, mode);
}

export function leaveClassroomParticipation(sessionId: string): Promise<ClassroomParticipationSnapshot> {
  return createClassroomParticipationClient().leave(sessionId);
}

async function request(
  fetchImpl: FetchLike,
  sessionId: string,
  init: RequestInit,
): Promise<ClassroomParticipationSnapshot> {
  const response = await fetchImpl(
    `/api/class-sessions/${encodeURIComponent(sessionId)}/participation`,
    init,
  );
  const body = await response.json().catch(() => ({})) as Partial<ClassroomParticipationSnapshot> & { error?: string };
  if (!response.ok) {
    throw new ClassroomParticipationClientError(
      body.error ?? `Classroom participation request failed (${response.status})`,
      response.status,
    );
  }
  if (body.participation === undefined
    || !Number.isInteger(body.joinedCount)
    || !Number.isInteger(body.followingCount)) {
    throw new ClassroomParticipationClientError('Classroom participation response is incomplete', 502);
  }
  return body as ClassroomParticipationSnapshot;
}
