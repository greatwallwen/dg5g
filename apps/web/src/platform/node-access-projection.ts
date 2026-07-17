import { nodeLearningStateLabel, type NodeLearningState } from './learning-status';
import { getNodeLearningPolicy, type P1TaskId } from './learning-policy';
import type { NodeStateAxes } from './learning-projection';

export type NodeAccessKind = 'open' | 'locked' | 'loading' | 'unavailable';

export interface NodeAccessProjection {
  nodeId: string;
  kind: NodeAccessKind;
  label: string;
  disabled: boolean;
  prerequisiteNodeIds: string[];
  state?: NodeLearningState;
}

export interface NodeAccessProgress {
  nodeId: string;
  access?: NodeStateAxes['access'];
  axes?: Pick<NodeStateAxes, 'access'>;
  learningState?: NodeLearningState;
}

const taskEntryNodeIds: Record<P1TaskId, string> = {
  P01: 'P1T1-N01',
  P02: 'P1T2-N01',
  P03: 'P1T3-N01',
};

export function projectNodeAccess(
  nodeId: string,
  progress: readonly NodeAccessProgress[] | undefined,
): NodeAccessProjection {
  const policy = getNodeLearningPolicy(nodeId);
  const prerequisiteNodeIds = policy?.prerequisiteNodeIds ?? [];
  if (!policy || policy.publicationStatus !== 'published') {
    return { nodeId, kind: 'unavailable', label: '内容未开放', disabled: true, prerequisiteNodeIds };
  }
  if (progress === undefined) {
    return { nodeId, kind: 'loading', label: '正在读取学习状态', disabled: true, prerequisiteNodeIds };
  }
  const record = progress.find((item) => item.nodeId === nodeId);
  const access = record?.axes?.access ?? record?.access;
  if (!record?.learningState || !access) {
    return { nodeId, kind: 'unavailable', label: '学习状态不可用', disabled: true, prerequisiteNodeIds };
  }
  return {
    nodeId,
    kind: access === 'open' ? 'open' : 'locked',
    label: nodeLearningStateLabel[record.learningState],
    disabled: access !== 'open',
    prerequisiteNodeIds,
    state: record.learningState,
  };
}

export function projectTaskAccess(
  taskId: P1TaskId,
  progress: readonly NodeAccessProgress[] | undefined,
): NodeAccessProjection {
  return projectNodeAccess(taskEntryNodeIds[taskId], progress);
}

export function projectFutureContentAccess(nodeId: string): NodeAccessProjection {
  return {
    nodeId,
    kind: 'unavailable',
    label: '后续开放',
    disabled: true,
    prerequisiteNodeIds: [],
  };
}
