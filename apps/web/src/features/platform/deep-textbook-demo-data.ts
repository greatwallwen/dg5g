import type { TextbookUnitKind } from '@/platform/models';
import { getNodeLearningPolicy } from '@/platform/learning-policy';
import type { SelfStudyCatalog, SelfStudyDocument } from '@/features/textbook-scene/self-study-types';

export interface DemoUnit {
  id: string;
  capabilityNodeId: string;
  kind: TextbookUnitKind;
  title: string;
  question: string;
  summary: string;
  points: string[];
  steps: string[];
  visualId: string;
  counterexample: string;
  correction: string;
  action: string;
  output: string;
  requiredEvidence: string;
  nextUnitId?: string;
}

export type DemoTaskId = 'P01' | 'P02' | 'P03';

export interface DemoTaskProfile {
  taskId: DemoTaskId;
  title: string;
  gameNodeId: string;
  units: DemoUnit[];
}

export type DemoTaskProfiles = Record<DemoTaskId, DemoTaskProfile>;

/**
 * Pure client-safe projection. The catalog must be created on the server by
 * loadSelfStudyCatalog(), which validates the generated textbook first.
 */
export function createDemoTaskProfiles(catalog: SelfStudyCatalog): DemoTaskProfiles {
  return Object.fromEntries((['P01', 'P02', 'P03'] as const).map((taskId) => {
    const documents = Object.values(catalog)
      .filter((document) => document.taskId === taskId)
      .sort((left, right) => left.nodeId.localeCompare(right.nodeId));
    if (documents.length !== 4) throw new Error(`Expected four validated textbook nodes for ${taskId}.`);
    const units = documents.map((document, index) => projectDemoUnit(document, documents[index + 1]));
    const gameNode = documents.find((document) => getNodeLearningPolicy(document.nodeId)?.requiresFormalTest);
    if (!gameNode) throw new Error(`Missing formal-test policy for ${taskId}.`);
    return [taskId, {
      taskId,
      title: documents[0]!.taskTitle,
      gameNodeId: gameNode.nodeId,
      units,
    } satisfies DemoTaskProfile];
  })) as DemoTaskProfiles;
}

export function getDemoTaskProfileForNode(
  nodeId: string,
  profiles: DemoTaskProfiles,
): DemoTaskProfile | undefined {
  const taskId = taskIdForNode(nodeId);
  return taskId ? profiles[taskId] : undefined;
}

export function getDemoUnitForNode(nodeId: string, profiles: DemoTaskProfiles): DemoUnit | undefined {
  return getDemoTaskProfileForNode(nodeId, profiles)?.units.find((unit) => unit.capabilityNodeId === nodeId);
}

function projectDemoUnit(document: SelfStudyDocument, next?: SelfStudyDocument): DemoUnit {
  const { content } = document;
  const policy = getNodeLearningPolicy(document.nodeId);
  const counterexample = content.kind === 'deep' ? content.counterexamples[0] : content.counterexample;
  const evidence = content.kind === 'deep'
    ? content.evidenceRules.flatMap((rule) => rule.requiredEvidence)
    : content.relationshipFigure.evidenceLabels;
  const points = content.kind === 'deep'
    ? content.evidenceRules.map((rule) => `${rule.claim}：${rule.requiredEvidence.join('、')}`)
    : content.relationshipFigure.evidenceLabels;
  return {
    id: document.sourceKnowledgeUnitId,
    capabilityNodeId: document.nodeId,
    kind: unitKindForNode(document.nodeId),
    title: document.nodeTitle,
    question: content.kind === 'deep' ? content.taskQuestion : document.nodeGoal,
    summary: content.caseBackground.join(''),
    points,
    steps: content.reasoningSteps,
    visualId: visualIdFor(content.kind === 'deep' ? content.annotatedFigures[0]?.kind : content.relationshipFigure.kind),
    counterexample: counterexample?.error ?? '',
    correction: counterexample?.correctionPath.join('；') ?? '',
    action: document.nodeGoal,
    output: policy?.requiresProfessionalOutput ? document.taskOutputTitle : `${document.nodeTitle}节点学习记录`,
    requiredEvidence: evidence.join('、'),
    nextUnitId: next?.sourceKnowledgeUnitId,
  };
}

function taskIdForNode(nodeId: string): DemoTaskId | undefined {
  const match = /^P1T([123])-N0[1-4]$/.exec(nodeId);
  return match ? `P0${match[1]}` as DemoTaskId : undefined;
}

function unitKindForNode(nodeId: string): TextbookUnitKind {
  if (nodeId.endsWith('N01')) return 'case';
  if (nodeId.endsWith('N02')) return 'concept';
  if (nodeId.endsWith('N03')) return 'evidence';
  return 'output';
}

function visualIdFor(kind: string | undefined): string {
  if (kind === 'topology') return 'indoor-topology';
  if (kind === 'antenna') return 'antenna-posture';
  if (kind === 'complaint') return 'complaint-reproduction';
  if (kind === 'operating-conditions') return 'indoor-condition';
  if (kind === 'evidence-archive') return 'indoor-evidence';
  if (kind === 'obstacle-evidence') return 'outdoor-obstacle';
  return kind ?? 'relationship-evidence';
}
