import Link from 'next/link';
import { ActivityWorkbench } from '../learning-activities/activity-workbench.tsx';
import { SceneVisual } from '../textbook-scene/learning-scene.tsx';
import type {
  ClassroomFollowViewModel,
  ClassroomStudentScreen,
} from './classroom-follow-model.ts';

export function ClassroomFollowRenderer({ model, onReturn, busy = false }: {
  model: ClassroomFollowViewModel;
  onReturn?: () => void;
  busy?: boolean;
}) {
  return (
    <section
      className="classroom-follow-renderer"
      data-classroom-follow-renderer
      data-motion="paused"
      data-read-only={model.readOnly || undefined}
      data-revision={model.cursor.revision}
    >
      <article
        className="classroom-follow-current"
        data-classroom-current-page={model.cursor.pageId}
        data-classroom-current-unit={model.cursor.nodeId}
      >
        <header>
          <span>{model.cursor.taskId} · {model.cursor.nodeId} · {model.cursor.pageIndex + 1}/{model.cursor.pageCount}</span>
          <h1>{model.currentPage.title}</h1>
          <p>{model.currentPage.caseQuestion}</p>
        </header>
        <div className="classroom-follow-visual" data-classroom-visual={model.currentPage.visualId} data-classroom-visual-renderer={model.currentPage.visualRenderer}>
          {model.currentPage.visualRenderer === 'scene-visual' ? (
            <SceneVisual
              activeStep={Math.min(3, Math.max(0, model.cursor.actionIndex))}
              visualId={model.currentPage.visualId}
            />
          ) : null}
        </div>
        <h2>{model.currentPage.projectorTitle}</h2>
        <p>{model.currentPage.material}</p>
        <ul>{model.currentPage.visualCallouts.map((point) => <li key={point}>{point}</li>)}</ul>
      </article>

      <article className="classroom-follow-task" data-teacher-task>
        <span>{model.teacherTask.label} · {model.teacherTask.phaseLabel}</span>
        <h2>{model.teacherTask.instruction}</h2>
        <p>{model.currentPage.studentAction}</p>
      </article>

      {model.classroomActivity ? (
        model.readOnly ? (
          <article
            className="classroom-follow-activity classroom-follow-activity-read-only"
            data-classroom-activity={model.classroomActivity.activity.id}
            data-classroom-activity-read-only
          >
            <span>{model.classroomActivity.levelLabel} · 课堂已暂停</span>
            <h2>{model.classroomActivity.activity.prompt}</h2>
            <div className="activity-materials">
              {model.classroomActivity.activity.materials.map((material) => (
                <section data-activity-material={material.id} key={material.id}>
                  <strong>{material.label}</strong><p>{material.detail}</p>
                </section>
              ))}
            </div>
          </article>
        ) : (
          <div data-classroom-activity={model.classroomActivity.activity.id}>
            <ActivityWorkbench
              activity={model.classroomActivity.activity}
              delivery={{
                channel: 'classroom',
                sessionId: model.sessionId,
                classroomRunId: model.cursor.lessonRunId,
              }}
              level={model.classroomActivity.level}
              levelLabel={model.classroomActivity.levelLabel}
              onPass={() => undefined}
              passed={false}
              primaryAction
            />
          </div>
        )
      ) : null}

      <div className="classroom-follow-destinations">
        {model.formalAssessment ? (
          <Link
            data-classroom-formal-assessment={model.formalAssessment.gameId}
            href={`${model.formalAssessment.href}?classroomSessionId=${encodeURIComponent(model.sessionId)}`}
          >
            进入独立正式测试
          </Link>
        ) : null}
        {model.professionalOutput ? (
          <Link
            data-classroom-professional-output={model.professionalOutput.taskId}
            href={model.professionalOutput.href}
          >
            进入专业成果提交
          </Link>
        ) : null}
      </div>

      <button
        className="classroom-follow-return"
        data-return-href={model.returnToSelfStudy.href}
        data-return-self-study
        data-primary-action={!model.classroomActivity || model.readOnly || undefined}
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
      <section className="classroom-self-status" data-classroom-self-status data-motion="paused" data-teacher-revision={screen.teacherRevision}>
        <span>自主学习中</span>
        <h1>{screen.hasTeacherUpdate ? '教师课堂已更新' : '个人阅读位置保持不变'}</h1>
        <p>教师切页不会覆盖你的教材位置。你可以回到完整自学，也可以主动回到教师当前页。</p>
        <div>
          <button data-return-href={screen.returnTarget.href} disabled={busy} onClick={onReturn} type="button">返回完整自学</button>
          <button data-primary-action data-return-to-teacher disabled={busy || sessionStatus !== 'active'} onClick={() => onModeChange?.('follow')} type="button">回到教师当前页</button>
        </div>
        {error ? <p className="classroom-action-error" data-classroom-action-error>{error}</p> : null}
      </section>
    );
  }
  const canJoin = sessionStatus === 'active';
  return (
    <section className="classroom-entry-status" data-classroom-entry-status data-motion="paused">
      <span>{entryLabel(sessionStatus)}</span>
      <h1>{canJoin ? '加入后才会接收教师当前讲授页' : '当前不会载入或跳转教师页面'}</h1>
      <p>课堂参与状态由你本人控制，不会覆盖完整自学游标。</p>
      <div>
        <button data-classroom-join data-primary-action={canJoin || undefined} disabled={busy || !canJoin} onClick={onJoin} type="button">{busy ? '正在加入' : '进入课堂'}</button>
        <button data-primary-action={!canJoin || undefined} data-return-href={screen.returnTarget.href} disabled={busy} onClick={onReturn} type="button">返回完整自学</button>
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
