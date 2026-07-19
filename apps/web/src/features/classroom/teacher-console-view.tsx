import Link from 'next/link';
import type { RefObject } from 'react';
import { RoleGate } from '@/features/auth/role-gate';
import { AccountMenu } from '@/features/auth/account-menu';
import { ClassroomPlaybackController } from '@/features/playback/classroom-playback-controller';
import { SharedClassroomScene } from '@/features/textbook-scene/shared-classroom-scene';
import { Icon } from '@/ui/foundation/icons';
import { FullscreenToggle } from '@/features/textbook-scene/fullscreen-toggle';
import type { AuthoritativeDomFacts } from '@/features/snapshot/snapshot-dom-facts';
import { TeacherConsoleInspector } from './teacher-console-inspector';
import type { TeacherConsoleViewProps } from './teacher-console-view-props';

export type TeacherPrimaryAction =
  | 'reconnect-session' | 'start-lesson' | 'resume-lesson'
  | 'start-formal-test' | 'pause-formal-test' | 'resume-formal-test'
  | 'begin-review' | 'push-page' | 'next-page' | 'end-lesson' | 'return-workbench';

export function teacherPrimaryActionForPhase(input: {
  phase: NonNullable<TeacherConsoleViewProps['session']['lessonState']>['phase'];
  formalTestAvailable: boolean;
  formalTestRunning?: boolean;
  hasNextNode?: boolean;
  controlsAvailable: boolean;
  classroomStatus?: TeacherConsoleViewProps['session']['sessionStatus'];
  lessonStatus?: TeacherConsoleViewProps['session']['lessonRunStatus'];
  assessmentStatus?: TeacherConsoleViewProps['formalAssessment']['status'];
  canBeginReview?: boolean;
  hasNextPage?: boolean;
  hasOrdinaryActivity?: boolean;
}): TeacherPrimaryAction {
  if (input.classroomStatus === 'closed' || input.lessonStatus === 'closed') return 'return-workbench';
  if (!input.controlsAvailable) return 'reconnect-session';
  if (input.lessonStatus === 'preparing' || input.phase === 'prepare') return 'start-lesson';
  if (input.lessonStatus === 'paused') return 'resume-lesson';
  const assessmentStatus = input.assessmentStatus
    ?? (input.formalTestRunning ? 'running' : 'idle');
  if (assessmentStatus === 'running') {
    return input.canBeginReview ? 'begin-review' : 'pause-formal-test';
  }
  if (assessmentStatus === 'paused') return 'resume-formal-test';
  if (assessmentStatus === 'reviewing' || input.phase === 'review') {
    return (input.hasNextPage ?? input.hasNextNode) ? 'next-page' : 'end-lesson';
  }
  if (input.phase === 'challenge' && input.formalTestAvailable && assessmentStatus === 'idle') {
    return 'start-formal-test';
  }
  if (input.hasOrdinaryActivity !== false) return 'push-page';
  return (input.hasNextPage ?? input.hasNextNode) ? 'next-page' : 'end-lesson';
}

