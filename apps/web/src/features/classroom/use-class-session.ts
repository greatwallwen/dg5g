'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ClassroomLessonIntent } from '@/platform/classroom-state';
import type { ClassSession } from '@/platform/models';
import { studentClassroomActionFromPatch } from '@/platform/student-classroom-action';
import { hasSessionPatch, normalizeSessionPatch, parseSessionMessage, type SessionMessage, type SessionPatch, type SessionRole } from './session-protocol';
import { createHttpClassroomTransport, selectNewerClassSession } from './classroom-transport';
import { createClassSessionPoller, resolvePollTier, type ClassSessionPoller } from './class-session-polling';
import { applyTeacherPatchWithRecovery } from './teacher-patch-mutation';

export type { SessionPatch, SessionRole } from './session-protocol';

export type ClassSessionConnectionState = 'connecting' | 'online' | 'degraded' | 'offline';
export type ClassSessionConnection = {
  state: ClassSessionConnectionState;
  lastError?: string;
  lastSyncedAt?: string;
};

type UpdateSession = (patch: SessionPatch) => void;
type SubmitClassroomIntent = (intent: ClassroomLessonIntent) => Promise<boolean>;

export function useClassSession(
  initial: ClassSession,
  options: {
    role: SessionRole;
    studentId?: string;
    participationMode?: 'follow' | 'self';
    allowProjectorControls?: boolean;
  },
): [ClassSession, UpdateSession, ClassSessionConnection, SubmitClassroomIntent] {
  const studentParam = options.role === 'student' ? options.studentId?.trim() || undefined : undefined;
  const actorKey = `${options.role}:${studentParam ?? 'shared'}`;
  const initialValue = useMemo(() => ({ ...initial }), [actorKey, initial]);
  const transport = useMemo(() => createHttpClassroomTransport(), []);
  const [session, setSession] = useState<ClassSession>(initialValue);
  const sessionRef = useRef<ClassSession>(initialValue);
  const participationModeRef = useRef(options.participationMode);
  const pollerRef = useRef<ClassSessionPoller>();
  const intentQueueRef = useRef<Promise<void>>(Promise.resolve());
  const operationKey = `${initial.sessionId}:${actorKey}`;
  const activeOperationKeyRef = useRef(operationKey);
  const teacherRevisionSynchronizedRef = useRef(true);
  const [connection, setConnection] = useState<ClassSessionConnection>({ state: 'connecting' });
  const connectionRef = useRef<ClassSessionConnection>({ state: 'connecting' });
  const channelName = `dgbook:class-session:${initial.sessionId}`;
  const sourceId = useMemo(() => `${actorKey}:client-${Math.random().toString(36).slice(2)}`, [actorKey]);

  function updateConnection(next: ClassSessionConnection, key = operationKey) {
    if (activeOperationKeyRef.current !== key) return;
    connectionRef.current = next;
    setConnection(next);
  }

  function acceptSession(incoming: ClassSession, key = operationKey): ClassSession | null {
    if (activeOperationKeyRef.current !== key) return null;
    const next = selectNewerClassSession(sessionRef.current, incoming);
    sessionRef.current = next;
    setSession(next);
    return next;
  }

  async function ensureTeacherRevision(key: string): Promise<boolean> {
    if (teacherRevisionSynchronizedRef.current) return true;
    const refreshed = await transport.fetchSession(
      initial.sessionId,
      options.role === 'projector' ? 'projector' : 'teacher',
    );
    if (activeOperationKeyRef.current !== key) return false;
    if (!refreshed.ok) {
      updateConnection({
        state: refreshed.status === 0 ? 'offline' : 'degraded',
        lastError: refreshed.error,
      }, key);
      return false;
    }
    acceptSession(refreshed.data, key);
    teacherRevisionSynchronizedRef.current = true;
    return true;
  }

  useEffect(() => { sessionRef.current = session; }, [session]);

  useEffect(() => {
    const previous = participationModeRef.current;
    participationModeRef.current = options.participationMode;
    if (options.participationMode === 'follow' && previous !== 'follow') {
      pollerRef.current?.refreshNow();
    }
  }, [options.participationMode]);

  useEffect(() => {
    activeOperationKeyRef.current = operationKey;
    teacherRevisionSynchronizedRef.current = true;
    intentQueueRef.current = Promise.resolve();
    setSession(initialValue);
    sessionRef.current = initialValue;
    updateConnection({ state: 'connecting' }, operationKey);
    let alive = true;

    async function refresh() {
      const result = await transport.fetchSession(initial.sessionId, options.role, studentParam);
      if (alive) {
        if (result.ok) {
          acceptSession(result.data, operationKey);
          if (options.role === 'teacher'
            || (options.role === 'projector' && options.allowProjectorControls)) {
            teacherRevisionSynchronizedRef.current = true;
          }
          updateConnection({ state: 'online', lastSyncedAt: new Date().toISOString() }, operationKey);
        } else {
          updateConnection({ state: result.status === 0 ? 'offline' : 'degraded', lastError: result.error }, operationKey);
        }
      }
    }

    const poller = createClassSessionPoller({
      clock: {
        setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
        clearTimeout: (timerId) => window.clearTimeout(timerId),
      },
      getTier: () => resolvePollTier({
        role: options.role,
        visible: document.visibilityState === 'visible',
        online: connectionRef.current.state === 'connecting' || connectionRef.current.state === 'online',
        participationMode: participationModeRef.current,
        sessionStatus: sessionRef.current.sessionStatus,
      }),
      poll: refresh,
    });
    pollerRef.current = poller;
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(channelName);
    if (channel) {
      channel.onmessage = (event) => {
        const message = parseSessionMessage(event.data);
        if (!message || message.sourceId === sourceId) return;
        if (options.role === 'projector' && message.sourceRole !== 'teacher') return;
        poller.refreshNow();
      };
    }
    const refreshForVisibility = () => poller.refreshNow();
    const refreshWhenOnline = () => poller.refreshNow();
    const markOffline = () => {
      updateConnection({ state: 'offline', lastError: 'Classroom network is offline.' }, operationKey);
      poller.refreshNow();
    };
    document.addEventListener('visibilitychange', refreshForVisibility);
    window.addEventListener('online', refreshWhenOnline);
    window.addEventListener('offline', markOffline);
    poller.start();
    return () => {
      alive = false;
      poller.stop();
      if (pollerRef.current === poller) pollerRef.current = undefined;
      document.removeEventListener('visibilitychange', refreshForVisibility);
      window.removeEventListener('online', refreshWhenOnline);
      window.removeEventListener('offline', markOffline);
      channel?.close();
    };
  }, [channelName, initial.sessionId, initialValue, operationKey, options.allowProjectorControls, options.role, sourceId, studentParam, transport]);

  function update(patch: SessionPatch) {
    const writableRole = options.role === 'teacher' ? 'teacher' : options.role === 'student' ? 'student' : null;
    if (!writableRole) return;
    const outgoing = writableRole === 'teacher' ? normalizeSessionPatch('teacher', patch) : patch;
    if (writableRole === 'teacher' && !hasSessionPatch(outgoing)) return;
    if (writableRole === 'student' && !studentClassroomActionFromPatch(outgoing)) return;
    if (writableRole === 'teacher') {
      const mutationKey = operationKey;
      intentQueueRef.current = intentQueueRef.current.then(async () => {
        if (activeOperationKeyRef.current !== mutationKey) return;
        if (!await ensureTeacherRevision(mutationKey)) return;
        const result = await applyTeacherPatchWithRecovery(
          transport,
          initial.sessionId,
          sessionRef.current,
          outgoing,
          () => activeOperationKeyRef.current === mutationKey,
        );
        if (activeOperationKeyRef.current !== mutationKey) return;
        teacherRevisionSynchronizedRef.current = result.ok || result.revisionSynchronized;
        acceptSession(result.session, mutationKey);
        if (result.ok) {
          updateConnection({ state: 'online', lastSyncedAt: new Date().toISOString() }, mutationKey);
          notifyPeers('teacher', sourceId, channelName, {}, result.session.lessonState?.revision ?? Date.now());
        } else {
          updateConnection({ state: result.status === 0 ? 'offline' : 'degraded', lastError: result.error }, mutationKey);
        }
      }).catch((error) => {
        updateConnection({
          state: 'degraded',
          lastError: error instanceof Error ? error.message : 'Classroom update failed',
        }, mutationKey);
      });
      return;
    }
    const mutationKey = operationKey;
    void transport.patchSession(initial.sessionId, writableRole, studentParam, outgoing).then((result) => {
      if (activeOperationKeyRef.current !== mutationKey) return;
      if (result.ok) {
        acceptSession(result.data, mutationKey);
        updateConnection({ state: 'online', lastSyncedAt: new Date().toISOString() }, mutationKey);
        notifyPeers(writableRole, sourceId, channelName, {});
      } else {
        updateConnection({ state: result.status === 0 ? 'offline' : 'degraded', lastError: result.error }, mutationKey);
      }
    });
  }

  async function submitIntent(intent: ClassroomLessonIntent): Promise<boolean> {
    const canSubmitIntent = options.role === 'teacher'
      || (options.role === 'projector' && options.allowProjectorControls);
    if (!canSubmitIntent) return false;
    const mutationKey = operationKey;
    let resolveResult: (value: boolean) => void = () => undefined;
    const resultPromise = new Promise<boolean>((resolve) => { resolveResult = resolve; });
    intentQueueRef.current = intentQueueRef.current.then(async () => {
      if (activeOperationKeyRef.current !== mutationKey || !await ensureTeacherRevision(mutationKey)) {
        resolveResult(false);
        return;
      }
      const expectedRevision = sessionRef.current.lessonState?.revision ?? 0;
      const lessonRunId = sessionRef.current.activeLessonRunId;
      if (!lessonRunId) {
        updateConnection({ state: 'degraded', lastError: '请先开始当前课次。' }, mutationKey);
        resolveResult(false);
        return;
      }
      const result = await transport.submitIntent(
        initial.sessionId,
        lessonRunId,
        intent,
        expectedRevision,
        options.role === 'projector' ? 'projector' : undefined,
      );
      if (activeOperationKeyRef.current !== mutationKey) {
        resolveResult(false);
        return;
      }
      if (!result.ok) {
        if (result.status === 409) {
          teacherRevisionSynchronizedRef.current = false;
          const synchronized = await ensureTeacherRevision(mutationKey);
          if (synchronized) {
            updateConnection({ state: 'degraded', lastError: '课堂状态已刷新，请重试刚才的操作。' }, mutationKey);
          }
        } else {
          updateConnection({ state: result.status === 0 ? 'offline' : 'degraded', lastError: result.error }, mutationKey);
        }
        resolveResult(false);
        return;
      }
      teacherRevisionSynchronizedRef.current = true;
      acceptSession(result.data.session, mutationKey);
      updateConnection({ state: 'online', lastSyncedAt: new Date().toISOString() }, mutationKey);
      notifyPeers('teacher', sourceId, channelName, {}, result.data.session.lessonState?.revision ?? expectedRevision + 1);
      resolveResult(true);
    }).catch(() => resolveResult(false));
    return resultPromise;
  }

  return [session, update, connection, submitIntent];
}

function notifyPeers(
  sourceRole: SessionRole,
  sourceId: string,
  channelName: string,
  patch: SessionPatch,
  revision = Date.now(),
) {
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel(channelName);
  channel.postMessage({ sourceRole, sourceId, patch, revision } satisfies SessionMessage);
  channel.close();
}
