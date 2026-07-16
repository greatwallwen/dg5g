import type {
  ActivityArtifact,
  ActivityAttemptResult,
  ActivityDefinition,
} from './activity-definition.ts';

export function evaluateActivity(
  activity: ActivityDefinition,
  response: unknown,
): Omit<ActivityAttemptResult, 'version'> {
  const normalizedResponse = isRecord(response) ? response : {};
  const passed = matchesAnswer(activity, normalizedResponse);
  const artifact: ActivityArtifact = {
    type: 'learning-activity-artifact',
    activityId: activity.id,
    nodeId: activity.nodeId,
    kind: activity.kind,
    response: normalizedResponse,
    transferTarget: activity.transferTarget,
  };
  return {
    passed,
    feedback: passed ? activity.feedback.passed : activity.feedback.failed,
    correctionPath: passed ? [] : [...activity.correctionPath],
    artifact,
  };
}

function matchesAnswer(activity: ActivityDefinition, response: Record<string, unknown>): boolean {
  switch (activity.kind) {
    case 'scope-classification':
    case 'evidence-classification':
      return exactStringMap(response.assignments, activity.answerModel.assignments);
    case 'link-reconstruction':
      return exactStringArray(response.order, activity.answerModel.order);
    case 'structured-record':
      return exactStringMap(response.fields, activity.answerModel.fields);
    case 'four-state-judgement':
      return exactStringMap(response.states, activity.answerModel.states);
    case 'defective-sheet-revision':
      return exactStringMap(response.revisions, activity.answerModel.revisions);
  }
}

function exactStringMap(actual: unknown, expected: unknown): boolean {
  if (!isRecord(actual) || !isRecord(expected)) return false;
  const expectedEntries = Object.entries(expected);
  return Object.keys(actual).length === expectedEntries.length
    && expectedEntries.every(([key, value]) => typeof value === 'string' && actual[key] === value);
}

function exactStringArray(actual: unknown, expected: unknown): boolean {
  return Array.isArray(actual) && Array.isArray(expected)
    && actual.length === expected.length
    && expected.every((value, index) => typeof value === 'string' && actual[index] === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
