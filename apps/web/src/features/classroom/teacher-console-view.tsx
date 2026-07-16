import { RoleGate } from '@/features/auth/role-gate';
import { AccountMenu } from '@/features/auth/account-menu';
import { ClassroomPlaybackController } from '@/features/playback/classroom-playback-controller';
import { SharedClassroomScene } from '@/features/textbook-scene/shared-classroom-scene';
import { Icon } from '@/ui/foundation/icons';
import { TeacherConsoleInspector } from './teacher-console-inspector';
import type { TeacherConsoleViewProps } from './teacher-console-view-props';

export type TeacherPrimaryAction = 'start-formal-test' | 'push-page' | 'begin-review' | 'next-node';

export function teacherPrimaryActionForPhase({
  phase,
  formalTestAvailable,
  formalTestRunning,
  hasNextNode,
  helperReady,
}: {
  phase: NonNullable<TeacherConsoleViewProps['session']['lessonState']>['phase'];
  formalTestAvailable: boolean;
  formalTestRunning: boolean;
  hasNextNode: boolean;
  helperReady: boolean;
}): TeacherPrimaryAction {
  if (phase === 'challenge' && formalTestAvailable && !formalTestRunning) return 'start-formal-test';
  if (phase === 'review' && hasNextNode) return 'next-node';
  if (helperReady) return 'push-page';
  return 'begin-review';
}

