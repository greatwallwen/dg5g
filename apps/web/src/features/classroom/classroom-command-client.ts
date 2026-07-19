import type { ClassroomAssessmentCommand } from '@/platform/classroom-assessment-run-service.ts';
import type { ClassroomLessonIntent } from '@/platform/classroom-state.ts';

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type ClassroomCommandResult =
  | { ok: true }
  | { ok: false; status: number; error: string; currentRevision?: number };

export interface ClassroomCommandClient {
  submitLessonIntent(input: {
    sessionId: string;
    lessonRunId: string;
    expectedRevision: number;
    intent: ClassroomLessonIntent;
    responseView?: 'projector';
  }): Promise<ClassroomCommandResult>;
  submitAssessment(
    sessionId: string,
    command: ClassroomAssessmentCommand,
  ): Promise<ClassroomCommandResult>;
  submitLessonLifecycle(input: {
    sessionId: string;
    lessonRunId: string;
    expectedRevision: number;
    command: { type: 'start' | 'pause' | 'resume' } | { type: 'close'; collectAssessment: boolean };
  }): Promise<ClassroomCommandResult>;
}

export interface ClassroomCommandAuthority {
  sessionId: string;
  lessonRunId: string;
  classroomRevision: number;
  snapshotVersion: number;
  responseView?: 'projector';
}

export interface ClassroomCommandRunner {
  synchronizeAuthority(authority: ClassroomCommandAuthority): void;
  submitLessonIntent(intent: ClassroomLessonIntent): Promise<boolean>;
  submitAssessment(command: ClassroomAssessmentCommand): Promise<boolean>;
  submitLessonLifecycle(
    command: { type: 'start' | 'pause' | 'resume' } | { type: 'close'; collectAssessment: boolean },
  ): Promise<boolean>;
  isAwaitingAuthoritativeCut(): boolean;
  lastError(): string | undefined;
}

export function canSubmitClassroomCursorCommands(
  connectionState: 'connecting' | 'online' | 'degraded' | 'offline',
  lessonStatus: 'preparing' | 'active' | 'paused' | 'closed' | undefined,
): boolean {
  return connectionState !== 'offline' && lessonStatus === 'active';
}

export function createClassroomCommandRunner(input: {
  authority: ClassroomCommandAuthority;
  client?: ClassroomCommandClient;
  refreshNow: () => void;
}): ClassroomCommandRunner {
  let authority = input.authority;
  let awaitingAfterSnapshotVersion: number | undefined;
  let error: string | undefined;
  const client = input.client ?? createClassroomCommandClient();
  const finish = (result: ClassroomCommandResult): boolean => {
    if (!result.ok) {
      error = result.error;
      if (result.status === 409) {
        input.refreshNow();
        if (result.currentRevision !== undefined) {
          awaitingAfterSnapshotVersion = authority.snapshotVersion;
        }
      }
      return false;
    }
    error = undefined;
    awaitingAfterSnapshotVersion = authority.snapshotVersion;
    input.refreshNow();
    return true;
  };
  const canSubmit = (): boolean => {
    if (awaitingAfterSnapshotVersion === undefined) return true;
    error = 'Waiting for the authoritative classroom cut to refresh.';
    return false;
  };
  return {
    synchronizeAuthority(next) {
      if (next.snapshotVersion < authority.snapshotVersion) return;
      authority = next;
      if (awaitingAfterSnapshotVersion !== undefined
        && next.snapshotVersion > awaitingAfterSnapshotVersion) {
        awaitingAfterSnapshotVersion = undefined;
        error = undefined;
      }
    },
    async submitLessonIntent(intent) {
      if (!canSubmit()) return false;
      return finish(await client.submitLessonIntent({
        sessionId: authority.sessionId,
        lessonRunId: authority.lessonRunId,
        expectedRevision: authority.classroomRevision,
        intent,
        ...(authority.responseView ? { responseView: authority.responseView } : {}),
      }));
    },
    async submitAssessment(command) {
      if (!canSubmit()) return false;
      return finish(await client.submitAssessment(authority.sessionId, command));
    },
    async submitLessonLifecycle(command) {
      if (!canSubmit()) return false;
      return finish(await client.submitLessonLifecycle({
        sessionId: authority.sessionId,
        lessonRunId: authority.lessonRunId,
        expectedRevision: authority.classroomRevision,
        command,
      }));
    },
    isAwaitingAuthoritativeCut: () => awaitingAfterSnapshotVersion !== undefined,
    lastError: () => error,
  };
}

export function createClassroomCommandClient(fetchImpl: FetchLike = fetch): ClassroomCommandClient {
  return {
    async submitLessonIntent(input) {
      const suffix = input.responseView === 'projector' ? '?view=projector' : '';
      const result = await requestJson(fetchImpl,
        `/api/class-sessions/${encodeURIComponent(input.sessionId)}/lesson${suffix}`,
        {
          lessonRunId: input.lessonRunId,
          expectedRevision: input.expectedRevision,
          intent: input.intent,
        },
        'PATCH',
      );
      if (!result.ok) return result;
      return { ok: true };
    },
    async submitAssessment(sessionId, command) {
      const result = await requestJson(fetchImpl,
        `/api/class-sessions/${encodeURIComponent(sessionId)}/assessment`,
        { command },
        'POST',
      );
      return result.ok ? { ok: true } : result;
    },
    async submitLessonLifecycle(input) {
      const result = await requestJson(fetchImpl,
        `/api/class-sessions/${encodeURIComponent(input.sessionId)}/lesson`,
        {
          lessonRunId: input.lessonRunId,
          expectedRevision: input.expectedRevision,
          command: input.command,
        },
        'PATCH',
      );
      if (!result.ok) return result;
      return { ok: true };
    },
  };
}

async function requestJson(
  fetchImpl: FetchLike,
  url: string,
  body: unknown,
  method: 'PATCH' | 'POST',
): Promise<{ ok: true; body: unknown } | Exclude<ClassroomCommandResult, { ok: true }>> {
  try {
    const response = await fetchImpl(url, {
      method,
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const responseBody: unknown = await response.json().catch(() => ({}));
    if (response.ok) return { ok: true, body: responseBody };
    const record = isRecord(responseBody) ? responseBody : {};
    const currentRevision = safeRevision(record.currentRevision);
    return {
      ok: false,
      status: response.status,
      error: typeof record.error === 'string' ? record.error : `Classroom command failed (${response.status})`,
      ...(currentRevision === undefined ? {} : { currentRevision }),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : 'Classroom command network failure',
    };
  }
}

function safeRevision(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
