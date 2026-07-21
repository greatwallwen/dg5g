import Link from 'next/link';
import { Icon } from '../../ui/foundation/icons.tsx';
import type { P1TaskCardViewModel } from './p1-project-model.ts';

export function P1TaskCard({ task, isCurrent = false }: { task: P1TaskCardViewModel; isCurrent?: boolean }) {
  return (
    <details
      className={`p1-task-card is-${task.state}`}
      data-p1-task={task.taskId}
      data-p1-task-state={task.state}
      id={`p1-task-${task.taskId}`}
      open={isCurrent}
    >
      <summary className="p1-task-card-head" data-p1-task-detail-summary={task.taskId}>
        <span className="p1-task-index" aria-hidden="true">0{task.ordinal}</span>
        <div>
          <small>{task.taskId}</small>
          <h2>{task.title}</h2>
        </div>
        <span className={`p1-task-state is-${task.state}`}>{task.stateLabel}</span>
        <Icon name="arrow" size={17} />
      </summary>

      <div className="p1-task-card-body">

        <p className="p1-task-why"><Icon name="target" size={17} />{task.why}</p>

        <ol className="p1-node-chain" aria-label={`${task.taskId} 四个能力节点`}>
          {task.nodes.map((node, index) => (
            <li key={node.nodeId}>
              {node.href ? (
                <Link
                  className={`p1-node-link is-${node.state}`}
                  data-p1-node={node.nodeId}
                  data-p1-node-state={node.state}
                  href={node.href}
                >
                  <span>{index + 1}</span>
                  <strong>{node.title}</strong>
                  <small>{node.stateLabel}</small>
                </Link>
              ) : (
                <div
                  className="p1-node-link is-locked"
                  data-p1-node={node.nodeId}
                  data-p1-node-state={node.state}
                  aria-disabled="true"
                >
                  <span><Icon name="lock" size={13} /></span>
                  <strong>{node.title}</strong>
                  <small>{node.stateLabel}</small>
                </div>
              )}
            </li>
          ))}
        </ol>

        <div className="p1-task-completion" data-p1-completion-standard={task.taskId}>
          <span><Icon name="check" size={17} />完成标准</span>
          <p>{task.completionStandard}</p>
        </div>

        <footer className="p1-task-card-foot">
          <div className="p1-task-output" data-p1-output-status={task.output.status}>
            <span><Icon name="file" size={18} />任务成果</span>
            <strong>{task.taskOutputTitle}</strong>
            <small>{task.output.statusLabel} · {task.output.versionLabel}</small>
          </div>
          <dl className="p1-task-scores">
            <div><dt>节点测试最高分</dt><dd>{task.nodeTestHighestScoreLabel}</dd></div>
            <div><dt>任务综合分</dt><dd>{task.taskCompositeScoreLabel}</dd></div>
          </dl>
        </footer>
      </div>
    </details>
  );
}
