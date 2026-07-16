import { calculateProjectCompositeScore } from '../../platform/learning-mastery.ts';
import type {
  P1ProjectProjection,
  ProfessionalOutputProjectionStatus,
} from '../../platform/p1-project-projection.ts';
import type { P1TaskId } from '../platform/p1-content.ts';

export type P1PortfolioPackageStatus = 'not-formed' | 'complete';

export interface P1PortfolioReferenceViewModel {
  taskId: P1TaskId;
  outputId: string;
  version: number;
}

export interface P1PortfolioItemViewModel {
  taskId: P1TaskId;
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
  const packageReferences = hasOneReferencePerTask ? verifiedReferences : [];
  const packageStatus: P1PortfolioPackageStatus = hasOneReferencePerTask ? 'complete' : 'not-formed';
  const projectCompositeScore = packageStatus === 'complete'
    ? calculateProjectCompositeScore(projection.tasks.map(({ taskCompositeScore }) => taskCompositeScore))
    : undefined;

  return {
    projectId: projection.projectId,
    projectTitle: projection.projectTitle,
    packageTitle: projection.finalOutputTitle,
    snapshotVersion: projection.snapshotVersion,
    packageStatus,
    packageStatusLabel: packageStatus === 'complete' ? '成果包已形成' : '尚未形成',
    ...(projectCompositeScore === undefined ? {} : { projectCompositeScore }),
    projectCompositeScoreLabel: formatScore(projectCompositeScore),
    packageReferences,
    items: projection.tasks.map((task) => ({
      taskId: task.taskId,
      taskTitle: task.title,
      outputTitle: task.taskOutputTitle,
      versionLabel: task.currentOutputVersion === undefined ? '尚未形成' : `v${task.currentOutputVersion}`,
      status: task.outputStatus,
      statusLabel: outputStatusLabels[task.outputStatus],
      teacherFeedback: task.teacherFeedback ?? '暂无教师反馈',
      taskCompositeScoreLabel: formatScore(task.taskCompositeScore),
    })),
  };
}

const outputStatusLabels: Record<ProfessionalOutputProjectionStatus, string> = {
  'not-started': '尚未形成',
  draft: '草稿',
  submitted: '待教师复核',
  returned: '退回修订',
  verified: '教师已认证',
};

function formatScore(score: number | undefined): string {
  return score === undefined ? '尚未形成' : String(Math.round(score));
}
