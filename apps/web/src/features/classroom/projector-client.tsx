'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { ProjectorAuthoritativeSnapshot } from '@/platform/authoritative-snapshot';
import { RoleGate } from '@/features/auth/role-gate';
import { SharedClassroomScene, profileForNodeId, unitForNodeId } from '@/features/textbook-scene/shared-classroom-scene';
import { FullscreenToggle } from '@/features/textbook-scene/fullscreen-toggle';
import { followerFrame } from '@/features/playback/classroom-playback-frame';
import { playbackSceneForLearningUnit } from '@/features/textbook-scene/learning-playback';
import { Icon } from '@/ui/foundation/icons';
import { getNodeLearningPolicy } from '@/platform/learning-policy';
import type { DemoTaskProfiles } from '@/features/platform/deep-textbook-demo-data';
import { type AuthoritativeSnapshotConnection, useAuthoritativeSnapshotState } from '@/features/snapshot/authoritative-snapshot-client';
import { authoritativeDomFacts } from '@/features/snapshot/snapshot-dom-facts';
import { teachingPageFor } from '@/features/textbook-scene/p1-teaching-package';
import { useClassroomPresence } from './classroom-presence-client';
import { useClassroomCommands } from './use-classroom-commands';
import { canSubmitClassroomCursorCommands } from './classroom-command-client';
import { NoActiveClassroomLessonView } from './teacher-console-view';
import { type AssessmentCountdownBaseline, synchronizeAssessmentCountdownBaseline } from './teacher-console-view-props';

export function ProjectorClient({ initialSnapshot, profiles }: {
  initialSnapshot: ProjectorAuthoritativeSnapshot;
  profiles: DemoTaskProfiles;
}) {
  const sessionId = initialSnapshot.classroom.sessionId;
  const { snapshot, connection, refreshNow } = useAuthoritativeSnapshotState(initialSnapshot, 'projector', sessionId);
  useClassroomPresence({
    sessionId,
    surface: 'projector',
    audience: 'projector',
    pageState: snapshot.classroom.status === 'closed' ? 'closed' : 'ready',
    lastSeenClassroomRevision: snapshot.classroom.revision,
  });
  const rootRef = useRef<HTMLElement>(null);
  const activeLesson = snapshot.classroom.activeLesson;
  if (!activeLesson) {
    return <NoActiveClassroomLessonView
      connectionState={connection.state} facts={authoritativeDomFacts(snapshot)}
      rootRef={rootRef} sessionId={sessionId} surface="projector"
    />;
  }
  return <ActiveProjector
    activeLesson={activeLesson} connection={connection} key={activeLesson.runId}
    profiles={profiles} refreshNow={refreshNow} rootRef={rootRef} snapshot={snapshot}
  />;
}

