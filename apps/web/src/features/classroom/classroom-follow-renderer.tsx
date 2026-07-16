import Link from 'next/link';
import { SceneVisual } from '../textbook-scene/learning-scene';
import type { ClassroomFollowViewModel, ClassroomStudentScreen } from './classroom-follow-model';
import { getNodeLearningPolicy } from '@/platform/learning-policy';

const activityStateCopy: Record<ClassroomFollowViewModel['classroomActivity']['state'], string> = {
  waiting: '等待教师推送',
  open: '课堂活动进行中',
  submitted: '课堂活动已提交',
};

export function ClassroomFollowRenderer({ model, onReturn, busy = false }: {
  model: ClassroomFollowViewModel;
  onReturn?: () => void;
  busy?: boolean;
}) {
  const policy = getNodeLearningPolicy(model.currentUnit.nodeId);
  const formalTestAvailable = model.phase === 'challenge'
    && policy?.requiresFormalTest === true
    && policy.assessmentRole === 'node-test';
  return (
    <section className="classroom-follow-renderer" data-classroom-follow-renderer data-motion="paused" data-primary-action-policy="exactly-one" data-revision={model.revision}>
      <article className="classroom-follow-current" data-classroom-current-unit={model.currentUnit.nodeId}>
        <header>
          <span>{model.currentUnit.taskId} · {model.currentUnit.nodeId}</span>
          <h1>{model.currentUnit.title}</h1>
          <p>{model.currentUnit.question}</p>
        </header>
        <div className="classroom-follow-visual" data-classroom-visual={model.currentUnit.visualId}>
          <SceneVisual activeStep={Math.min(3, Math.max(0, model.revision % 4))} visualId={model.currentUnit.visualId} />
        </div>
        <p>{model.currentUnit.summary}</p>
      </article>

      <article className="classroom-follow-task" data-teacher-task>
        <span>{model.teacherTask.label} · {model.teacherTask.phaseLabel}</span>
        <h2>{model.teacherTask.instruction}</h2>
        <ul>{model.currentUnit.points.map((point) => <li key={point}>{point}</li>)}</ul>
      </article>

      <article className="classroom-follow-activity" data-classroom-activity={model.classroomActivity.id} data-state={model.classroomActivity.state}>
        <span>{activityStateCopy[model.classroomActivity.state]}</span>
        <h2>{model.classroomActivity.prompt}</h2>
        <ul>{model.classroomActivity.expectedEvidence.map((evidence) => <li key={evidence}>{evidence}</li>)}</ul>
      </article>

      {formalTestAvailable ? (
        <Link
          className="classroom-follow-formal-test"
          data-classroom-formal-test="true"
          data-primary-action="true"
          href={`/learn/${model.currentUnit.nodeId}/test`}
        >
          进入独立正式测试
        </Link>
      ) : null}

      <button
        className="classroom-follow-return"
        data-primary-action={formalTestAvailable ? undefined : 'true'}
        data-return-href={model.returnToSelfStudy.href}
        data-return-self-study
        disabled={busy}
        onClick={onReturn}
        type="button"
      >
        <span>{model.returnToSelfStudy.label}</span>
        <small>课堂结束后继续完整教材、练习与个人进度</small>
      </button>
    </section>
  );
}

export function ClassroomStudentModeRenderer({
  screen,
  followModel,
  busy = false,
  error,
  onJoin,
  onModeChange,
  onReturn,
  sessionStatus = 'active',
}: {
  screen: ClassroomStudentScreen;
  followModel?: ClassroomFollowViewModel;
  busy?: boolean;
  error?: string;
  onJoin?: () => void;
  onModeChange?: (mode: 'follow' | 'self') => void;
  onReturn?: () => void;
  sessionStatus?: 'preparing' | 'active' | 'paused' | 'closed';
}) {
  if (screen.kind === 'follow' && followModel) {
    return (
      <section className="classroom-follow-screen" data-classroom-follow-screen>
        <ClassroomFollowRenderer busy={busy} model={followModel} onReturn={onReturn} />
        <footer className="classroom-mode-actions">
          <button disabled={busy || sessionStatus === 'closed'} onClick={() => onModeChange?.('self')} type="button">自主浏览</button>
          <span>只有主动跟随时，教师切页才会更新本页。</span>
        </footer>
        {error ? <p className="classroom-action-error" data-classroom-action-error>{error}</p> : null}
      </section>
    );
  }
  if (screen.kind === 'self') {
    return (
      <section className="classroom-self-status" data-classroom-self-status data-motion="paused" data-primary-action-policy="exactly-one" data-teacher-revision={screen.teacherRevision}>
        <span>自主学习中</span>
        <h1>{screen.hasTeacherUpdate ? '教师课堂已更新' : '个人阅读位置保持不变'}</h1>
        <p>教师切页不会覆盖你的教材位置。你可以回到完整自学，也可以主动回到教师当前页。</p>
        <div>
          <button data-return-href={screen.returnTarget.href} disabled={busy} onClick={onReturn} type="button">返回完整自学</button>
          <button data-primary-action="true" data-return-to-teacher disabled={busy || sessionStatus !== 'active'} onClick={() => onModeChange?.('follow')} type="button">回到教师当前页</button>
        </div>
        {error ? <p className="classroom-action-error" data-classroom-action-error>{error}</p> : null}
      </section>
    );
  }
  const canJoin = sessionStatus === 'active';
  return (
    <section className="classroom-entry-status" data-classroom-entry-status data-motion="paused" data-primary-action-policy="exactly-one">
      <span>{entryLabel(sessionStatus)}</span>
      <h1>{canJoin ? '加入后才会接收教师当前讲授页' : '当前不会载入或跳转教师页面'}</h1>
      <p>课堂参与状态由你本人控制，不会覆盖完整自学游标。</p>
      <div>
        <button data-classroom-join data-primary-action="true" disabled={busy || !canJoin} onClick={onJoin} type="button">{busy ? '正在加入' : '进入课堂'}</button>
        <button data-return-href={screen.returnTarget.href} disabled={busy} onClick={onReturn} type="button">返回完整自学</button>
      </div>
      {error ? <p className="classroom-action-error" data-classroom-action-error>{error}</p> : null}
    </section>
  );
}

function entryLabel(status: 'preparing' | 'active' | 'paused' | 'closed'): string {
  return {
    preparing: '课堂准备中',
    active: '尚未进入课堂',
    paused: '课堂已暂停',
    closed: '课堂已结束',
  }[status];
}
