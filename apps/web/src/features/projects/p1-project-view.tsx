import Link from 'next/link';
import { RoleHomeHeader } from '../home/role-home-header.tsx';
import { Icon } from '../../ui/foundation/icons.tsx';
import type { P1ProjectViewModel } from './p1-project-model.ts';
import { P1TaskCard } from './p1-task-card.tsx';

export function P1ProjectView({
  displayName,
  model,
}: {
  displayName: string;
  model: P1ProjectViewModel;
}) {
  const currentTask = model.currentAction
    ? model.tasks.find(({ taskId }) => taskId === model.currentAction?.taskId)
    : undefined;
  const currentNode = currentTask && model.currentAction
    ? currentTask.nodes.find(({ nodeId }) => nodeId === model.currentAction?.nodeId)
    : undefined;

  return (
    <main
      className="role-home-shell p1-project-shell"
      data-motion="paused"
      data-p1-project={model.project.id}
      data-primary-action-policy={model.currentAction ? 'exactly-one' : 'none'}
      data-ui-surface="dark"
    >
      <RoleHomeHeader displayName={displayName} role="student" />
      <div className="p1-project-body">
        <nav className="p1-project-breadcrumb" aria-label="项目导航">
          <Link href="/student/home">学习首页</Link>
          <Icon name="arrow" size={14} />
          <span>{model.project.id} · {model.project.title}</span>
          <Link href="/course">课程能力图谱</Link>
        </nav>

        <section className="p1-project-hero" aria-labelledby="p1-project-title">
          <div className="p1-project-intro">
            <span className="p1-project-kicker">P1 · 完整项目样张</span>
            <h1 id="p1-project-title">{model.project.title}</h1>
            <p>按职业现场的证据链，依次完成室内、室外与投诉信息采集，最终汇总为可复核的项目成果。</p>

            {model.currentAction && currentTask && currentNode ? (
              <div className="p1-current-action" data-p1-current-task={currentTask.taskId}>
                <div>
                  <span>当前任务</span>
                  <strong>{currentTask.taskId} · {currentTask.title}</strong>
                </div>
                <div>
                  <span>下一步</span>
                  <strong>{currentNode.nodeId} · {currentNode.title}</strong>
                </div>
                <div className="is-standard">
                  <span>完成标准</span>
                  <strong>{currentTask.completionStandard}</strong>
                </div>
                <Link
                  className="p1-primary-action"
                  data-primary-action
                  data-p1-next-action={model.currentAction.nodeId}
                  href={model.currentAction.href}
                >
                  <Icon name="play" size={20} />
                  {model.currentAction.label}
                  <Icon name="arrow" size={18} />
                </Link>
              </div>
            ) : (
              <div className="p1-current-action is-complete">
                <Icon name="check" size={24} />
                <strong>三个任务均已完成，可查看项目成果包。</strong>
              </div>
            )}
          </div>

          <nav className="p1-task-rail" data-p1-task-rail aria-label="P1 三任务概览">
            {model.tasks.map((task) => {
              const isCurrent = task.taskId === currentTask?.taskId;
              return (
                <a
                  aria-current={isCurrent ? 'step' : undefined}
                  className={`is-${task.state}${isCurrent ? ' is-current' : ''}`}
                  data-p1-task-summary={task.taskId}
                  href={`#p1-task-${task.taskId}`}
                  key={task.taskId}
                >
                  <span>0{task.ordinal}</span>
                  <span><small>{task.taskId}</small><strong>{task.title}</strong></span>
                  <em>{isCurrent ? '当前任务' : task.stateLabel}</em>
                </a>
              );
            })}
          </nav>

          <aside
            className={`p1-portfolio-panel is-${model.portfolioStatus}`}
            data-p1-portfolio-status={model.portfolioStatus}
          >
            <div className="p1-portfolio-icon"><Icon name="briefcase" size={28} /></div>
            <span>项目最终产出</span>
            <h2>{model.project.finalOutputTitle}</h2>
            <p>由 P01、P02、P03 三份任务专业产出自动汇总。</p>
            <dl>
              <div><dt>任务完成</dt><dd>{model.completedTaskCount}/{model.taskCount}</dd></div>
              <div><dt>成果包状态</dt><dd>{model.portfolioStatusLabel}</dd></div>
              <div><dt>项目综合分</dt><dd>{model.projectCompositeScoreLabel}</dd></div>
            </dl>
            <Link
              className="p1-portfolio-link"
              data-p1-portfolio-link={model.portfolioStatus}
              href="/student/projects/p1/portfolio"
            >
              <Icon name="briefcase" size={16} />
              {model.portfolioStatus === 'complete'
                ? '查看项目成果包'
                : model.portfolioStatus === 'demo-complete'
                  ? '查看演示成果包'
                  : '查看成果包进度'}
              <Icon name="arrow" size={15} />
            </Link>
            <small>快照版本 · {model.snapshotVersion}</small>
          </aside>
        </section>

        <section className="p1-project-chain" aria-labelledby="p1-task-chain-title">
          <header className="p1-project-chain-head">
            <div>
              <span className="p1-project-kicker">职业任务链</span>
              <h2 id="p1-task-chain-title">P01 → P02 → P03</h2>
            </div>
            <p>前一任务完成并形成专业产出后，下一任务才会解锁。</p>
          </header>
          <div className="p1-task-grid" data-p1-task-detail-flow="full-width">
            {model.tasks.map((task, index) => (
              <div className="p1-task-slot" key={task.taskId}>
                <P1TaskCard isCurrent={task.taskId === currentTask?.taskId} task={task} />
                {index < model.tasks.length - 1 ? (
                  <span className="p1-task-connector" aria-hidden="true"><Icon name="arrow" size={18} /></span>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