function ActiveProjector({ activeLesson, connection, profiles, refreshNow, rootRef, snapshot }: {
  activeLesson: NonNullable<ProjectorAuthoritativeSnapshot['classroom']['activeLesson']>;
  connection: AuthoritativeSnapshotConnection;
  profiles: DemoTaskProfiles;
  refreshNow: () => void;
  rootRef: RefObject<HTMLElement>;
  snapshot: ProjectorAuthoritativeSnapshot;
}) {
  const sessionId = snapshot.classroom.sessionId;
  const cursor = activeLesson.cursor;
  const authority = useMemo(() => ({
    sessionId,
    lessonRunId: activeLesson.runId,
    classroomRevision: snapshot.classroom.revision,
    snapshotVersion: snapshot.snapshotVersion,
    responseView: 'projector' as const,
  }), [activeLesson.runId, sessionId, snapshot.classroom.revision, snapshot.snapshotVersion]);
  const commands = useClassroomCommands(authority, refreshNow);
  const pageCount = activeLesson.pageCount;
  const currentPageIndex = cursor.pageIndex;
  const teachingPage = teachingPageFor(activeLesson.lessonId, currentPageIndex);
  const nodeId = teachingPage.nodeId;
  const profile = profileForNodeId(nodeId, profiles);
  const unit = unitForNodeId(nodeId, profiles);
  const activePlayback = useMemo(
    () => playbackSceneForLearningUnit(unit, profile.taskId),
    [profile.taskId, unit],
  );
  const lessonState = cursor ? {
    phase: cursor.phase === 'assessment' ? 'challenge' as const : cursor.phase,
    activeNodeId: cursor.nodeId,
    activeUnitId: cursor.unitId,
    revision: cursor.revision,
    playback: {
      sceneId: `${cursor.nodeId}-lesson`, actionId: cursor.actionId,
      actionIndex: cursor.actionIndex, status: cursor.playbackStatus,
      positionMs: cursor.positionMs, rate: cursor.rate, revision: cursor.revision,
      audioOwner: cursor.audioOwner,
    },
  } : undefined;
  const narrationFrame = lessonState ? followerFrame(activePlayback, lessonState.playback) : null;
  const formalPassScore = getNodeLearningPolicy(nodeId)?.formalPassScore;
  const formalAssessment = snapshot.submissions.activeAssessment;
  const reviewActive = formalAssessment.status === 'reviewing';
  const formalTestActive = Boolean(teachingPage.formalAssessment)
    && formalAssessment.status !== 'idle' && !reviewActive;
  const facts = authoritativeDomFacts(snapshot);
  const cursorControlsAvailable = canSubmitClassroomCursorCommands(
    connection.state,
    activeLesson.status,
  );
  const remainingSeconds = useAssessmentRemainingSeconds(
    formalAssessment,
    snapshot.serverNow,
    snapshot.snapshotVersion,
  );

  async function changePage(nextPageIndex: number) {
    if (!cursorControlsAvailable || commands.busy || nextPageIndex < 0 || nextPageIndex >= pageCount) return;
    await commands.submitLessonIntent({ type: 'page_changed', pageIndex: nextPageIndex });
  }

  return (
    <main className="projector-app scene-projector-app"
      data-class-size={facts.classSize} data-classroom-revision={facts.classroomRevision}
      data-formal-passed={facts.formalPassed} data-formal-submitted={facts.formalSubmitted}
      data-motion="paused" data-primary-action-policy="none"
      data-snapshot-version={facts.snapshotVersion} data-ui-surface="dark" ref={rootRef}>
      <RoleGate requiredRole="teacher" title="请先登录教师端"
        description="投屏端由教师控制，只展示全班共同焦点，不包含教师讲稿与学生个人作答。">
        <header className="projector-topbar scene-projector-topbar"
          data-slide-index={currentPageIndex + 1} data-control-source="teacher-display">
          <span><Icon name="screen" size={20} /> {profile.taskId} · {unit.capabilityNodeId}</span>
          <strong>{teachingPage.title}</strong>
          <div className="projector-page-controls">
            <Link data-session-action="back-to-teacher" href={`/teacher/sessions/${sessionId}`}>返回教师端</Link>
            <button aria-label="上一页" data-session-action="previous-page"
              disabled={!cursorControlsAvailable || commands.busy || currentPageIndex === 0}
              onClick={() => void changePage(currentPageIndex - 1)} type="button">上一页</button>
            <em>{currentPageIndex + 1} / {pageCount}</em>
            <button aria-label="下一页" data-session-action="next-page"
              disabled={!cursorControlsAvailable || commands.busy || currentPageIndex === pageCount - 1}
              onClick={() => void changePage(currentPageIndex + 1)} type="button">下一页</button>
            <FullscreenToggle targetRef={rootRef} />
          </div>
        </header>
        <section className="role-scope is-projector scene-projector-role scene-role-marker"
          data-role-scope="projector" aria-label="投屏只读共同场景" />
        <section className="projector-stage scene-projector-stage" data-ui-surface="dark">
          {reviewActive
            ? <ProjectorReview assessment={formalAssessment} />
            : formalTestActive && formalPassScore !== undefined
              ? <ProjectorFormalTest assessment={formalAssessment} formalPassScore={formalPassScore}
                  nodeId={nodeId} remainingSeconds={remainingSeconds} title={unit.title} />
              : <SharedClassroomScene actionIndex={cursor?.actionIndex} pageIndex={currentPageIndex + 1}
                  phase={lessonState?.phase} profile={profile} surface="projector" unit={unit} />}
        </section>
        <footer className="projector-footer scene-projector-footer"
          data-formal-test-status={formalAssessment.status}
          data-playback-status={narrationFrame?.status ?? 'idle'}
          data-projector-control-source="teacher-display"
          data-projector-narration={narrationFrame?.actionId ?? 'waiting'}>
          <span className="projector-control-note"><i />教师同步 · revision {snapshot.classroom.revision}</span>
          <strong>{narrationFrame?.caption ?? (reviewActive ? '课堂讲评中' : `当前活动：${unit.action}`)}</strong>
          <span className="projector-control-note"><Icon name="play" size={15} /> 第 {currentPageIndex + 1} / {pageCount} 页</span>
          <small>{formalAssessment.eligibleCount && formalPassScore !== undefined
            ? `正式测试 ${formalAssessment.submittedCount}/${formalAssessment.eligibleCount} 已提交 · ≥${formalPassScore}分 ${formalAssessment.passedCount}人`
            : teachingPage.studentAction}</small>
          {connection.state === 'offline' ? <small className="projector-control-error">课堂网络离线，翻页同步已停用</small>
            : activeLesson.status !== 'active' ? <small className="projector-control-error">课堂已暂停，翻页同步已停用</small>
            : commands.error ? <small className="projector-control-error" role="alert">{commands.error}</small> : null}
        </footer>
      </RoleGate>
    </main>
  );
}

