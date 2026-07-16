import { getNodeLearningPolicy } from '../../platform/learning-policy.ts';

export type MicroPracticeKind = 'selection' | 'connection' | 'ordering' | 'card-flip';

const orderingPracticeNodes = new Set(['P1T1-N03', 'P1T2-N03', 'P1T3-N03']);

export function practiceKindForNode(nodeId: string): MicroPracticeKind {
  const policy = getNodeLearningPolicy(nodeId);
  if (policy?.assessmentRole === 'node-test') return 'connection';
  if (policy?.requiresProfessionalOutput) return 'card-flip';
  if (orderingPracticeNodes.has(nodeId)) return 'ordering';
  return 'selection';
}
