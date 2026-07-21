import type { NodeLearningState } from '../../platform/learning-status.ts';
import { nodeLearningStateLabel } from '../../platform/learning-status.ts';
import type {
  P1ProjectProjection,
  P1ProjectTaskProjection,
  ProfessionalOutputProjectionStatus,
  TaskLearningState,
} from '../../platform/p1-project-projection.ts';
import type { P1NodeId, P1TaskId } from '../platform/p1-content.ts';

export interface P1ProjectViewModel {
  project: {
    id: 'P1';
    title: string;
    finalOutputTitle: string;
  };
  snapshotVersion: number;
  portfolioStatus: P1ProjectProjection['portfolioStatus'];
  portfolioStatusLabel: string;
  completedTaskCount: number;
  taskCount: number;
  projectCompositeScoreLabel: string;
  currentAction?: P1ProjectActionViewModel;
  tasks: P1TaskCardViewModel[];
}

export interface P1ProjectActionViewModel {
  taskId: P1TaskId;
  nodeId: P1NodeId;
  label: string;
  href: string;
}

export interface P1TaskCardViewModel {
  taskId: P1TaskId;
  ordinal: number;
  title: string;
  why: string;
  taskOutputTitle: string;
  completionStandard: string;
  state: TaskLearningState;
  stateLabel: string;
  nodes: Array<{
    nodeId: P1NodeId;
    title: string;
    goal: string;
    state: NodeLearningState;
    stateLabel: string;
    href?: string;
  }>;
  nextAction?: P1ProjectActionViewModel;
  output: {
    status: ProfessionalOutputProjectionStatus;
    statusLabel: string;
    versionLabel: string;
  };
  nodeTestHighestScoreLabel: string;
  taskCompositeScoreLabel: string;
}

export function buildP1ProjectViewModel(projection: P1ProjectProjection): P1ProjectViewModel {
  const tasks = projection.tasks.map((task, index) => buildTask(task, index));
  return {
    project: {
      id: projection.projectId,
      title: projection.projectTitle,
      finalOutputTitle: projection.finalOutputTitle,
    },
    snapshotVersion: projection.snapshotVersion,
    portfolioStatus: projection.portfolioStatus,
    portfolioStatusLabel: portfolioStatusLabels[projection.portfolioStatus],
    completedTaskCount: tasks.filter(({ state }) => state === 'complete').length,
    taskCount: tasks.length,
    projectCompositeScoreLabel: formatScore(projection.projectCompositeScore, projection.projectCompositeOrigin),
    currentAction: tasks.flatMap(({ nextAction }) => nextAction ? [nextAction] : [])[0],
    tasks,
  };
}

function buildTask(task: P1ProjectTaskProjection, index: number): P1TaskCardViewModel {
  const nextNode = task.nextNodeId
    ? task.nodes.find(({ nodeId }) => nodeId === task.nextNodeId)
    : undefined;
  const nextAction = nextNode?.href ? {
    taskId: task.taskId,
    nodeId: nextNode.nodeId,
    label: `继续 ${task.taskId} · ${nextNode.title}`,
    href: nextNode.href,
  } satisfies P1ProjectActionViewModel : undefined;

  return {
    taskId: task.taskId,
    ordinal: index + 1,
    title: task.title,
    why: task.why,
    taskOutputTitle: task.taskOutputTitle,
    completionStandard: `完成 4 个能力节点，正式测试达到 80 分，提交《${task.taskOutputTitle}》并通过教师复核。`,
    state: task.state,
    stateLabel: taskStateLabels[task.state],
    nodes: task.nodes.map((node) => ({
      ...node,
      stateLabel: nodeLearningStateLabel[node.state],
    })),
    ...(nextAction ? { nextAction } : {}),
    output: {
      status: task.outputStatus,
      statusLabel: withOrigin(outputStatusLabels[task.outputStatus], task.outputOrigin),
      versionLabel: task.currentOutputVersion === undefined
        ? '版本尚未建立'
        : `v${task.currentOutputVersion}`,
    },
    nodeTestHighestScoreLabel: formatScore(task.nodeTestHighestScore, task.taskScoreOrigin),
    taskCompositeScoreLabel: formatScore(task.taskCompositeScore, task.taskScoreOrigin),
  };
}

const taskStateLabels: Record<TaskLearningState, string> = {
  locked: '待解锁',
  available: '可学习',
  learning: '学习中',
  'output-pending': '成果处理中',
  verified: '教师已认证',
  complete: '任务完成',
};

const outputStatusLabels: Record<ProfessionalOutputProjectionStatus, string> = {
  'not-started': '尚未形成',
  draft: '草稿',
  submitted: '待教师复核',
  returned: '退回修订',
  verified: '教师已认证',
};

const portfolioStatusLabels: Record<P1ProjectProjection['portfolioStatus'], string> = {
  'not-started': '尚未开始',
  collecting: '采集中',
  'awaiting-review': '待教师复核',
  'demo-complete': '演示成果包已形成',
  complete: '项目完成',
};

function formatScore(score: number | undefined, origin?: 'demo' | 'user'): string {
  return score === undefined ? '尚未形成' : `${Math.round(score)}${origin === 'demo' ? ' · 演示数据' : ''}`;
}

function withOrigin(label: string, origin?: 'demo' | 'user'): string {
  return `${label}${origin === 'demo' ? ' · 演示数据' : ''}`;
}
