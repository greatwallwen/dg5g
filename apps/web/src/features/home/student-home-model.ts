import type {
  LearningContextSnapshot,
  RoleHomeAction,
  StudentHomeSnapshot,
} from './role-home-types.ts';
import type { AuthoritativeDomFacts } from '../snapshot/snapshot-dom-facts.ts';

export type StudentHomeViewModel = StudentHomeReadyViewModel | StudentHomeBlockedViewModel;

export interface StudentHomeReadyViewModel {
  kind: 'ready';
  displayName: string;
  current: {
    project: { id: string; title: string };
    task: { id: string; title: string };
    node: { id: string; title: string };
    why: string;
    completionStandard: string;
  };
  projectOutcome: string;
  taskOutput: string;
  primaryAction: {
    label: '继续学习';
    href: string;
    mode: 'self-study' | 'classroom-follow';
  };
  secondaryActions: RoleHomeAction[];
  progress: LearningContextSnapshot['progress'];
  classroomName?: string;
  authoritativeFacts?: AuthoritativeDomFacts;
}

export interface StudentHomeBlockedViewModel {
  kind: 'blocked';
  displayName: string;
  blocker: {
    title: string;
    detail: string;
    requiredNodeIds: string[];
  };
  primaryAction?: undefined;
  secondaryActions: RoleHomeAction[];
  authoritativeFacts?: AuthoritativeDomFacts;
}

export function buildStudentHomeViewModel(snapshot: StudentHomeSnapshot): StudentHomeViewModel {
  const commonActions: RoleHomeAction[] = [
    { label: '查看其他任务', href: '/student/projects/p1', icon: 'grid' },
    { label: '课程能力图谱', href: '/course', icon: 'map' },
  ];
  const selfStudy = snapshot.selfStudy;
  if (snapshot.dataIssue || !selfStudy) {
    return blocked(snapshot, snapshot.dataIssue ?? '未找到个人自主学习位置，请联系教师确认学习任务。', [], commonActions);
  }
  if (selfStudy.access.kind === 'locked') {
    const required = selfStudy.access.requiredNodeIds;
    const detail = required.length
      ? `需要先完成 ${required.join('、')}，当前节点才可学习。`
      : '当前节点尚未解锁，请联系教师确认前置任务。';
    return blocked(snapshot, detail, required, commonActions);
  }

  const classroom = snapshot.activeClassroom;
  const context = classroom?.context ?? selfStudy;
  const secondaryActions = classroom
    ? [{ label: '自主学习', href: selfStudy.href, icon: 'book' } satisfies RoleHomeAction, ...commonActions]
    : commonActions;

  return {
    kind: 'ready',
    displayName: snapshot.displayName,
    current: {
      project: { id: context.project.id, title: context.project.title },
      task: { id: context.task.id, title: context.task.title },
      node: { id: context.node.id, title: context.node.title },
      why: context.task.why,
      completionStandard: context.completionStandard,
    },
    projectOutcome: context.project.finalOutput,
    taskOutput: context.task.outputTitle,
    primaryAction: classroom
      ? { label: '继续学习', href: `/classroom/${classroom.routeSessionId}`, mode: 'classroom-follow' }
      : { label: '继续学习', href: selfStudy.href, mode: 'self-study' },
    secondaryActions,
    progress: context.progress,
    ...(snapshot.authoritativeFacts ? { authoritativeFacts: snapshot.authoritativeFacts } : {}),
    ...(classroom ? { classroomName: classroom.className } : {}),
  };
}

function blocked(
  snapshot: StudentHomeSnapshot,
  detail: string,
  requiredNodeIds: string[],
  secondaryActions: RoleHomeAction[],
): StudentHomeBlockedViewModel {
  return {
    kind: 'blocked',
    displayName: snapshot.displayName,
    blocker: { title: '暂时无法继续学习', detail, requiredNodeIds },
    secondaryActions,
    ...(snapshot.authoritativeFacts ? { authoritativeFacts: snapshot.authoritativeFacts } : {}),
  };
}
