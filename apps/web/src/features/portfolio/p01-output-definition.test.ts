import assert from 'node:assert/strict';
import test from 'node:test';
import type { ActivityArtifact } from '../learning-activities/activity-definition.ts';
import { p01Activities } from '../learning-activities/activity-catalog.ts';
import {
  mergePrefillWithPersistedDraft,
  p01OutputFieldKeys,
  projectP01OutputPrefill,
  type P01ActivityAttemptFact,
} from './p01-output-definition.ts';

const responses: Record<string, Record<string, unknown>> = {
  'P1T1-N01-micro-01': {
    assignments: {
      'room-01-cabinets': 'in-scope',
      'shared-operator-cabinet': 'out-of-scope',
      'room-02-cabinets': 'out-of-scope',
    },
  },
  'P1T1-N02-foundation-01': {
    assignments: {
      'room-overview': 'location',
      'device-nameplate': 'identity',
      'two-ended-port-trace': 'link',
    },
  },
  'P1T1-N02-application-01': {
    order: ['bbu-port', 'odf-in', 'odf-out', 'aau-port'],
  },
  'P1T1-N02-transfer-01': {
    fields: {
      siteId: 'HY-01', roomId: '01', cabinetId: 'K02',
      deviceId: 'BBU-01', nearPort: 'BBU-1/0', farPort: 'AAU-1',
    },
  },
  'P1T1-N03-micro-01': {
    states: {
      power: 'confirmed', grounding: 'missing',
      transport: 'confirmed', environment: 'conflicting',
    },
  },
};

test('passed N01-N03 artifacts project every P01 field with server-derived attempt sources', () => {
  const prefill = projectP01OutputPrefill(
    Object.keys(responses).map((activityId, index) => attempt(activityId, `attempt-${index + 1}`)),
    p01Activities,
  );

  assert.deepEqual(Object.keys(prefill).sort(), [...p01OutputFieldKeys].sort());
  for (const field of p01OutputFieldKeys) {
    assert.equal(typeof prefill[field]?.value, 'string', field);
    assert.ok(prefill[field]!.value.trim().length > 0, field);
    assert.ok(prefill[field]!.sources.length > 0, field);
  }
  assert.match(prefill.siteRoom!.value, /HY-01.*01.*K02/);
  assert.match(prefill.collectionScope!.value, /01.*K01-K04/);
  assert.match(prefill.connectionDirection!.value, /BBU CPRI-1.*ODF-A\/12.*ODF-B\/04.*AAU-01 OPT-1/);
  assert.match(prefill.evidenceGap!.value, /保护接地.*缺证|缺证.*保护接地/);
  assert.match(prefill.riskAndReviewConclusion!.value, /缺证/);
  assert.match(prefill.riskAndReviewConclusion!.value, /冲突/);
  assert.doesNotMatch(prefill.riskAndReviewConclusion!.value, /整体正常/);
});

test('failed attempts are ignored and user origin wins over a newer demo attempt', () => {
  const demo = attempt('P1T1-N01-micro-01', 'demo-newer', {
    origin: 'demo', attemptedAt: '2026-07-16T12:00:00.000Z',
  });
  const user = attempt('P1T1-N01-micro-01', 'user-older', {
    origin: 'user', attemptedAt: '2026-07-15T12:00:00.000Z',
  });
  const failed = attempt('P1T1-N03-micro-01', 'failed-latest', {
    origin: 'user', attemptedAt: '2026-07-17T12:00:00.000Z', passed: false,
  });

  const prefill = projectP01OutputPrefill([demo, user, failed], p01Activities);
  assert.deepEqual(prefill.collectionScope?.sources, [{
    sourceNodeId: 'P1T1-N01', sourceAttemptId: 'user-older',
  }]);
  assert.equal(prefill.evidenceGap, undefined);
});

test('persisted student values override prefill without deleting any provenance', () => {
  const prefill = projectP01OutputPrefill([
    attempt('P1T1-N02-foundation-01', 'attempt-evidence'),
    attempt('P1T1-N02-transfer-01', 'attempt-record'),
  ], p01Activities);
  const merged = mergePrefillWithPersistedDraft(prefill, {
    fields: { deviceIdentity: '学生核对后修订为 BBU-01 / SN-2026-0716' },
    fieldSources: [{
      fieldKey: 'deviceIdentity', sourceNodeId: 'P1T1-N01', sourceAttemptId: 'older-source',
    }],
  });

  assert.equal(merged.deviceIdentity?.value, '学生核对后修订为 BBU-01 / SN-2026-0716');
  assert.deepEqual(merged.deviceIdentity?.sources, [
    { sourceNodeId: 'P1T1-N01', sourceAttemptId: 'older-source' },
    { sourceNodeId: 'P1T1-N02', sourceAttemptId: 'attempt-evidence' },
    { sourceNodeId: 'P1T1-N02', sourceAttemptId: 'attempt-record' },
  ]);
});

function attempt(
  activityId: string,
  attemptId: string,
  overrides: Partial<Pick<P01ActivityAttemptFact, 'origin' | 'attemptedAt' | 'passed'>> = {},
): P01ActivityAttemptFact {
  const definition = p01Activities.find(({ activity }) => activity.id === activityId);
  assert.ok(definition);
  const artifact: ActivityArtifact = {
    type: 'learning-activity-artifact',
    activityId,
    nodeId: definition.activity.nodeId,
    kind: definition.activity.kind,
    response: responses[activityId] ?? {},
    transferTarget: definition.activity.transferTarget,
  };
  return {
    attemptId,
    studentId: 'stu-01',
    activityId,
    nodeId: definition.activity.nodeId,
    passed: true,
    origin: 'user',
    attemptedAt: '2026-07-16T10:00:00.000Z',
    artifact,
    ...overrides,
  };
}
