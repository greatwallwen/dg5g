'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createClassSessionPoller,
  resolvePollTier,
  type PollClock,
} from '@/features/classroom/class-session-polling.ts';
import type {
  AuthoritativeSnapshot,
  SnapshotAudience,
} from '@/platform/authoritative-snapshot.ts';

export type AudienceSnapshot<Audience extends SnapshotAudience> = Extract<
  AuthoritativeSnapshot,
  { audience: Audience }
>;

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type AuthoritativeSnapshotConnectionState = 'connecting' | 'online' | 'degraded' | 'offline';

export interface AuthoritativeSnapshotConnection {
  state: AuthoritativeSnapshotConnectionState;
  lastError?: string;
  lastSyncedAt?: string;
}

export interface AuthoritativeSnapshotState<Audience extends SnapshotAudience> {
  snapshot: AudienceSnapshot<Audience>;
  connection: AuthoritativeSnapshotConnection;
}

export interface AuthoritativeSnapshotPollContext {
  visible: boolean;
  online: boolean;
  participationMode?: 'follow' | 'self';
}

export interface AuthoritativeSnapshotController<Audience extends SnapshotAudience> {
  getState(): AuthoritativeSnapshotState<Audience>;
  start(): void;
  refreshNow(): void;
  stop(): void;
}

export interface AuthoritativeSnapshotHookState<Audience extends SnapshotAudience>
  extends AuthoritativeSnapshotState<Audience> {
  refreshNow(): void;
}

export interface AuthoritativeSnapshotHookOptions {
  participationMode?: 'follow' | 'self';
}

export function createAuthoritativeSnapshotController<Audience extends SnapshotAudience>(input: {
  audience: Audience;
  sessionId: string;
  initialSnapshot: AudienceSnapshot<Audience>;
  clock: PollClock;
  getPollContext: () => AuthoritativeSnapshotPollContext;
  fetchSnapshot?: () => Promise<AudienceSnapshot<Audience>>;
  onChange?: (state: AuthoritativeSnapshotState<Audience>) => void;
}): AuthoritativeSnapshotController<Audience> {
  let running = false;
  let state: AuthoritativeSnapshotState<Audience> = {
    snapshot: input.initialSnapshot,
    connection: { state: 'connecting' },
  };

  const publish = (next: AuthoritativeSnapshotState<Audience>) => {
    state = next;
    input.onChange?.(state);
  };

  const publishFailure = (
    connectionState: Extract<AuthoritativeSnapshotConnectionState, 'degraded' | 'offline'>,
    lastError: string,
  ) => publish({
    snapshot: state.snapshot,
    connection: {
      state: connectionState,
      lastError,
      ...(state.connection.lastSyncedAt === undefined
        ? {}
        : { lastSyncedAt: state.connection.lastSyncedAt }),
    },
  });

  const poller = createClassSessionPoller({
    clock: input.clock,
    getTier: () => {
      const context = input.getPollContext();
      return resolvePollTier({
        role: input.audience === 'student'
          ? 'student'
          : input.audience === 'projector' ? 'projector' : 'teacher',
        visible: context.visible,
        online: context.online,
        participationMode: context.participationMode,
        sessionStatus: state.snapshot.classroom.status,
      });
    },
    poll: async () => {
      try {
        const next = await (input.fetchSnapshot?.()
          ?? fetchAuthoritativeSnapshot(input.audience, input.sessionId));
        if (!running) return;
        assertMatchingSnapshotCut(next, input.audience, input.sessionId);
        assertNotStale(state.snapshot, next);
        const online = input.getPollContext().online;
        const connection: AuthoritativeSnapshotConnection = online
          ? { state: 'online', lastSyncedAt: next.serverNow }
          : {
              state: 'offline',
              lastError: 'Classroom network is offline.',
              lastSyncedAt: next.serverNow,
            };
        publish({
          snapshot: next,
          connection,
        });
      } catch (error) {
        if (!running) return;
        publishFailure(input.getPollContext().online ? 'degraded' : 'offline', errorMessage(error));
      }
    },
  });

  return {
    getState: () => state,
    start() {
      if (running) return;
      running = true;
      if (!input.getPollContext().online) {
        publishFailure('offline', 'Classroom network is offline.');
      }
      poller.start();
    },
    refreshNow() {
      if (!running) return;
      if (!input.getPollContext().online) {
        publishFailure('offline', 'Classroom network is offline.');
      }
      poller.refreshNow();
    },
    stop() {
      running = false;
      poller.stop();
    },
  };
}

