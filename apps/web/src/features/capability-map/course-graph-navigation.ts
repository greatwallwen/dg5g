import type { CurriculumGraphNode } from '../../platform/models.ts';
import type { P1TaskId } from '../../platform/learning-policy.ts';

export type CourseGraphNodeAction = 'learn' | 'formal-test';

export function dispatchCurriculumGraphNode(
  node: CurriculumGraphNode,
  callbacks: {
    onNodeSelect: (nodeId: string, action: CourseGraphNodeAction) => void;
    onTaskSelect: (taskId: P1TaskId) => void;
  },
): void {
  if (node.nodeId) {
    callbacks.onNodeSelect(node.nodeId, node.action ?? 'learn');
  } else if (node.taskId) {
    callbacks.onTaskSelect(node.taskId);
  }
}

export function navigateStudentGraphNode(
  push: (href: string) => void,
  nodeId: string,
  action: CourseGraphNodeAction,
): void {
  const nodeHref = `/learn/${encodeURIComponent(nodeId)}`;
  push(action === 'formal-test' ? `${nodeHref}/test` : nodeHref);
}
