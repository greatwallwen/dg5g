import type { RemediationTarget } from './formal-assessment-contract.ts';

export function parseRemediationTargets(diagnosticsJson: string): RemediationTarget[] {
  try {
    const parsed = JSON.parse(diagnosticsJson) as { remediationTargets?: unknown };
    if (!Array.isArray(parsed.remediationTargets)) return [];
    return uniqueRemediationTargets(parsed.remediationTargets.flatMap((target) => {
      if (typeof target !== 'object' || target === null) return [];
      const record = target as Record<string, unknown>;
      if (typeof record.nodeId !== 'string' || typeof record.sectionId !== 'string') return [];
      if (record.sectionId === 'practice' && typeof record.activityId === 'string') {
        return [{
          nodeId: record.nodeId,
          sectionId: 'practice' as const,
          activityId: record.activityId,
        }];
      }
      const legacyActivityId = legacyRemediationActivityId(record.sectionId);
      return legacyActivityId ? [{
        nodeId: record.nodeId,
        sectionId: 'practice' as const,
        activityId: legacyActivityId,
      }] : [];
    }));
  } catch {
    return [];
  }
}

function uniqueRemediationTargets(targets: RemediationTarget[]): RemediationTarget[] {
  const seen = new Set<string>();
  return targets.filter((target) => {
    const key = `${target.nodeId}:${target.sectionId}:${target.activityId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function legacyRemediationActivityId(sectionId: string): string | undefined {
  return ({
    evidence: 'P1T1-N02-foundation-01',
    explain: 'P1T1-N02-application-01',
    practice: 'P1T1-N02-transfer-01',
    understand: 'P1T1-N02-transfer-01',
  } as Record<string, string>)[sectionId];
}
