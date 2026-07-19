'use client';

import { useEffect, useMemo, useState } from 'react';
import type { StudentAuthoritativeSnapshot } from '../../platform/authoritative-snapshot.ts';
import { AccountMenu } from '../auth/account-menu.tsx';
import { useAuthoritativeSnapshotState } from '../snapshot/authoritative-snapshot-client.ts';
import {
  createClassroomParticipationClient,
} from './classroom-participation-client.ts';
import { useClassroomPresence } from './classroom-presence-client.ts';
import {
  buildClassroomFollowViewModel,
  selectClassroomStudentScreen,
  type ClassroomActivityCatalog,
  type SelfStudyReturnTarget,
} from './classroom-follow-model.ts';
import { ClassroomStudentModeRenderer } from './classroom-follow-renderer.tsx';
import {
  changeStudentClassroomMode,
  joinStudentClassroom,
  leaveStudentClassroom,
} from './student-follow-runtime.ts';

type MutationState = 'idle' | 'joining' | 'saving' | 'leaving' | 'error';

export interface StudentFollowClientProps {
  activityCatalog: ClassroomActivityCatalog;
  displayName: string;
  initialSnapshot: StudentAuthoritativeSnapshot;
  returnTarget: SelfStudyReturnTarget;
}

export function StudentFollowClient({
  activityCatalog,
  displayName,
  initialSnapshot,
  returnTarget,
}: StudentFollowClientProps) {
  const gateway = useMemo(() => createClassroomParticipationClient(), []);
  const [mutationState, setMutationState] = useState<MutationState>('idle');
  const [error, setError] = useState<string>();
  const { snapshot, connection, refreshAfterSnapshotVersion } = useAuthoritativeSnapshotState(
    initialSnapshot,
    'student',
    initialSnapshot.classroom.sessionId,
  );
  const participation = snapshot.participation;
  const mode = participation?.state === 'joined' ? participation.mode : undefined;

  useClassroomPresence({
    sessionId: snapshot.classroom.sessionId,
    surface: 'student-follow',
    audience: 'student',
    pageState: snapshot.classroom.status === 'closed' ? 'closed' : 'ready',
    lastSeenClassroomRevision: snapshot.classroom.revision,
  });

  const [lastFollowedRevision, setLastFollowedRevision] = useState(snapshot.classroom.revision);
  useEffect(() => {
    if (mode === 'follow') setLastFollowedRevision(snapshot.classroom.revision);
  }, [mode, snapshot.classroom.revision]);

  const participationState = participation?.state === 'joined'
    ? { state: 'joined' as const, mode: participation.mode, lastFollowedRevision }
    : { state: participation?.state ?? 'missing' as const };
  const screen = selectClassroomStudentScreen({
    participation: participationState,
    teacherRevision: snapshot.classroom.revision,
    returnTarget,
    sessionStatus: snapshot.classroom.status,
  });
  const followResult = screen.kind === 'follow'
    ? buildClassroomFollowViewModel(snapshot, activityCatalog, returnTarget)
    : undefined;

  async function joinNow() {
    setMutationState('joining');
    setError(undefined);
    try {
      const beforeVersion = snapshot.snapshotVersion;
      await joinStudentClassroom(gateway, snapshot.classroom.sessionId);
      await refreshAfterSnapshotVersion(beforeVersion);
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
      const beforeVersion = snapshot.snapshotVersion;
      await changeStudentClassroomMode(
        gateway,
        snapshot.classroom.sessionId,
        nextMode,
      );
      const authoritative = await refreshAfterSnapshotVersion(beforeVersion);
      if (authoritative.participation?.state === 'joined'
        && authoritative.participation.mode === 'self') {
        setLastFollowedRevision(authoritative.classroom.revision);
      }
      setMutationState('idle');
    } catch (cause) {
      setMutationState('error');
      setError(errorMessage(cause));
    }
  }

  async function returnToSelfStudy() {
    const navigate = (href: string) => window.location.assign(href);
    if (participation?.state !== 'joined') {
      navigate(returnTarget.href);
      return;
    }
    setMutationState('leaving');
    setError(undefined);
    try {
      const beforeVersion = snapshot.snapshotVersion;
      await leaveStudentClassroom(gateway, snapshot.classroom.sessionId);
      const authoritative = await refreshAfterSnapshotVersion(beforeVersion);
      if (authoritative.participation?.state !== 'left') {
        throw new Error('Classroom participation changed before navigation was confirmed.');
      }
      navigate(returnTarget.href);
    } catch (cause) {
      setMutationState('error');
      setError(errorMessage(cause));
    }
  }

  const busy = mutationState === 'joining' || mutationState === 'saving' || mutationState === 'leaving';
  return (
    <main
      className="follow-app scene-student-follow classroom-runtime"
      data-classroom-revision={snapshot.classroom.revision}
      data-connection-state={connection.state}
      data-joined-count={snapshot.membership.joinedCount}
      data-following-count={snapshot.membership.followingCount}
      data-session-id={snapshot.classroom.sessionId}
      data-session-status={snapshot.classroom.status}
      data-student-mode={screen.kind === 'follow' ? 'follow' : screen.kind === 'self' ? 'self' : 'entry'}
      data-primary-action-policy="exactly-one"
      data-ui-surface="dark"
    >
      <header className="follow-topbar scene-classroom-topbar">
        <a className="scene-classroom-brand" href="/student/home"><span>DG</span><strong>5G网络优化（高级）</strong><small>课堂跟随</small></a>
        <div>
          <strong>{snapshot.classroom.sessionId}</strong>
          <small>{lifecycleLabel(snapshot.classroom.status)} · revision {snapshot.classroom.revision}</small>
        </div>
        <nav>
          <span data-classroom-connection={connection.state}><i />{connectionLabel(connection.state)}</span>
          <AccountMenu
            beforeLogout={async () => {
              if (participation?.state === 'joined') {
                const beforeVersion = snapshot.snapshotVersion;
                await leaveStudentClassroom(gateway, snapshot.classroom.sessionId);
                await refreshAfterSnapshotVersion(beforeVersion);
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
          <h1>教师当前页面与正式教材不匹配</h1>
          <p>系统不会回退到其他节点，请等待教师重新定位课堂页面。</p>
          <button data-primary-action data-return-href={returnTarget.href} onClick={() => void returnToSelfStudy()} type="button">返回完整自学</button>
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
          sessionStatus={snapshot.classroom.status}
        />
      )}
    </main>
  );
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : '课堂连接失败，请重试。';
}

function lifecycleLabel(status: StudentAuthoritativeSnapshot['classroom']['status']): string {
  return {
    preparing: '课堂准备中', active: '课堂进行中', paused: '课堂已暂停', closed: '课堂已结束',
  }[status];
}

function connectionLabel(state: 'connecting' | 'online' | 'degraded' | 'offline'): string {
  return {
    connecting: '正在连接', online: '课堂连接正常', degraded: '课堂连接降级', offline: '课堂暂时离线',
  }[state];
}
