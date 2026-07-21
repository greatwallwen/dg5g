import type {
  ActivityArtifact,
  ActivityAttemptResult,
} from './activity-definition.ts';
import type {
  ActivityEvaluationRule,
  RevisionConstraint,
  ServerActivityDefinition,
} from './activity-rules.ts';

export function evaluateActivity(
  definition: ServerActivityDefinition,
  response: unknown,
): Omit<ActivityAttemptResult, 'version'> {
  const { activity, rule } = definition;
  const normalizedResponse = isRecord(response) ? response : {};
  const passed = matchesRule(rule, normalizedResponse);
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

function matchesRule(rule: ActivityEvaluationRule, response: Record<string, unknown>): boolean {
  switch (rule.type) {
    case 'exact-map':
      return exactStringMap(response[rule.responseKey], rule.expected);
    case 'exact-map-with-reasons':
      return exactStringMap(response[rule.responseKey], rule.expected)
        && matchesTextCriteriaMap(response[rule.reasonsKey], rule.reasonConstraints);
    case 'exact-sequence':
      return exactStringArray(response[rule.responseKey], rule.expected);
    case 'revision-constraints':
      return matchesRevisionConstraints(response[rule.responseKey], rule.constraints);
    case 'text-criteria-map':
      return matchesTextCriteriaMap(response[rule.responseKey], rule.constraints);
  }
}

function matchesTextCriteriaMap(
  actual: unknown,
  constraints: Extract<ActivityEvaluationRule, { type: 'text-criteria-map' }>['constraints'],
): boolean {
  if (!isRecord(actual) || Object.keys(actual).length !== Object.keys(constraints).length) return false;
  return Object.entries(constraints).every(([field, constraint]) => {
    const value = actual[field];
    if (typeof value !== 'string') return false;
    const normalized = normalizeSearchText(value);
    return normalized.length >= constraint.minimumCharacters
      && constraint.groups.every((group) => group.some((term) => (
        normalized.includes(normalizeSearchText(term))
      )));
  });
}

function matchesRevisionConstraints(actual: unknown, constraints: Record<string, RevisionConstraint>): boolean {
  if (!isRecord(actual) || Object.keys(actual).length !== Object.keys(constraints).length) return false;
  return Object.entries(constraints).every(([field, constraint]) => {
    const value = actual[field];
    if (typeof value !== 'string') return false;
    if (constraint.type === 'new-photo-id') {
      const normalized = normalizeIdentifier(value);
      return /^IMG-\d{3}[A-Z]?$/.test(normalized)
        && constraint.accepted.map(normalizeIdentifier).includes(normalized)
        && !constraint.forbidden.map(normalizeIdentifier).includes(normalized);
    }
    if (constraint.type === 'evidence-source') {
      const normalized = normalizeIdentifier(value);
      return constraint.accepted.map(normalizeIdentifier).includes(normalized);
    }
    const normalized = normalizeSearchText(value);
    return constraint.groups.every((group) => group.some((term) => (
      normalized.includes(normalizeSearchText(term))
    )));
  });
}

function normalizeIdentifier(value: string): string {
  return value.normalize('NFKC').trim().toUpperCase().replace(/\s+/g, '');
}

function normalizeSearchText(value: string): string {
  return value.normalize('NFKC').trim().toUpperCase().replace(/[\s\p{P}\p{S}]+/gu, '');
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
