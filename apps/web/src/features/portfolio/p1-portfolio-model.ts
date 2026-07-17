import { calculateProjectCompositeScore } from '../../platform/learning-mastery.ts';
import type {
  P1ProjectProjection,
  ProfessionalOutputProjectionStatus,
} from '../../platform/p1-project-projection.ts';
import type { P1TaskId } from '../platform/p1-content.ts';

export type P1PortfolioPackageStatus = 'not-formed' | 'demo-complete' | 'complete';

export interface P1PortfolioReferenceViewModel {
  taskId: P1TaskId;
  outputId: string;
  version: number;
}

export interface P1PortfolioItemViewModel {
  taskId: P1TaskId;
  detailHref: string;
  detailActionLabel: string;
  taskTitle: string;
  outputTitle: string;
  versionLabel: string;
  status: ProfessionalOutputProjectionStatus;
  statusLabel: string;
  teacherFeedback: string;
  taskCompositeScoreLabel: string;
}

export interface P1PortfolioViewModel {
  projectId: 'P1';
  projectTitle: string;
  packageTitle: string;
  snapshotVersion: number;
  packageStatus: P1PortfolioPackageStatus;
  packageStatusLabel: string;
  projectCompositeScore?: number;
  projectCompositeScoreLabel: string;
  packageReferences: P1PortfolioReferenceViewModel[];
  items: P1PortfolioItemViewModel[];
}

export function buildP1PortfolioViewModel(projection: P1ProjectProjection): P1PortfolioViewModel {
  const verifiedReferences = projection.tasks.flatMap((task) => (
    task.verifiedOutputReference
      ? [{ taskId: task.taskId, ...task.verifiedOutputReference }]
      : []
  ));
  const hasOneReferencePerTask = verifiedReferences.length === 3
    && new Set(verifiedReferences.map(({ taskId }) => taskId)).size === 3;
  const allUserOutputs = hasOneReferencePerTask && projection.tasks.every(({ realTaskCertified }) => realTaskCertified);
  const allDemoOutputs = hasOneReferencePerTask && projection.tasks.every(({ demoTaskCertified }) => demoTaskCertified);
  const packageReferences = allUserOutputs || allDemoOutputs ? verifiedReferences : [];
  const packageStatus: P1PortfolioPackageStatus = allUserOutputs
    ? 'complete'
    : allDemoOutputs
      ? 'demo-complete'
      : 'not-formed';
  const projectCompositeScore = packageStatus !== 'not-formed'
    ? calculateProjectCompositeScore(projection.tasks.map(({ taskCompositeScore }) => taskCompositeScore))
    : undefined;

  return {
    projectId: projection.projectId,
    projectTitle: projection.projectTitle,
    packageTitle: projection.finalOutputTitle,
    snapshotVersion: projection.snapshotVersion,
    packageStatus,
    packageStatusLabel: packageStatus === 'complete'
      ? '成果包已形成'
      : packageStatus === 'demo-complete'
        ? '演示成果包已形成'
        : '尚未形成',
    ...(projectCompositeScore === undefined ? {} : { projectCompositeScore }),
    projectCompositeScoreLabel: formatScore(projectCompositeScore, packageStatus === 'demo-complete'),
    packageReferences,
    items: projection.tasks.map((task) => ({
      taskId: task.taskId,
      detailHref: `/student/projects/p1/portfolio/${task.taskId}`,
      detailActionLabel: task.currentOutputVersion === undefined ? '查看未形成原因' : '查看成果与证据',
      taskTitle: task.title,
      outputTitle: task.taskOutputTitle,
      versionLabel: task.currentOutputVersion === undefined ? '尚未形成' : `v${task.currentOutputVersion}`,
      status: task.outputStatus,
      statusLabel: `${outputStatusLabels[task.outputStatus]}${task.outputOrigin === 'demo' ? ' · 演示数据' : ''}`,
      teacherFeedback: task.teacherFeedback ?? '暂无教师反馈',
      taskCompositeScoreLabel: formatScore(task.taskCompositeScore, task.taskScoreOrigin === 'demo'),
    })),
  };
}

const outputStatusLabels: Record<ProfessionalOutputProjectionStatus, string> = {
  'not-started': '尚未形成',
  editing: '编辑中',
  submitted: '待教师复核',
  returned: '退回修订',
  revising: '修订中',
  resubmitted: '再次提交，待教师复核',
  verified: '教师已认证',
};

function formatScore(score: number | undefined, demoData = false): string {
  return score === undefined ? '尚未形成' : `${Math.round(score)}${demoData ? ' · 演示数据' : ''}`;
}
