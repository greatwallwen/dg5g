'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import type { ProjectorAuthoritativeSnapshot } from '@/platform/authoritative-snapshot';
import type { ProjectorClassSession } from '@/platform/class-session-projection';
import type { ClassSession, PlaybackScene, Task, TeacherSlide } from '@/platform/models';
import { RoleGate } from '@/features/auth/role-gate';
import { SharedClassroomScene, profileForNodeId, unitForNodeId } from '@/features/textbook-scene/shared-classroom-scene';
import { FullscreenToggle } from '@/features/textbook-scene/fullscreen-toggle';
import { followerFrame } from '@/features/playback/classroom-playback-frame';
import { playbackSceneForLearningUnit } from '@/features/textbook-scene/learning-playback';
import { Icon } from '@/ui/foundation/icons';
import { getNodeLearningPolicy } from '@/platform/learning-policy';
import type { DemoTaskProfiles } from '@/features/platform/deep-textbook-demo-data';
import { useAuthoritativeSnapshot } from '@/features/snapshot/authoritative-snapshot-client';
import { useClassSession } from './use-class-session';
import { authoritativeDomFacts } from '@/features/snapshot/snapshot-dom-facts';
import { classroomLessonPageCountFromCatalog } from '@/platform/classroom-lesson-page-catalog';

export function ProjectorClient({ slides, initialSession, initialSnapshot, task, playback, profiles }: { slides: TeacherSlide[]; initialSession: ProjectorClassSession; initialSnapshot: ProjectorAuthoritativeSnapshot; task: Task; playback: PlaybackScene; profiles: DemoTaskProfiles }) {
  const [session, , connection, submitIntent] = useClassSession(initialSession as ClassSession, {
    role: 'projector',
    allowProjectorControls: true,
  });
  const snapshot = useAuthoritativeSnapshot(initialSnapshot, 'projector', initialSession.sessionId);
  const rootRef = useRef<HTMLElement>(null);
  const [controlBusy, setControlBusy] = useState(false);
  const [controlError, setControlError] = useState<string>();
  const fallbackNodeId = slides[0]?.nodeId ?? 'P1T1-N01';
  const nodeId = snapshot.classroom.activeNodeId ?? session.activeNodeId ?? fallbackNodeId;
  const profile = profileForNodeId(nodeId, profiles);
  const unit = unitForNodeId(nodeId, profiles);
  const pageCount = classroomLessonPageCountFromCatalog(nodeId, slides.length);
  const currentPageIndex = Math.min(
    pageCount - 1,
    Math.max(0, session.lessonState?.playback.actionIndex ?? (session.teacherSlideIndex ?? 1) - 1),
  );
  const pageIndex = currentPageIndex + 1;
  const activePlayback = { ...playbackSceneForLearningUnit(unit, profile.taskId), presenterId: playback.presenterId };
  const narrationFrame = session.lessonState ? followerFrame(activePlayback, session.lessonState.playback) : null;
  const playbackIndex = (narrationFrame?.actionIndex ?? session.playbackCursor?.actionIndex ?? 0) + 1;
  const playbackCount = activePlayback.actions.length;
  const formalPassScore = getNodeLearningPolicy(nodeId)?.formalPassScore;
  const formalAssessment = snapshot.submissions.activeAssessment;
  const formalTestActive = session.sceneMode === 'challenge' && formalAssessment.status === 'running';
  const reviewActive = session.sceneMode === 'review' && Boolean(formalAssessment.errorDistribution?.length);
  const facts = authoritativeDomFacts(snapshot);
  const helperReady = snapshot.helper.canPush && connection.state !== 'offline';

  async function changePage(nextPageIndex: number) {
    if (!helperReady || controlBusy || nextPageIndex < 0 || nextPageIndex >= pageCount) return;
    setControlBusy(true);
    setControlError(undefined);
    const accepted = await submitIntent({ type: 'page_changed', pageIndex: nextPageIndex });
    if (!accepted) setControlError('课堂页未同步，请检查课堂助手连接后重试。');
    setControlBusy(false);
  }

  return (
    <main className="projector-app scene-projector-app"
      data-class-size={facts.classSize}
      data-classroom-revision={facts.classroomRevision}
      data-formal-passed={facts.formalPassed}
      data-formal-submitted={facts.formalSubmitted}
      data-motion="paused"
      data-primary-action-policy="none"
      data-snapshot-version={facts.snapshotVersion}
      data-ui-surface="dark" ref={rootRef}>
      <RoleGate requiredRole="teacher" title="请先登录教师端" description="投屏端由教师控制，只展示全班共同焦点，不包含教师脚本与学生个人答案。">
        <header className="projector-topbar scene-projector-topbar" data-slide-index={pageIndex} data-control-source="teacher-display">
          <span><Icon name="screen" size={20} /> {profile.taskId} · {unit.capabilityNodeId}</span>
          <strong>{profile.title}</strong>
          <div className="projector-page-controls">
            <Link data-session-action="back-to-teacher" href={`/teacher/sessions/${initialSession.sessionId}`}>返回教师端</Link>
            <button aria-label="上一页" data-session-action="previous-page" disabled={!helperReady || controlBusy || currentPageIndex === 0} onClick={() => void changePage(currentPageIndex - 1)} type="button">上一页</button>
            <em>授课包页 {pageIndex} / {pageCount}</em>
            <button aria-label="下一页" data-session-action="next-page" disabled={!helperReady || controlBusy || currentPageIndex === pageCount - 1} onClick={() => void changePage(currentPageIndex + 1)} type="button">下一页</button>
            <FullscreenToggle targetRef={rootRef} />
          </div>
        </header>
        <section className="role-scope is-projector scene-projector-role scene-role-marker" data-role-scope="projector" aria-label="投屏只读共同场景" />
        <section className="projector-stage scene-projector-stage" data-ui-surface="dark">
          {reviewActive
            ? <ProjectorReview assessment={formalAssessment} />
            : formalTestActive && formalPassScore !== undefined
              ? <ProjectorFormalTest assessment={formalAssessment} formalPassScore={formalPassScore} nodeId={nodeId} title={unit.title} />
              : <SharedClassroomScene actionIndex={currentPageIndex} pageIndex={pageIndex} phase={session.lessonState?.phase} profile={profile} surface="projector" unit={unit} />}
        </section>
        <footer className="projector-footer scene-projector-footer" data-formal-test-status={formalAssessment.status} data-playback-status={narrationFrame?.status ?? 'idle'} data-projector-control-source="teacher-display" data-projector-narration={narrationFrame?.actionId ?? 'waiting'}>
          <span className="projector-control-note"><i className={session.studentSyncState === 'forced' ? 'is-live' : ''} />教师同步</span>
          <strong>{narrationFrame?.caption ?? (session.reviewState === 'reviewing' ? '课堂讲评中' : `当前活动：${unit.action}`)}</strong>
          <span className="projector-control-note"><Icon name="play" size={15} /> 讲解动作 {Math.min(playbackIndex, playbackCount)} / {playbackCount}</span>
          <small>{formalAssessment.eligibleCount && formalPassScore !== undefined ? `正式测试 ${formalAssessment.submittedCount}/${formalAssessment.eligibleCount} 已提交 · ≥${formalPassScore}分 ${formalAssessment.passedCount}人` : task.output[0]}</small>
          {!helperReady ? <small className="projector-control-error">课堂助手离线，翻页同步已停用</small> : controlError ? <small className="projector-control-error" role="alert">{controlError}</small> : null}
        </footer>
      </RoleGate>
    </main>
  );
}