export function assessmentRemainingSeconds(
  assessment: ProjectorAuthoritativeSnapshot['submissions']['activeAssessment'],
  serverNow: string,
  elapsedSinceCutMs = 0,
): number {
  if (assessment.status === 'paused') return Math.max(0, assessment.remainingSecondsWhenPaused ?? 0);
  if (assessment.status !== 'running' || !assessment.expiresAt) return 0;
  const remainingMs = Date.parse(assessment.expiresAt) - Date.parse(serverNow)
    - Math.max(0, elapsedSinceCutMs);
  return Number.isFinite(remainingMs) ? Math.max(0, Math.ceil(remainingMs / 1000)) : 0;
}

function useAssessmentRemainingSeconds(
  assessment: ProjectorAuthoritativeSnapshot['submissions']['activeAssessment'],
  serverNow: string,
  snapshotVersion: number,
): number {
  const receivedRef = useRef<AssessmentCountdownBaseline>();
  const baseline = synchronizeAssessmentCountdownBaseline(
    receivedRef.current,
    snapshotVersion,
    serverNow,
    monotonicNow(),
  );
  receivedRef.current = baseline;
  const [now, setNow] = useState(monotonicNow);
  useEffect(() => {
    setNow(monotonicNow());
    if (assessment.status !== 'running') return;
    const timer = window.setInterval(() => setNow(monotonicNow()), 1_000);
    return () => window.clearInterval(timer);
  }, [assessment.status, assessment.expiresAt, serverNow, snapshotVersion]);
  return assessmentRemainingSeconds(assessment, serverNow, now - baseline.receivedAtMs);
}

function monotonicNow(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

const reviewDimensionLabels = {
  evidenceClassification: '证据分类', linkReconstruction: '链路重建',
  defectiveOutputRevision: '成果修订', professionalConclusion: '职业结论',
} as const;

function ProjectorReview({ assessment }: {
  assessment: ProjectorAuthoritativeSnapshot['submissions']['activeAssessment'];
}) {
  const rows = assessment.errorDistribution?.map(({ dimension, incorrectCount, percent }) => ({
    dimension, incorrectCount, percent,
  })) ?? [];
  return <section className="projector-review" data-anonymous-review>
    <header><span>匿名讲评</span><h1>班级错误分布</h1><p>仅展示错误维度、人数和比例，不展示学生身份、个人答案或个人分数。</p></header>
    <div>{rows.map((item) => <article key={item.dimension}>
      <strong>{reviewDimensionLabels[item.dimension]}</strong><span>{item.incorrectCount} 人 · {item.percent}%</span>
      <i><b style={{ width: `${item.percent}%` }} /></i>
    </article>)}</div>
  </section>;
}

function ProjectorFormalTest({ nodeId, title, formalPassScore, assessment, remainingSeconds }: {
  nodeId: string;
  title: string;
  formalPassScore: number;
  assessment: ProjectorAuthoritativeSnapshot['submissions']['activeAssessment'];
  remainingSeconds: number;
}) {
  const clock = `${String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:${String(remainingSeconds % 60).padStart(2, '0')}`;
  return <section className="projector-formal-test" data-projector-formal-test={nodeId}>
    <header><span>正式测试 · 共同进度</span><h1>{title}</h1><p>{nodeId} · 学生作答内容与个人成绩不在投屏端显示</p></header>
    <div className="projector-test-clock"><small>{assessment.status === 'paused' ? '测试已暂停' : '剩余时间'}</small><strong>{clock}</strong><span>服务端统一计时</span></div>
    <div className="projector-test-progress"><strong>{assessment.submittedCount}<small> / {assessment.eligibleCount}</small></strong><span>已提交</span><i><b style={{ width: `${assessment.submissionPercent}%` }} /></i></div>
    <div className="projector-test-stats"><article><Icon name="target" size={28} /><span><small>作答中</small><strong>{assessment.playingCount}</strong></span></article><article><Icon name="check" size={28} /><span><small>已提交</small><strong>{assessment.submittedCount}</strong></span></article><article><Icon name="chart" size={28} /><span><small>达到{formalPassScore}分</small><strong>{assessment.passedCount}</strong></span></article></div>
    <footer><i /><span>教师端正在监控班级节奏</span><strong>完成后统一进入讲评</strong></footer>
  </section>;
}