export function TeacherConsoleView(p: TeacherConsoleViewProps) {
  const hasNextNode = p.unitIndex < p.profile.units.length - 1;
  const primaryAction = teacherPrimaryActionForPhase({
    phase: p.session.lessonState?.phase ?? 'prepare',
    formalTestAvailable: Boolean(p.session.formalTest),
    formalTestRunning: p.session.formalTest?.status === 'running',
    hasNextNode,
    helperReady: p.helperReady,
  });
  return (
    <main
      className={`teacher-console scene-teacher-console${p.playbackOpen ? ' has-open-narration' : ''}`}
      data-inspector-open={p.inspectorOpen ? 'true' : 'false'}
      data-motion={p.playbackOpen ? 'active' : 'paused'}
      data-primary-action-policy="exactly-one"
      data-ui-surface="dark"
      data-slide-index={p.unitIndex + 1}
      data-teacher-control-mode={p.controlMode}
      data-snapshot-version={p.authoritativeFacts.snapshotVersion}
      data-classroom-revision={p.authoritativeFacts.classroomRevision}
      data-class-size={p.authoritativeFacts.classSize}
      data-formal-submitted={p.authoritativeFacts.formalSubmitted}
      data-formal-passed={p.authoritativeFacts.formalPassed}
    >
      <RoleGate requiredRole="teacher" title="请先登录教师端"
        description="教师端用于组织共同课堂、推送任务、复核证据和认证专业产出。">
        <header className="teacher-topbar scene-classroom-topbar">
          <a className="scene-classroom-brand" href="/">
            <span>DG</span><strong>5G网络优化（高级）</strong><small>教师授课</small>
          </a>
          <div>
            <strong>{p.profile.taskId} / {p.profile.title}</strong>
            <small>课堂 / {p.rosterStats.follow}人跟随 / {p.rosterStats.self}人自学</small>
          </div>
          <nav>
            <span className={`teacher-helper-pill is-${p.helperStatus}`}
              data-helper-state={p.helperStatus}>
              <i />{p.helperStatus === 'offline'
                ? '课堂进行中 · 助手离线'
                : `课堂助手 ${p.onlineStudentDeviceCount}人在线`}
            </span>
            <a href={`/present/${p.session.sessionId}`} target="_blank">投屏预览</a>
            <button aria-label={p.inspectorOpen ? '收起教师检查器' : '打开教师检查器'}
              onClick={() => p.inspectorOpen ? p.closeInspector() : p.setInspectorOpen(true)}
              ref={p.inspectorButtonRef} type="button">
              <Icon name="layers" size={18} />
            </button>
            <AccountMenu displayName={p.displayName} role="teacher" />
          </nav>
        </header>
        <section className="role-scope is-teacher scene-role-marker" data-role-scope="teacher">
          <strong>教师私有工作区</strong><span>讲稿、学情与认证只在教师端呈现。</span>
        </section>
        <div className={`teacher-grid scene-teacher-grid${p.inspectorOpen ? '' : ' is-inspector-closed'}`}>
          <aside className="slide-rail scene-slide-rail" aria-label="课时结构">
            <header><span>{p.profile.taskId}</span><strong>课时结构</strong></header>
            {p.profile.units.map((item: any, index: number) => (
              <button className={index === p.unitIndex ? 'is-active' : ''} key={item.id}
                onClick={() => p.go(index)} type="button">
                <span>{index + 1}</span>
                <p><strong>{item.title}</strong><small>{item.output}</small></p>
              </button>
            ))}
          </aside>
          <section className="teacher-stage scene-teacher-stage">
            <div className="stage-header">
              <span>共同课堂 / {p.unit.capabilityNodeId}</span>
              <a href={`/present/${p.session.sessionId}`}>全屏投屏</a>
            </div>
            <SharedClassroomScene
              actionIndex={p.session.lessonState?.playback.actionIndex
                ?? p.session.playbackCursor?.actionIndex}
              pageIndex={p.unitIndex + 1}
              phase={p.session.lessonState?.phase}
              profile={p.profile}
              surface="teacher"
              unit={p.unit}
            />
          </section>
          <TeacherConsoleInspector p={p} />
        </div>
        {p.playbackOpen && p.session.lessonState ? (
          <div className="classroom-playback-strip scene-teacher-playback"
            data-narration-track={p.unit.capabilityNodeId}>
            <ClassroomPlaybackController
              key={p.unit.capabilityNodeId}
              lesson={p.session.lessonState}
              onCursorChange={(playbackCursor) => p.update({ playbackCursor })}
              scene={p.activePlayback}
              submitIntent={p.submitIntent}
              surface="teacher"
              variant="track"
            />
          </div>
        ) : null}
        <footer className="teacher-footer scene-teacher-controls"
          data-primary-action-id={primaryAction}
          data-sync-state={p.session.studentSyncState ?? 'idle'}
          data-teacher-verification-state={p.verificationActionState}>
          <div className="teacher-primary-control">
            <TeacherPrimaryActionButton action={primaryAction} p={p} />
          </div>
          <details className="teacher-more-actions">
            <summary><Icon name="layers" size={17} />更多操作</summary>
            <div>
              <button disabled={p.unitIndex === 0} onClick={() => p.go(p.unitIndex - 1)} type="button">
                <Icon name="arrow" size={17} />上一节点
              </button>
              <button onClick={() => p.setPlaybackOpen((value) => !value)} type="button">
                <Icon name={p.playbackOpen ? 'pause' : 'play'} size={17} />
                {p.playbackOpen ? '收起播报' : '打开播报'}
              </button>
              {primaryAction !== 'start-formal-test' ? <button data-session-action="start-formal-test"
                disabled={!p.session.formalTest || p.session.formalTest.status === 'running'}
                onClick={p.startFormalTest} type="button">
                <Icon name="target" size={17} />启动正式测试
              </button> : null}
              {primaryAction !== 'push-page' ? <button data-session-action="push-page" disabled={!p.helperReady}
                onClick={p.pushPage} type="button">
                <Icon name="message" size={17} />推送当前页
              </button> : null}
              {p.session.studentSyncState === 'forced' ? (
                <button data-session-action="release-follow" onClick={p.releaseFollowLock} type="button">
                  <Icon name="screen" size={17} />解除跟随
                </button>
              ) : (
                <button data-session-action="force-follow" disabled={!p.helperReady}
                  onClick={p.forceFollow} type="button">
                  <Icon name="screen" size={17} />全班跟随
                </button>
              )}
              {primaryAction !== 'begin-review' ? <button onClick={p.beginReview} type="button">
                <Icon name="target" size={17} />进入讲评
              </button> : null}
              {primaryAction !== 'next-node' ? <button disabled={!hasNextNode}
                onClick={() => p.go(p.unitIndex + 1)} type="button">
                下一节点<Icon name="arrow" size={17} />
              </button> : null}
            </div>
          </details>
          <span>{p.verificationMessage
            || `${p.task.goal} / 当前同步：${p.session.studentSyncState ?? 'idle'}`}</span>
        </footer>
      </RoleGate>
    </main>
  );
}

function TeacherPrimaryActionButton({ action, p }: { action: TeacherPrimaryAction; p: TeacherConsoleViewProps }) {
  if (action === 'start-formal-test') return <button className="is-primary" data-primary-action data-session-action="start-formal-test" onClick={p.startFormalTest} type="button"><Icon name="target" size={17} />启动正式测试</button>;
  if (action === 'next-node') return <button className="is-primary" data-primary-action data-session-action="next-node" onClick={() => p.go(p.unitIndex + 1)} type="button">下一节点<Icon name="arrow" size={17} /></button>;
  if (action === 'push-page') return <button className="is-primary" data-primary-action data-session-action="push-page" onClick={p.pushPage} type="button"><Icon name="message" size={17} />推送 {p.unit.capabilityNodeId} 当前页</button>;
  return <button className="is-primary" data-primary-action data-session-action="begin-review" onClick={p.beginReview} type="button"><Icon name="target" size={17} />进入讲评</button>;
}