export function TeacherConsoleView(p: TeacherConsoleViewProps) {
  const phase = p.session.lessonState?.phase ?? 'prepare';
  const hasNextPage = p.pageIndex < p.pageCount - 1;
  const primaryAction = teacherPrimaryActionForPhase({
    phase,
    formalTestAvailable: Boolean(p.teachingPage.formalAssessment),
    assessmentStatus: p.formalAssessment.status,
    canBeginReview: p.formalAssessment.canBeginReview,
    hasNextPage,
    hasOrdinaryActivity: p.teachingPage.canonicalActivityIds.length > 0,
    controlsAvailable: p.controlsAvailable && !p.commandBusy,
    classroomStatus: p.session.sessionStatus,
    lessonStatus: p.session.lessonRunStatus,
  });
  return (
    <main
      className={`teacher-console scene-teacher-console${p.playbackOpen ? ' has-open-narration' : ''}`}
      data-inspector-open={p.inspectorOpen ? 'true' : 'false'}
      data-motion={p.playbackOpen ? 'active' : 'paused'}
      data-primary-action-policy="exactly-one"
      data-ui-surface="dark"
      data-slide-index={p.pageIndex + 1}
      data-teacher-control-mode={p.controlMode}
      data-snapshot-version={p.authoritativeFacts.snapshotVersion}
      data-classroom-revision={p.authoritativeFacts.classroomRevision}
      data-class-size={p.authoritativeFacts.classSize}
      data-formal-submitted={p.authoritativeFacts.formalSubmitted}
      data-formal-passed={p.authoritativeFacts.formalPassed}
      data-teaching-lesson={p.teachingPage.lessonId}
      data-teaching-page={p.teachingPage.id}
    >
      <RoleGate requiredRole="teacher" title="请先登录教师端"
        description="教师端用于组织共同课堂、推送任务、复核证据和认证专业产出。">
        <header className="teacher-topbar scene-classroom-topbar">
          <a className="scene-classroom-brand" href="/"><span>DG</span><strong>5G网络优化（高级）</strong><small>教师授课</small></a>
          <div><strong>{p.profile.taskId} / {p.profile.title}</strong><small>课堂 / {p.rosterStats.follow}人跟随 / {p.rosterStats.self}人自学</small></div>
          <nav>
            <span className={`teacher-helper-pill is-${p.connectionStatus}`} data-classroom-connection-state={p.connectionStatus}>
              <i />{p.connectionStatus === 'offline'
                ? '课堂连接暂时离线'
                : p.onlineStudentDeviceCount === 0
                  ? '课堂连接正常 · 当前无学生设备在线，不影响备课'
                  : `课堂连接正常 · ${p.onlineStudentDeviceCount}人在线`}
            </span>
            <a href={`/present/${p.session.sessionId}`} target="_blank">投屏预览</a>
            <button aria-label={p.inspectorOpen ? '收起教师检查器' : '打开教师检查器'}
              onClick={() => p.inspectorOpen ? p.closeInspector() : p.setInspectorOpen(true)}
              ref={p.inspectorButtonRef} type="button"><Icon name="layers" size={18} /></button>
            <AccountMenu displayName={p.displayName} role="teacher" />
          </nav>
        </header>
        <section className="role-scope is-teacher scene-role-marker" data-role-scope="teacher">
          <strong>教师私有工作区</strong><span>讲稿、学情与认证只在教师端呈现。</span>
        </section>
        <div className={`teacher-grid scene-teacher-grid${p.inspectorOpen ? '' : ' is-inspector-closed'}`}>
          <aside className="slide-rail scene-slide-rail" aria-label="课时六页结构">
            <header><span>{p.profile.taskId}</span><strong>{p.teachingPage.lessonId} · 6页</strong></header>
            {p.pages.map((page, index) => (
              <button className={index === p.pageIndex ? 'is-active' : ''} key={page.id}
                disabled={!p.cursorControlsAvailable || p.commandBusy} onClick={() => p.go(index)} type="button">
                <span>{index + 1}</span><p><strong>{page.title}</strong><small>{page.nodeId}</small></p>
              </button>
            ))}
          </aside>
          <section className="teacher-stage scene-teacher-stage">
            <div className="stage-header"><span>共同课堂 / {p.unit.capabilityNodeId} / 第{p.pageIndex + 1}页（共{p.pageCount}页）</span><a href={`/present/${p.session.sessionId}`}>全屏投屏</a></div>
            <SharedClassroomScene actionIndex={p.session.lessonState?.playback.actionIndex}
              pageIndex={p.pageIndex + 1} phase={phase} profile={p.profile} surface="teacher" unit={p.unit} />
          </section>
          <TeacherConsoleInspector p={p} />
        </div>
        {p.playbackOpen && p.session.lessonState ? (
          <div className="classroom-playback-strip scene-teacher-playback" data-narration-track={p.unit.capabilityNodeId}>
            <ClassroomPlaybackController key={p.unit.capabilityNodeId} lesson={p.session.lessonState}
              scene={p.activePlayback} submitIntent={p.submitIntent} surface="teacher" variant="track" />
          </div>
        ) : null}
        <footer className="teacher-footer scene-teacher-controls" data-primary-action-id={primaryAction}
          data-teacher-verification-state={p.verificationActionState}>
          <div className="teacher-primary-control"><TeacherPrimaryActionButton action={primaryAction} p={p} /></div>
          <details className="teacher-more-actions">
            <summary><Icon name="layers" size={17} />更多操作</summary>
            <div>
              <button disabled={!p.cursorControlsAvailable || p.commandBusy || p.pageIndex === 0} onClick={() => p.go(p.pageIndex - 1)} type="button">上一页</button>
              <button disabled={!p.cursorControlsAvailable || p.commandBusy || !hasNextPage} onClick={() => p.go(p.pageIndex + 1)} type="button">下一页</button>
              <button onClick={() => p.setPlaybackOpen((value) => !value)} type="button">{p.playbackOpen ? '收起播报' : '打开播报'}</button>
              {p.session.lessonRunStatus === 'active' && p.formalAssessment.status !== 'running'
                && p.formalAssessment.status !== 'paused'
                ? <button data-session-action="pause-lesson" disabled={!p.controlsAvailable || p.commandBusy} onClick={p.pauseLesson} type="button">暂停课堂</button>
                : null}
              {p.formalAssessment.status === 'running' ? <button data-session-action="pause-formal-test" disabled={!p.controlsAvailable || p.commandBusy} onClick={p.pauseFormalTest} type="button">暂停测试</button> : null}
              {p.formalAssessment.status === 'paused' ? <button data-session-action="resume-formal-test" disabled={!p.controlsAvailable || p.commandBusy} onClick={p.resumeFormalTest} type="button">继续测试</button> : null}
              {p.formalAssessment.status === 'running' || p.formalAssessment.status === 'paused'
                ? <button data-session-action="collect-formal-test" disabled={!p.controlsAvailable || p.commandBusy} onClick={p.collectFormalTest} type="button">提前收卷</button> : null}
              <button data-session-action="begin-review"
                disabled={!p.controlsAvailable || p.commandBusy || p.formalAssessment.submittedCount === 0 || !p.formalAssessment.canBeginReview}
                onClick={p.beginReview} title={p.formalAssessment.submittedCount === 0 ? '至少收到 1 份当前正式测试提交后才能讲评' : undefined} type="button">进入讲评</button>
              <button data-session-action="end-lesson" disabled={!p.controlsAvailable || p.commandBusy} onClick={p.endLesson} type="button">
                {p.formalAssessment.status === 'running' || p.formalAssessment.status === 'paused' ? '收卷并结束课堂' : '结束课堂'}
              </button>
            </div>
          </details>
          <span>{p.verificationMessage || (p.commandBusy ? '课堂命令处理中…' : p.unit.action)}</span>
        </footer>
      </RoleGate>
    </main>
  );
}

