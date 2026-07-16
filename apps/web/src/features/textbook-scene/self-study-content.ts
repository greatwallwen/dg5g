import {
  loadP1DemoContent,
  type P1DemoContent,
  type P1NodeId,
} from '../platform/p1-content.ts';
import type {
  DeepSelfStudyContent,
  SelfStudyCatalog,
  SelfStudyContent,
  SelfStudyDocument,
  StandardSelfStudyContent,
} from './self-study-types.ts';
import { createDemoTaskProfiles, type DemoTaskProfiles } from '../platform/deep-textbook-demo-data.ts';

export { selfStudySectionDefinitions } from './self-study-types.ts';
export type {
  DeepSelfStudyContent,
  SelfStudyCatalog,
  SelfStudyContent,
  SelfStudyDocument,
  SelfStudyPractice,
  SelfStudySectionId,
  StandardSelfStudyContent,
} from './self-study-types.ts';

export function loadSelfStudyCatalog(source: P1DemoContent = loadP1DemoContent()): SelfStudyCatalog {
  const catalog = {} as Partial<SelfStudyCatalog>;
  for (const task of source.tasks) {
    for (const node of task.nodes) {
      const content = validatedSelfStudyContent(node.selfStudy, node.id);
      catalog[node.id] = {
        projectId: source.project.id,
        projectTitle: source.project.title,
        taskId: task.taskId,
        taskTitle: task.title,
        taskOutputTitle: task.taskOutputTitle,
        nodeId: node.id,
        nodeTitle: node.title,
        nodeGoal: node.goal,
        sourceKnowledgeUnitId: node.sourceKnowledgeUnitId,
        content,
      };
    }
  }
  if (Object.keys(catalog).length !== 12) {
    throw new Error(`Expected twelve P1 self-study documents, received ${Object.keys(catalog).length}.`);
  }
  return catalog as SelfStudyCatalog;
}

export function loadDemoTaskProfiles(source: P1DemoContent = loadP1DemoContent()): DemoTaskProfiles {
  return createDemoTaskProfiles(loadSelfStudyCatalog(source));
}

export function requireSelfStudyDocument(
  nodeId: string,
  catalog: SelfStudyCatalog = loadSelfStudyCatalog(),
): SelfStudyDocument {
  if (!isP1NodeId(nodeId)) throw new Error(`Self-study content is unavailable for ${nodeId}.`);
  const document = catalog[nodeId];
  if (!document) throw new Error(`Self-study content is unavailable for ${nodeId}.`);
  return document;
}

function validatedSelfStudyContent(value: unknown, nodeId: P1NodeId): SelfStudyContent {
  if (!isRecord(value) || value.nodeId !== nodeId) {
    throw new Error(`Generated self-study content does not match ${nodeId}.`);
  }
  if (value.kind === 'deep' && /^P1T[123]-N02$/.test(nodeId)) {
    return value as unknown as DeepSelfStudyContent;
  }
  if (value.kind === 'standard' && !/^P1T[123]-N02$/.test(nodeId)) {
    return value as unknown as StandardSelfStudyContent;
  }
  throw new Error(`Generated self-study content kind is invalid for ${nodeId}.`);
}

function isP1NodeId(value: string): value is P1NodeId {
  return /^P1T[123]-N0[1-4]$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
