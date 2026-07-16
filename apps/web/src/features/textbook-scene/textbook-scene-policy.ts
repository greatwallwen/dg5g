import { getNodeLearningPolicy, type P1TaskId } from '../../platform/learning-policy';

export type CompletedLearningNodeDestination =
  | { kind: 'continue'; taskId: P1TaskId }
  | { kind: 'challenge'; taskId: P1TaskId }
  | { kind: 'unavailable' };

export function classifyCompletedLearningNode(nodeId: string): CompletedLearningNodeDestination {
  const policy = getNodeLearningPolicy(nodeId);
  if (!policy || policy.publicationStatus !== 'published') return { kind: 'unavailable' };
  return {
    kind: policy.requiresFormalTest || policy.requiresProfessionalOutput ? 'challenge' : 'continue',
    taskId: policy.taskId,
  };
}