export async function fetchAuthoritativeSnapshot<Audience extends SnapshotAudience>(
  audience: Audience,
  sessionId: string,
  fetchImpl: FetchLike = fetch,
): Promise<AudienceSnapshot<Audience>> {
  const search = new URLSearchParams({ audience, sessionId });
  const response = await fetchImpl(`/api/snapshot?${search.toString()}`, {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = isRecord(body) && typeof body.error === 'string' ? `: ${body.error}` : '';
    throw new Error(`Snapshot request failed (${response.status})${detail}`);
  }
  assertMatchingSnapshotCut(body, audience, sessionId);
  return body as AudienceSnapshot<Audience>;
}

export function useAuthoritativeSnapshotState<Audience extends SnapshotAudience>(
  initialSnapshot: AudienceSnapshot<Audience>,
  audience: Audience,
  sessionId: string,
  options: AuthoritativeSnapshotHookOptions = {},
): AuthoritativeSnapshotHookState<Audience> {
  const [state, setState] = useState<AuthoritativeSnapshotState<Audience>>({
    snapshot: initialSnapshot,
    connection: { state: 'connecting' },
  });
  const controllerRef = useRef<AuthoritativeSnapshotController<Audience>>();
  const participationModeRef = useRef(options.participationMode);
  const previousParticipationModeRef = useRef(options.participationMode);
  participationModeRef.current = options.participationMode;

  const refreshNow = useCallback(() => {
    controllerRef.current?.refreshNow();
  }, []);

  useEffect(() => {
    setState({ snapshot: initialSnapshot, connection: { state: 'connecting' } });
    const controller = createAuthoritativeSnapshotController({
      audience,
      sessionId,
      initialSnapshot,
      clock: {
        setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
        clearTimeout: (timerId) => window.clearTimeout(timerId),
      },
      getPollContext: () => ({
        visible: document.visibilityState === 'visible',
        online: typeof navigator === 'undefined' || navigator.onLine,
        participationMode: participationModeRef.current,
      }),
      onChange: setState,
    });
    controllerRef.current = controller;
    const wake = () => controller.refreshNow();
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    window.addEventListener('offline', wake);
    controller.start();
    return () => {
      controller.stop();
      if (controllerRef.current === controller) controllerRef.current = undefined;
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
      window.removeEventListener('offline', wake);
    };
  }, [audience, initialSnapshot, sessionId]);

  useEffect(() => {
    const previous = previousParticipationModeRef.current;
    previousParticipationModeRef.current = options.participationMode;
    if (previous !== options.participationMode) refreshNow();
  }, [options.participationMode, refreshNow]);

  return { ...state, refreshNow };
}

function assertMatchingSnapshotCut(
  body: unknown,
  audience: SnapshotAudience,
  sessionId: string,
): asserts body is AuthoritativeSnapshot {
  if (!isRecord(body) || body.audience !== audience) {
    throw new Error('Snapshot response audience mismatch.');
  }
  if (!isRecord(body.classroom) || body.classroom.sessionId !== sessionId) {
    throw new Error('Snapshot response session mismatch.');
  }
  if (!isSafeRevision(body.snapshotVersion)
    || !isSafeRevision(body.classroom.revision)
    || typeof body.serverNow !== 'string'
    || !Number.isFinite(Date.parse(body.serverNow))) {
    throw new Error('Snapshot classroom cut is incomplete.');
  }
  const activeLesson = body.classroom.activeLesson;
  if (activeLesson === undefined) return;
  if (!isRecord(activeLesson)
    || !isRecord(activeLesson.cursor)
    || !isSafeRevision(activeLesson.revision)
    || !isSafeRevision(activeLesson.cursor.revision)
    || body.classroom.revision !== activeLesson.revision
    || activeLesson.revision !== activeLesson.cursor.revision) {
    throw new Error('Snapshot classroom cut is incoherent.');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSafeRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function assertNotStale<Audience extends SnapshotAudience>(
  current: AudienceSnapshot<Audience>,
  incoming: AudienceSnapshot<Audience>,
): void {
  if (incoming.snapshotVersion < current.snapshotVersion
    || incoming.classroom.revision < current.classroom.revision) {
    throw new Error('Snapshot response is stale.');
  }
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : 'Snapshot request failed.';
}

export function useAuthoritativeSnapshot<Audience extends SnapshotAudience>(
  initialSnapshot: AudienceSnapshot<Audience>,
  audience: Audience,
  sessionId: string,
  _intervalMs?: number,
): AudienceSnapshot<Audience> {
  return useAuthoritativeSnapshotState(initialSnapshot, audience, sessionId).snapshot;
}
