import type { P1NodeId, P1SelfStudyPractice } from '../platform/p1-content.ts';

export const activityKinds = [
  'scope-classification',
  'evidence-classification',
  'link-reconstruction',
  'structured-record',
  'four-state-judgement',
  'defective-sheet-revision',
] as const;

export type ActivityKind = typeof activityKinds[number];

export interface ActivityMaterial {
  id: string;
  label: string;
  detail: string;
}

export interface ActivityInteraction {
  type: 'classification-board' | 'sequence-builder' | 'record-form' | 'state-matrix' | 'revision-form';
  categories?: Array<{ id: string; label: string }>;
  fields?: Array<{ id: string; label: string; placeholder: string }>;
}

export interface ActivityFeedback {
  passed: string;
  failed: string;
}

export interface ActivityDefinition {
  id: string;
  nodeId: P1NodeId;
  kind: ActivityKind;
  prompt: string;
  materials: ActivityMaterial[];
  interaction: ActivityInteraction;
  answerModel: Record<string, unknown>;
  feedback: ActivityFeedback;
  correctionPath: string[];
  transferTarget: string;
  retryable: true;
}

export interface ActivityArtifact {
  type: 'learning-activity-artifact';
  activityId: string;
  nodeId: P1NodeId;
  kind: ActivityKind;
  response: Record<string, unknown>;
  transferTarget: string;
}

export interface ActivityAttemptResult {
  passed: boolean;
  feedback: string;
  correctionPath: string[];
  artifact: ActivityArtifact;
  version: number;
}

export function activityDefinitionFromPractice(
  practice: P1SelfStudyPractice,
  nodeId: P1NodeId,
): ActivityDefinition | undefined {
  if (!practice.activityKind) return undefined;
  return {
    id: practice.id,
    nodeId,
    kind: practice.activityKind,
    prompt: practice.prompt,
    materials: practice.materials ?? [],
    interaction: practice.interaction ?? { type: 'record-form' },
    answerModel: practice.answerModel ?? {},
    feedback: practice.targetedFeedback ?? {
      passed: practice.feedback,
      failed: practice.feedback,
    },
    correctionPath: practice.correctionPath,
    transferTarget: practice.transferTarget ?? '',
    retryable: true,
  };
}
