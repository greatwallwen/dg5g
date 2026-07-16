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

export type NonEmptyArray<Value> = [Value, ...Value[]];

export interface ActivityMaterial {
  id: string;
  label: string;
  detail: string;
  sourceValue?: string;
}

export interface RevisionActivityMaterial extends ActivityMaterial {
  sourceValue: string;
}

export interface ActivityCategory {
  id: string;
  label: string;
}

export interface ActivityField {
  id: string;
  label: string;
  placeholder: string;
}

export type ActivityInteraction =
  | {
      type: 'classification-board';
      categories: NonEmptyArray<ActivityCategory>;
      fields?: never;
    }
  | {
      type: 'sequence-builder';
      categories?: never;
      fields?: never;
    }
  | {
      type: 'record-form';
      categories?: never;
      fields: NonEmptyArray<ActivityField>;
    }
  | {
      type: 'state-matrix';
      categories: NonEmptyArray<ActivityCategory>;
      fields?: never;
    }
  | {
      type: 'revision-form';
      categories?: never;
      fields: NonEmptyArray<ActivityField>;
    };

export interface ActivityFeedback {
  passed: string;
  failed: string;
}

interface ActivityPublicDtoBase {
  id: string;
  nodeId: P1NodeId;
  prompt: string;
  feedback: ActivityFeedback;
  correctionPath: string[];
  transferTarget: string;
  retryable: true;
}

type ActivityPublicVariant<
  Kind extends ActivityKind,
  Interaction extends ActivityInteraction,
  Material extends ActivityMaterial = ActivityMaterial,
> = ActivityPublicDtoBase & {
  kind: Kind;
  materials: NonEmptyArray<Material>;
  interaction: Interaction;
};

export type ActivityPublicDto =
  | ActivityPublicVariant<'scope-classification', Extract<ActivityInteraction, { type: 'classification-board' }>>
  | ActivityPublicVariant<'evidence-classification', Extract<ActivityInteraction, { type: 'classification-board' }>>
  | ActivityPublicVariant<'link-reconstruction', Extract<ActivityInteraction, { type: 'sequence-builder' }>>
  | ActivityPublicVariant<'structured-record', Extract<ActivityInteraction, { type: 'record-form' }>>
  | ActivityPublicVariant<'four-state-judgement', Extract<ActivityInteraction, { type: 'state-matrix' }>>
  | ActivityPublicVariant<
      'defective-sheet-revision',
      Extract<ActivityInteraction, { type: 'revision-form' }>,
      RevisionActivityMaterial
    >;

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

export function publicActivityFromPractice(
  practice: P1SelfStudyPractice,
  nodeId: P1NodeId,
): ActivityPublicDto | undefined {
  if (!practice.activityKind) return undefined;
  const common = {
    id: practice.id,
    nodeId,
    prompt: practice.prompt,
    feedback: practice.targetedFeedback,
    correctionPath: practice.correctionPath,
    transferTarget: practice.transferTarget,
    retryable: true,
  } as const;
  switch (practice.activityKind) {
    case 'scope-classification':
      return { ...common, kind: practice.activityKind, materials: practice.materials, interaction: practice.interaction };
    case 'evidence-classification':
      return { ...common, kind: practice.activityKind, materials: practice.materials, interaction: practice.interaction };
    case 'link-reconstruction':
      return { ...common, kind: practice.activityKind, materials: practice.materials, interaction: practice.interaction };
    case 'structured-record':
      return { ...common, kind: practice.activityKind, materials: practice.materials, interaction: practice.interaction };
    case 'four-state-judgement':
      return { ...common, kind: practice.activityKind, materials: practice.materials, interaction: practice.interaction };
    case 'defective-sheet-revision':
      return { ...common, kind: practice.activityKind, materials: practice.materials, interaction: practice.interaction };
  }
}
