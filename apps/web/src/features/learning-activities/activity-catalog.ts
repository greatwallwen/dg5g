import { loadP1DemoContent, type P1NodeId, type P1SelfStudyPractice } from '../platform/p1-content.ts';
import {
  publicActivityFromPractice,
  type ActivityPublicDto,
} from './activity-definition.ts';
import {
  p01ActivityRules,
  type ServerActivityDefinition,
} from './activity-rules.ts';

function practicesForNode(node: ReturnType<typeof loadP1DemoContent>['tasks'][number]['nodes'][number]): P1SelfStudyPractice[] {
  if (node.selfStudy.kind === 'standard') return node.selfStudy.microPractice;
  return [
    ...node.selfStudy.practices.foundation,
    ...node.selfStudy.practices.application,
    ...node.selfStudy.practices.transfer,
  ];
}

function buildP01Catalog(): ServerActivityDefinition[] {
  const task = loadP1DemoContent().tasks[0];
  const publicActivities = task.nodes.flatMap((node) => practicesForNode(node).map((practice) => (
    publicActivityFromPractice(practice, node.id as P1NodeId)
  )).filter((activity): activity is ActivityPublicDto => activity !== undefined));
  const activities = publicActivities.map((activity) => {
    const rule = p01ActivityRules[activity.id];
    if (!rule) throw new Error(`P01 activity rule is missing: ${activity.id}.`);
    return { activity, rule };
  });
  if (activities.length !== 6) {
    throw new Error(`P01 activity catalog must contain six activities; received ${activities.length}.`);
  }
  return activities;
}

export const p01Activities = buildP01Catalog();
const p01ActivityById = new Map(p01Activities.map((definition) => [definition.activity.id, definition]));

export function readActivityDefinition(activityId: string): ServerActivityDefinition | undefined {
  return p01ActivityById.get(activityId);
}