function TeacherPrimaryActionButton({ action, p }: { action: TeacherPrimaryAction; p: TeacherConsoleViewProps }) {
  if (action === 'reconnect-session') return <button className="is-primary" data-primary-action
    data-session-action="reconnect-session" onClick={() => window.location.reload()} type="button">重新连接课堂</button>;
  if (action === 'return-workbench') return <a className="is-primary" data-primary-action data-session-action="return-workbench" href="/teacher/workbench">返回授课工作台</a>;
  const common = { className: 'is-primary', 'data-primary-action': true, disabled: !p.controlsAvailable || p.commandBusy } as const;
  if (action === 'start-lesson') return <button {...common} data-session-action="start-lesson" onClick={p.startLesson} type="button">开始本课</button>;
  if (action === 'resume-lesson') return <button {...common} data-session-action="resume-lesson" onClick={p.resumeLesson} type="button">继续课堂</button>;
  if (action === 'start-formal-test') return <button {...common} data-session-action="start-formal-test" onClick={p.startFormalTest} type="button">启动正式测试</button>;
  if (action === 'pause-formal-test') return <button {...common} data-session-action="pause-formal-test" onClick={p.pauseFormalTest} type="button">暂停正式测试</button>;
  if (action === 'resume-formal-test') return <button {...common} data-session-action="resume-formal-test" onClick={p.resumeFormalTest} type="button">继续正式测试</button>;
  if (action === 'begin-review') return <button {...common} data-session-action="begin-review"
    disabled={!p.controlsAvailable || p.commandBusy || p.formalAssessment.submittedCount === 0 || !p.formalAssessment.canBeginReview}
    onClick={p.beginReview} type="button">{p.formalAssessment.submittedCount === 0 ? '等待学生提交' : '进入讲评'}</button>;
  if (action === 'next-page') return <button {...common} data-session-action="next-page"
    disabled={!p.cursorControlsAvailable || p.commandBusy} onClick={() => p.go(p.pageIndex + 1)} type="button">下一页</button>;
  if (action === 'end-lesson') return <button {...common} data-session-action="end-lesson" onClick={p.endLesson} type="button">结束课堂</button>;
  return <button {...common} data-session-action="push-page" disabled={!p.cursorControlsAvailable || p.commandBusy}
    onClick={p.pushPage} type="button">推送 {p.teachingPage.id}</button>;
}

