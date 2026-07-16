import { loadP1DemoContent, type P1NodeId, type P1SelfStudyPractice } from '../platform/p1-content.ts';
import {
  publicActivityFromPractice,
  type ActivityPublicDto,
} from './activity-definition.ts';
import {
  p01ActivityRules,
  type ServerActivityDefinition,
} from './activity-rules.ts';

export const p01RequiredBaseActivityIds = [
  'P1T1-N01-micro-01',
  'P1T1-N02-foundation-01',
  'P1T1-N02-application-01',
  'P1T1-N02-transfer-01',
  'P1T1-N03-micro-01',
  'P1T1-N04-micro-01',
] as const;

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
  if (new Set(activities.map(({ activity }) => activity.id)).size !== activities.length) {
    throw new Error('P01 activity catalog must contain unique activity IDs.');
  }
  const requiredIds = new Set<string>(p01RequiredBaseActivityIds);
  const observedBaseIds = activities
    .map(({ activity }) => activity.id)
    .filter((activityId) => requiredIds.has(activityId));
  if (observedBaseIds.join('|') !== p01RequiredBaseActivityIds.join('|')) {
    throw new Error('P01 activity catalog must preserve the six required base activities in node order.');
  }
  return activities;
}

export const p01Activities = buildP01Catalog();
const p01ActivityById = new Map(p01Activities.map((definition) => [definition.activity.id, definition]));
export const p01BaseActivities = p01RequiredBaseActivityIds.map((activityId) => {
  const definition = p01ActivityById.get(activityId);
  if (!definition) throw new Error(`P01 required base activity is missing: ${activityId}.`);
  return definition;
});

export function readActivityDefinition(activityId: string): ServerActivityDefinition | undefined {
  return p01ActivityById.get(activityId);
}
