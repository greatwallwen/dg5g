import {
  activeDemoNodeIds,
  activeDemoProjectId,
  activeDemoTaskId,
  activeDemoTaskIds,
  isP1ClassSession,
  normalizeClassSessionId,
} from './fixtures';
import type { SkillMasteryState } from './models';
import { getNodeLearningPolicy, type NodeLearningPolicy } from './learning-policy';
import type { AuthenticatedActor } from './auth/actor.ts';

export type NodeRouteClassification =
  | { kind: 'open'; nodeId: string }
  | { kind: 'locked'; nodeId: string; prerequisiteNodeIds: string[] }
  | { kind: 'not-open'; nodeId: string }
  | { kind: 'not-found'; nodeId: string };

export function classifyNodeRoute(nodeId: string, masteryState?: SkillMasteryState): NodeRouteClassification {
  const policy = getNodeLearningPolicy(nodeId);
  return classifyNodeRouteFromPolicy(nodeId, policy, masteryState);
}

export function classifyNodeRouteFromPolicy(
  nodeId: string,
  policy: NodeLearningPolicy | undefined,
  masteryState?: SkillMasteryState,
): NodeRouteClassification {
  if (!policy) {
    return /^P\d+T\d+-N\d+$/i.test(nodeId)
      ? { kind: 'not-open', nodeId }
      : { kind: 'not-found', nodeId };
  }
  if (policy.publicationStatus !== 'published') {
    return { kind: 'not-open', nodeId };
  }
  if (masteryState === 'locked') {
    return { kind: 'locked', nodeId, prerequisiteNodeIds: policy.prerequisiteNodeIds };
  }
  return { kind: 'open', nodeId };
}

export class NodeRouteAccessError extends Error {
  readonly classification: Exclude<NodeRouteClassification, { kind: 'open' }>;

  constructor(classification: Exclude<NodeRouteClassification, { kind: 'open' }>) {
    super(`Learning node is not accessible: ${classification.nodeId} (${classification.kind})`);
    this.name = 'NodeRouteAccessError';
    this.classification = classification;
  }
}

export function resolveProjectId(projectId: string): string {
  return projectId === activeDemoProjectId ? projectId : activeDemoProjectId;
}

export function resolveTaskId(taskId: string): string {
  return activeDemoTaskIds.includes(taskId) ? taskId : activeDemoTaskId;
}

export function resolveNodeId(nodeId: string): string {
  const classification = classifyNodeRoute(nodeId);
  if (classification.kind !== 'open') throw new NodeRouteAccessError(classification);
  return classification.nodeId;
}

export function resolveSessionId(sessionId: string): string {
  return normalizeClassSessionId(sessionId);
}

export function isActiveDemoProject(projectId: string): boolean {
  return projectId === activeDemoProjectId;
}

export function isActiveDemoTask(taskId: string): boolean {
  return activeDemoTaskIds.includes(taskId);
}

export function isActiveDemoNode(nodeId: string): boolean {
  return activeDemoNodeIds.includes(nodeId);
}

export function isActiveDemoSession(sessionId: string): boolean {
  return isP1ClassSession(sessionId);
}

export function canReadStudentLearning(
  actor: AuthenticatedActor,
  studentId: string,
  studentClassId: string | undefined,
): boolean {
  if (actor.role === 'student') {
    return actor.userId === studentId && actor.studentId === studentId;
  }
  return Boolean(studentClassId) && actor.classId === studentClassId;
}

export function canWriteStudentLearning(actor: AuthenticatedActor, studentId: string): boolean {
  return actor.role === 'student'
    && actor.userId === studentId
    && actor.studentId === studentId;
}

export function canReadClassLearning(actor: AuthenticatedActor, classId: string): boolean {
  return actor.role === 'teacher' && actor.classId === classId;
}