export function NoActiveClassroomLessonView(props: {
  connectionState: 'connecting' | 'online' | 'degraded' | 'offline';
  facts: AuthoritativeDomFacts;
  sessionId: string;
} & (
  | { surface: 'teacher'; displayName: string }
  | { surface: 'projector'; rootRef: RefObject<HTMLElement> }
)) {
  const data = {
    'data-classroom-revision': props.facts.classroomRevision,
    'data-classroom-state': 'no-active-lesson',
    'data-no-active-lesson': true,
    'data-snapshot-version': props.facts.snapshotVersion,
  } as const;
  if (props.surface === 'teacher') return <main {...data} className="teacher-console scene-teacher-console"
    data-primary-action-policy="exactly-one" data-ui-surface="dark">
    <RoleGate requiredRole="teacher" title="请先登录教师端"
      description="教师端用于组织共同课堂、推送任务、复核证据和认证专业产出。">
      <section className="teacher-empty-lesson" aria-live="polite">
        <span>{props.displayName}</span><h1>当前没有进行中的课时</h1>
        <p>上一课时已经结束，或下一课时尚未从授课工作台准备。此处不会展示其他课时内容。</p>
        {props.connectionState === 'offline'
          ? <button className="is-primary" data-primary-action data-session-action="reconnect-session"
              onClick={() => window.location.reload()} type="button">重新连接课堂</button>
          : <a className="is-primary" data-primary-action data-session-action="return-workbench"
              href="/teacher/workbench">返回授课工作台</a>}
        {props.connectionState === 'offline' ? <a href="/teacher/workbench">返回授课工作台</a> : null}
      </section>
    </RoleGate>
  </main>;
  return <main {...data} className="projector-app scene-projector-app" data-motion="paused"
    data-primary-action-policy="none" data-ui-surface="dark" ref={props.rootRef}>
    <RoleGate requiredRole="teacher" title="请先登录教师端"
      description="投屏端由教师控制，只展示全班共同焦点，不包含教师讲稿与学生个人作答。">
      <header className="projector-topbar scene-projector-topbar"><strong>当前没有进行中的课时</strong><div className="projector-page-controls">
        <Link data-session-action="back-to-teacher" href={`/teacher/sessions/${props.sessionId}`}>返回教师端</Link>
        <FullscreenToggle targetRef={props.rootRef} />
      </div></header>
      <section className="projector-stage scene-projector-stage" data-ui-surface="dark">
        <div className="projector-empty-lesson" aria-live="polite"><h1>等待教师准备下一课时</h1>
          <p>上一课时已经结束，或下一课时尚未开始。投屏端不会展示其他课时内容。</p>
          {props.connectionState === 'offline' ? <small>课堂网络离线，恢复网络后将自动重连。</small> : null}
        </div>
      </section>
    </RoleGate>
  </main>;
}
