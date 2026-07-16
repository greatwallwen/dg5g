import {
  assessmentDimensionKeys,
  type AssessmentDimensionDiagnosis,
  type AssessmentDimensionKey,
  type RemediationTarget,
} from './formal-assessment-contract.ts';

export type PersistedAssessmentOrigin = 'demo' | 'user';

export interface PersistedAssessmentCandidate {
  attemptId: string;
  studentId: string;
  nodeId: string;
  assessmentId: string | null;
  gameId: string | null;
  questionVersion: string | null;
  score: number;
  diagnosticsJson: string | null;
  origin: PersistedAssessmentOrigin;
  completedAt: string;
  instanceAssessmentId: string | null;
  instanceNodeId: string | null;
  instanceGameId: string | null;
  instanceQuestionVersion: string | null;
  instanceStatus: string | null;
}

export interface PersistedAssessmentValidationPolicy {
  passScore: number;
  allowedRemediationTargets: readonly RemediationTarget[];
}

export interface ValidatedPersistedAssessmentDiagnostic {
  assessmentId: string;
  attemptId: string;
  studentId: string;
  nodeId: string;
  gameId: string;
  questionVersion: string;
  totalScore: number;
  passed: boolean;
  dimensions: Record<AssessmentDimensionKey, AssessmentDimensionDiagnosis>;
  remediationTargets: RemediationTarget[];
  origin: PersistedAssessmentOrigin;
  completedAt: string;
}

export function validatePersistedAssessmentDiagnostic(
  candidate: PersistedAssessmentCandidate,
  policy: PersistedAssessmentValidationPolicy,
): ValidatedPersistedAssessmentDiagnostic | undefined {
  if (
    !isScore(policy.passScore)
    || (candidate.origin !== 'demo' && candidate.origin !== 'user')
    || !isIsoInstant(candidate.completedAt)
    || candidate.instanceStatus !== 'closed'
    || !candidate.assessmentId
    || !candidate.gameId
    || !candidate.questionVersion
    || candidate.assessmentId !== candidate.instanceAssessmentId
    || candidate.nodeId !== candidate.instanceNodeId
    || candidate.gameId !== candidate.instanceGameId
    || candidate.questionVersion !== candidate.instanceQuestionVersion
  ) {
    return undefined;
  }

  const parsed = parseRecord(candidate.diagnosticsJson);
  if (!parsed) return undefined;

  const requiredKeys = [
    'assessmentId', 'attemptId', 'nodeId', 'questionVersion', 'totalScore', 'passed',
    'dimensions', 'remediationTargets', 'origin', 'completedAt',
  ] as const;
  const identityKeys = ['studentId', 'gameId'] as const;
  if (!requiredKeys.every((key) => Object.hasOwn(parsed, key))) return undefined;
  if (!hasExactKeys(parsed, [...requiredKeys, ...identityKeys])) return undefined;

  const identity = {
    assessmentId: candidate.assessmentId,
    attemptId: candidate.attemptId,
    studentId: candidate.studentId,
    nodeId: candidate.nodeId,
    gameId: candidate.gameId,
    questionVersion: candidate.questionVersion,
    origin: candidate.origin,
    completedAt: candidate.completedAt,
  } as const;
  for (const [key, value] of Object.entries(identity)) {
    if (parsed[key] !== value) return undefined;
  }

  if (!isScore(candidate.score) || parsed.totalScore !== candidate.score) return undefined;
  if (typeof parsed.passed !== 'boolean' || parsed.passed !== (candidate.score >= policy.passScore)) return undefined;

  const dimensionsRecord = asRecord(parsed.dimensions);
  if (!dimensionsRecord || !hasExactKeys(dimensionsRecord, assessmentDimensionKeys)) return undefined;

  const dimensions = {} as Record<AssessmentDimensionKey, AssessmentDimensionDiagnosis>;
  const dimensionTargets: RemediationTarget[] = [];
  let dimensionSum = 0;
  for (const dimensionKey of assessmentDimensionKeys) {
    const raw = asRecord(dimensionsRecord[dimensionKey]);
    if (!raw || !hasOnlyKeys(raw, ['score', 'maxScore', 'feedback', 'remediationTarget'])) return undefined;
    if (!isDimensionScore(raw.score) || raw.maxScore !== 25 || !isNonEmptyString(raw.feedback)) return undefined;
    const remediationTarget = raw.remediationTarget === undefined
      ? undefined
      : parseRemediationTarget(raw.remediationTarget);
    if (raw.remediationTarget !== undefined && !remediationTarget) return undefined;
    if ((raw.score < 20) !== Boolean(remediationTarget)) return undefined;
    if (remediationTarget) dimensionTargets.push(remediationTarget);
    dimensions[dimensionKey] = {
      score: raw.score,
      maxScore: 25,
      feedback: raw.feedback,
      ...(remediationTarget ? { remediationTarget } : {}),
    };
    dimensionSum += raw.score;
  }
  if (dimensionSum !== candidate.score) return undefined;

  const remediationTargets = parseRemediationTargets(parsed.remediationTargets);
  if (!remediationTargets) return undefined;
  const allowed = new Set(policy.allowedRemediationTargets.map(remediationTargetKey));
  const rootKeys = remediationTargets.map(remediationTargetKey);
  const dimensionKeys = dimensionTargets.map(remediationTargetKey);
  if (
    new Set(rootKeys).size !== rootKeys.length
    || remediationTargets.some((target) => !allowed.has(remediationTargetKey(target)))
    || !sameKeySet(rootKeys, dimensionKeys)
  ) return undefined;

  return {
    ...identity,
    totalScore: candidate.score,
    passed: parsed.passed,
    dimensions,
    remediationTargets,
  };
}

function parseRecord(value: string | null): Record<string, unknown> | undefined {
  if (!value) return undefined;
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function hasExactKeys(record: Record<string, unknown>, expected: readonly string[]) {
  return Object.keys(record).length === expected.length
    && expected.every((key) => Object.hasOwn(record, key));
}

function hasOnlyKeys(record: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(record).every((key) => allowed.includes(key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100;
}

function isIsoInstant(value: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isDimensionScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 25;
}

function parseRemediationTarget(value: unknown): RemediationTarget | undefined {
  const record = asRecord(value);
  if (
    !record
    || !hasExactKeys(record, ['nodeId', 'sectionId', 'activityId'])
    || !isNonEmptyString(record.nodeId)
    || record.sectionId !== 'practice'
    || !isNonEmptyString(record.activityId)
  ) return undefined;
  return {
    nodeId: record.nodeId,
    sectionId: 'practice',
    activityId: record.activityId,
  };
}

function parseRemediationTargets(value: unknown): RemediationTarget[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const targets: RemediationTarget[] = [];
  for (const rawTarget of value) {
    const target = parseRemediationTarget(rawTarget);
    if (!target) return undefined;
    targets.push(target);
  }
  return targets;
}

function remediationTargetKey(target: RemediationTarget) {
  return `${target.nodeId}:${target.sectionId}:${target.activityId}`;
}

function sameKeySet(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((key) => right.includes(key));
}
