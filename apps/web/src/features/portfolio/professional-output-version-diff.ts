import type {
  PortfolioVersionFact,
  ProfessionalOutputFieldSourceFact,
} from './p1-portfolio-detail-model.ts';

export interface ProfessionalOutputFieldDiff {
  fieldKey: string;
  kind: 'added' | 'removed' | 'changed';
  beforeValue?: PortfolioVersionFact['fields'][string];
  afterValue?: PortfolioVersionFact['fields'][string];
  beforeEvidenceGap?: PortfolioVersionFact['evidenceGaps'][string];
  afterEvidenceGap?: PortfolioVersionFact['evidenceGaps'][string];
  addedEvidenceIds: string[];
  removedEvidenceIds: string[];
  addedSources: ProfessionalOutputFieldSourceFact[];
  removedSources: ProfessionalOutputFieldSourceFact[];
}

export interface ProfessionalOutputVersionDiff {
  fromVersion: number;
  toVersion: number;
  changedFields: ProfessionalOutputFieldDiff[];
  integrityWarnings: string[];
}

const missingValue = Symbol('missing-output-field');

export function diffProfessionalOutputVersions(
  previous: PortfolioVersionFact,
  current: PortfolioVersionFact,
  orderedFieldKeys: readonly string[],
): ProfessionalOutputVersionDiff {
  const keys = orderedUnion(orderedFieldKeys, Object.keys(previous.fields), Object.keys(current.fields));
  const changedFields: ProfessionalOutputFieldDiff[] = [];
  const integrityWarnings: string[] = [];

  for (const fieldKey of keys) {
    const beforeValue = Object.hasOwn(previous.fields, fieldKey)
      ? previous.fields[fieldKey]!
      : missingValue;
    const afterValue = Object.hasOwn(current.fields, fieldKey)
      ? current.fields[fieldKey]!
      : missingValue;
    const beforeEvidence = evidenceIds(previous, fieldKey);
    const afterEvidence = evidenceIds(current, fieldKey);
    const beforeEvidenceGap = previous.evidenceGaps[fieldKey];
    const afterEvidenceGap = current.evidenceGaps[fieldKey];
    const beforeSources = sources(previous, fieldKey);
    const afterSources = sources(current, fieldKey);
    const addedEvidenceIds = difference(afterEvidence, beforeEvidence);
    const removedEvidenceIds = difference(beforeEvidence, afterEvidence);
    const addedSources = sourceDifference(afterSources, beforeSources);
    const removedSources = sourceDifference(beforeSources, afterSources);
    const changed = !sameValue(beforeValue, afterValue)
      || addedEvidenceIds.length > 0
      || removedEvidenceIds.length > 0
      || !sameEvidenceGap(beforeEvidenceGap, afterEvidenceGap)
      || addedSources.length > 0
      || removedSources.length > 0;
    if (!changed) continue;

    changedFields.push({
      fieldKey,
      kind: beforeValue === missingValue ? 'added' : afterValue === missingValue ? 'removed' : 'changed',
      ...(beforeValue === missingValue ? {} : { beforeValue }),
      ...(afterValue === missingValue ? {} : { afterValue }),
      ...(beforeEvidenceGap ? { beforeEvidenceGap } : {}),
      ...(afterEvidenceGap ? { afterEvidenceGap } : {}),
      addedEvidenceIds,
      removedEvidenceIds,
      addedSources,
      removedSources,
    });
    for (const source of removedSources) {
      integrityWarnings.push(
        `${fieldKey} 字段移除了可追溯来源 ${source.sourceNodeId} / ${source.sourceAttemptId}`,
      );
    }
  }

  return {
    fromVersion: previous.version,
    toVersion: current.version,
    changedFields,
    integrityWarnings,
  };
}

function sameEvidenceGap(
  left: PortfolioVersionFact['evidenceGaps'][string] | undefined,
  right: PortfolioVersionFact['evidenceGaps'][string] | undefined,
): boolean {
  if (!left || !right) return left === right;
  return left.gapText.trim() === right.gapText.trim()
    && left.nextActionText.trim() === right.nextActionText.trim();
}

function orderedUnion(preferred: readonly string[], ...groups: string[][]): string[] {
  const all = new Set(groups.flat());
  const result = preferred.filter((key) => all.delete(key));
  return [...result, ...[...all].sort((left, right) => left.localeCompare(right))];
}

function evidenceIds(version: PortfolioVersionFact, fieldKey: string): string[] {
  return [...new Set((version.evidenceLinks[fieldKey] ?? []).map(({ evidenceId }) => evidenceId))].sort();
}

function sources(version: PortfolioVersionFact, fieldKey: string): ProfessionalOutputFieldSourceFact[] {
  const unique = new Map(version.fieldSources
    .filter((source) => source.fieldKey === fieldKey)
    .map((source) => [sourceIdentity(source), source]));
  return [...unique.values()].sort(compareSource);
}

function difference(current: readonly string[], previous: readonly string[]): string[] {
  const prior = new Set(previous);
  return current.filter((value) => !prior.has(value));
}

function sourceDifference(
  current: readonly ProfessionalOutputFieldSourceFact[],
  previous: readonly ProfessionalOutputFieldSourceFact[],
): ProfessionalOutputFieldSourceFact[] {
  const prior = new Set(previous.map(sourceIdentity));
  return current.filter((source) => !prior.has(sourceIdentity(source))).sort(compareSource);
}

function sameValue(
  left: PortfolioVersionFact['fields'][string] | typeof missingValue,
  right: PortfolioVersionFact['fields'][string] | typeof missingValue,
): boolean {
  if (left === missingValue || right === missingValue) return left === right;
  return JSON.stringify(normalizeValue(left)) === JSON.stringify(normalizeValue(right));
}

function normalizeValue(value: PortfolioVersionFact['fields'][string]): string | number | string[] {
  if (typeof value === 'string') return value.replace(/\r\n?/gu, '\n').trim();
  if (typeof value === 'number') return value;
  return value.map((item) => item.replace(/\r\n?/gu, '\n').trim());
}

function sourceIdentity(source: ProfessionalOutputFieldSourceFact): string {
  return `${source.sourceNodeId}\u0000${source.sourceAttemptId}`;
}

function compareSource(
  left: ProfessionalOutputFieldSourceFact,
  right: ProfessionalOutputFieldSourceFact,
): number {
  return left.sourceNodeId.localeCompare(right.sourceNodeId)
    || left.sourceAttemptId.localeCompare(right.sourceAttemptId);
}
