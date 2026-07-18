'use client';

import { useEffect } from 'react';

export type ClassroomPresenceSurface = 'student-follow' | 'teacher-console' | 'projector';
export type ClassroomPresenceAudience = 'student' | 'teacher' | 'projector';
export type ClassroomPresenceVisibility = 'visible' | 'hidden';
export type ClassroomPresencePageState = 'closed' | 'opening' | 'ready' | 'hidden' | 'error';

const devicePrefix = 'browser';

export function classroomPresenceStorageKey(sessionId: string, surface: ClassroomPresenceSurface): string {
  return `dgbook:classroom-presence:${sessionId}:${surface}`;
}

export function presenceIntervalFor(visibility: ClassroomPresenceVisibility): number {
  return visibility === 'visible' ? 3_000 : 10_000;
}

export function useClassroomPresence(input: {
  sessionId: string;
  surface: ClassroomPresenceSurface;
  audience: ClassroomPresenceAudience;
  pageState: ClassroomPresencePageState;
  lastSeenClassroomRevision: number;
}): void {
  const { audience, lastSeenClassroomRevision, pageState, sessionId, surface } = input;

  useEffect(() => {
    let disposed = false;
    let timer: number | undefined;
    let controller: AbortController | undefined;
    const deviceId = readOrCreateDeviceId(classroomPresenceStorageKey(sessionId, surface));

    const syncThenHeartbeat = async () => {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      try {
        await fetch(`/api/snapshot?${new URLSearchParams({ audience, sessionId })}`, {
          cache: 'no-store', credentials: 'same-origin', signal,
        });
        if (disposed || signal.aborted) return;
        const visibility = document.visibilityState === 'visible' ? 'visible' : 'hidden';
        await fetch(`/api/class-sessions/${encodeURIComponent(sessionId)}/presence`, {
          method: 'POST',
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deviceId,
            visibility,
            pageState: visibility === 'hidden' ? 'hidden' : pageState,
            lastSeenClassroomRevision,
          }),
          signal,
        });
      } catch {
        // Presence is observational: a network failure never fabricates offline state.
      }
    };

    const schedule = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      const visibility = document.visibilityState === 'visible' ? 'visible' : 'hidden';
      timer = window.setTimeout(async () => {
        await syncThenHeartbeat();
        if (!disposed) schedule();
      }, presenceIntervalFor(visibility));
    };

    const heartbeatNow = () => {
      void syncThenHeartbeat().finally(() => {
        if (!disposed) schedule();
      });
    };
    const onVisibilityChange = () => heartbeatNow();
    const onReconnect = () => heartbeatNow();

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('online', onReconnect);
    heartbeatNow();
    return () => {
      disposed = true;
      if (timer !== undefined) window.clearTimeout(timer);
      controller?.abort();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('online', onReconnect);
    };
  }, [audience, lastSeenClassroomRevision, pageState, sessionId, surface]);
}

function readOrCreateDeviceId(storageKey: string): string {
  const existing = window.sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const suffix = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const deviceId = `${devicePrefix}-${suffix}`;
  window.sessionStorage.setItem(storageKey, deviceId);
  return deviceId;
}