const reviewDimensionLabels = {
  evidenceClassification: '证据分类',
  linkReconstruction: '链路重建',
  defectiveOutputRevision: '成果修订',
  professionalConclusion: '职业结论',
} as const;

function ProjectorReview({ assessment }: { assessment: ProjectorAuthoritativeSnapshot['submissions']['activeAssessment'] }) {
  return <section className="projector-review" data-anonymous-review>
    <header><span>匿名讲评</span><h1>班级错误分布</h1><p>仅展示错误维度、人数和比例，不展示学生身份与个人作答。</p></header>
    <div>
      {assessment.errorDistribution?.map((item) => <article key={item.dimension}>
        <strong>{reviewDimensionLabels[item.dimension]}</strong>
        <span>{item.incorrectCount} 人 · {item.percent}%</span>
        <i><b style={{ width: `${item.percent}%` }} /></i>
      </article>)}
    </div>
  </section>;
}

function ProjectorFormalTest({ nodeId, title, formalPassScore, assessment }: { nodeId: string; title: string; formalPassScore: number; assessment: ProjectorAuthoritativeSnapshot['submissions']['activeAssessment'] }) {
  return <section className="projector-formal-test" data-projector-formal-test={nodeId}>
    <header><span>正式测试 · 共同进度</span><h1>{title}</h1><p>{nodeId} · 学生作答内容与个人成绩仅教师端可见</p></header>
    <div className="projector-test-clock"><small>测试时长</small><strong>06:00</strong><span>三阶段专业任务</span></div>
    <div className="projector-test-progress"><strong>{assessment.submittedCount}<small> / {assessment.eligibleCount}</small></strong><span>已提交</span><i><b style={{ width: `${assessment.submissionPercent}%` }} /></i></div>
    <div className="projector-test-stats"><article><Icon name="target" size={28} /><span><small>作答中</small><strong>{assessment.playingCount}</strong></span></article><article><Icon name="check" size={28} /><span><small>已提交</small><strong>{assessment.submittedCount}</strong></span></article><article><Icon name="chart" size={28} /><span><small>达到{formalPassScore}分</small><strong>{assessment.passedCount}</strong></span></article></div>
    <footer><i /><span>教师端正在监控班级节奏</span><strong>完成后统一进入讲评</strong></footer>
  </section>;
}
