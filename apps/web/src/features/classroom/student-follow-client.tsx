'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ClassSession } from '../../platform/models.ts';
import {
  createClassroomParticipationClient,
  type ClassroomParticipationSnapshot,
} from './classroom-participation-client.ts';
import {
  buildClassroomFollowViewModel,
  selectClassroomStudentScreen,
  type ClassroomContentCatalog,
  type SelfStudyReturnTarget,
} from './classroom-follow-model.ts';
import { ClassroomStudentModeRenderer } from './classroom-follow-renderer.tsx';
import {
  changeStudentClassroomMode,
  joinStudentClassroom,
  leaveStudentClassroom,
} from './student-follow-runtime.ts';
import { useClassSession } from './use-class-session.ts';
import { useClassroomPresence } from './classroom-presence-client.ts';
import { AccountMenu } from '../auth/account-menu.tsx';

type ClassroomLifecycle = 'preparing' | 'active' | 'paused' | 'closed';
type MutationState = 'idle' | 'joining' | 'saving' | 'leaving' | 'error';

export interface StudentFollowClientProps {
  contentCatalog: ClassroomContentCatalog;
  displayName: string;
  initialParticipation: ClassroomParticipationSnapshot;
  initialSession: ClassSession;
  returnTarget: SelfStudyReturnTarget;
  sessionStatus: ClassroomLifecycle;
  studentId: string;
}

export function StudentFollowClient({
  contentCatalog,
  displayName,
  initialParticipation,
  initialSession,
  returnTarget,
  sessionStatus,
  studentId,
}: StudentFollowClientProps) {
  const gateway = useMemo(() => createClassroomParticipationClient(), []);
  const [participation, setParticipation] = useState(initialParticipation);
  const [mutationState, setMutationState] = useState<MutationState>('idle');
  const [error, setError] = useState<string>();
  const mode = participation.participation?.state === 'joined'
    ? participation.participation.mode
    : undefined;
  const [session, , connection] = useClassSession(initialSession, {
    role: 'student',
    studentId,
    participationMode: mode,
  });
  const revision = session.lessonState?.revision ?? 0;
  const liveSessionStatus = session.sessionStatus ?? sessionStatus;
  useClassroomPresence({
    sessionId: session.sessionId,
    surface: 'student-follow',
    audience: 'student',
    pageState: liveSessionStatus === 'closed' ? 'closed' : 'ready',
    lastSeenClassroomRevision: revision,
  });
  const [lastFollowedRevision, setLastFollowedRevision] = useState(revision);
  useEffect(() => {
    if (mode === 'follow') setLastFollowedRevision(revision);
  }, [mode, revision]);

  const participationState = participation.participation?.state === 'joined'
    ? {
        state: 'joined' as const,
        mode: participation.participation.mode,
        lastFollowedRevision,
      }
    : { state: participation.participation?.state ?? 'missing' as const };
  const screen = selectClassroomStudentScreen({
    participation: participationState,
    teacherRevision: revision,
    returnTarget,
    sessionStatus: liveSessionStatus,
  });
  const followResult = screen.kind === 'follow' && session.lessonState
    ? buildClassroomFollowViewModel({
        sessionId: session.sessionId,
        revision,
        phase: session.lessonState.phase,
        activeNodeId: session.lessonState.activeNodeId,
        activeUnitId: session.lessonState.activeUnitId,
        activityState: session.activityState,
      }, contentCatalog, returnTarget)
    : undefined;

  async function joinNow() {
    setMutationState('joining');
    setError(undefined);
    try {
      setParticipation(await joinStudentClassroom(gateway, session.sessionId));
      setMutationState('idle');
    } catch (cause) {
      setMutationState('error');
      setError(errorMessage(cause));
    }
  }

  async function setMode(nextMode: 'follow' | 'self') {
    setMutationState('saving');
    setError(undefined);
    try {
      const snapshot = await changeStudentClassroomMode(gateway, session.sessionId, nextMode);
      if (nextMode === 'self') setLastFollowedRevision(revision);
      setParticipation(snapshot);
      setMutationState('idle');
    } catch (cause) {
      setMutationState('error');
      setError(errorMessage(cause));
    }
  }

  async function returnToSelfStudy() {
    const navigate = (href: string) => window.location.assign(href);
    if (participation.participation?.state !== 'joined') {
      navigate(returnTarget.href);
      return;
    }
    setMutationState('leaving');
    setError(undefined);
    try {
      const snapshot = await leaveStudentClassroom(
        gateway,
        session.sessionId,
        returnTarget.href,
        navigate,
      );
      setParticipation(snapshot);
    } catch (cause) {
      setMutationState('error');
      setError(errorMessage(cause));
    }
  }

  const busy = mutationState === 'joining' || mutationState === 'saving' || mutationState === 'leaving';
  return (
    <main
      className="follow-app scene-student-follow classroom-runtime"
      data-classroom-revision={revision}
      data-connection-state={connection.state}
      data-joined-count={participation.joinedCount}
      data-following-count={participation.followingCount}
      data-session-id={session.sessionId}
      data-session-status={liveSessionStatus}
      data-student-mode={screen.kind === 'follow' ? 'follow' : screen.kind === 'self' ? 'self' : 'entry'}
      data-ui-surface="dark"
    >
      <header className="follow-topbar scene-classroom-topbar">
        <a className="scene-classroom-brand" href="/student/home"><span>DG</span><strong>5G网络优化（高级）</strong><small>课堂跟随</small></a>
        <div>
          <strong>{session.sessionId}</strong>
          <small>{lifecycleLabel(liveSessionStatus)} · revision {revision}</small>
        </div>
        <nav>
          <span data-classroom-connection={connection.state}><i />{connectionLabel(connection.state)}</span>
          <AccountMenu
            beforeLogout={async () => {
              if (participation.participation?.state === 'joined') {
                await gateway.leave(session.sessionId);
              }
            }}
            displayName={displayName}
            role="student"
          />
        </nav>
      </header>

      {followResult && !followResult.ok ? (
        <section className="classroom-content-unavailable" data-classroom-content-unavailable={followResult.reason}>
          <span>课堂内容不可用</span>
          <h1>教师当前页面与生成教材不匹配</h1>
          <p>系统不会回退到其他节点，请等待教师重新定位课堂页面。</p>
          <button data-return-href={returnTarget.href} onClick={() => void returnToSelfStudy()} type="button">返回完整自学</button>
        </section>
      ) : (
        <ClassroomStudentModeRenderer
          busy={busy}
          error={error}
          followModel={followResult?.ok ? followResult.value : undefined}
          onJoin={() => void joinNow()}
          onModeChange={(nextMode) => void setMode(nextMode)}
          onReturn={() => void returnToSelfStudy()}
          screen={screen}
          sessionStatus={liveSessionStatus}
        />
      )}
    </main>
  );
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : '课堂连接失败，请重试。';
}

function lifecycleLabel(status: ClassroomLifecycle): string {
  return {
    preparing: '课堂准备中',
    active: '课堂进行中',
    paused: '课堂已暂停',
    closed: '课堂已结束',
  }[status];
}

function connectionLabel(state: 'connecting' | 'online' | 'degraded' | 'offline'): string {
  return {
    connecting: '正在连接',
    online: '课堂连接正常',
    degraded: '课堂连接降级',
    offline: '课堂暂时离线',
  }[state];
}
