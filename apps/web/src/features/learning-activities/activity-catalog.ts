import { loadP1DemoContent, type P1NodeId, type P1SelfStudyPractice } from '../platform/p1-content.ts';
import {
  activityDefinitionFromPractice,
  type ActivityDefinition,
} from './activity-definition.ts';

function practicesForNode(node: ReturnType<typeof loadP1DemoContent>['tasks'][number]['nodes'][number]): P1SelfStudyPractice[] {
  if (node.selfStudy.kind === 'standard') return node.selfStudy.microPractice;
  return [
    ...node.selfStudy.practices.foundation,
    ...node.selfStudy.practices.application,
    ...node.selfStudy.practices.transfer,
  ];
}

function buildP01Catalog(): ActivityDefinition[] {
  const task = loadP1DemoContent().tasks[0];
  const activities = task.nodes.flatMap((node) => practicesForNode(node).map((practice) => (
    activityDefinitionFromPractice(practice, node.id as P1NodeId)
  )).filter((activity): activity is ActivityDefinition => activity !== undefined));
  if (activities.length !== 6) {
    throw new Error(`P01 activity catalog must contain six activities; received ${activities.length}.`);
  }
  return activities;
}

export const p01Activities = buildP01Catalog();
const p01ActivityById = new Map(p01Activities.map((activity) => [activity.id, activity]));

export function readActivityDefinition(activityId: string): ActivityDefinition | undefined {
  return p01ActivityById.get(activityId);
}
