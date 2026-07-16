import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateDatabase } from '../../platform/db/migrations.ts';
import { seedBase } from '../../platform/db/demo-seed.ts';
import { createTestDatabase } from '../../platform/db/test-database.ts';
import { loadP1DemoContent } from '../platform/p1-content.ts';
import { publicActivityFromPractice } from './activity-definition.ts';
import {
  p01Activities,
  p01BaseActivities,
  readActivityDefinition,
} from './activity-catalog.ts';
import { evaluateActivity } from './activity-evaluator.ts';
import { ActivityRepository } from './activity-repository.ts';

test('P01 preserves six authentic base activity kinds in node order', () => {
  assert.deepEqual(p01BaseActivities.map(({ activity }) => activity.kind), [
    'scope-classification',
    'evidence-classification',
    'link-reconstruction',
    'structured-record',
    'four-state-judgement',
    'defective-sheet-revision',
  ]);
  assert.equal(new Set(p01BaseActivities.map(({ activity }) => activity.id)).size, 6);
  for (const { activity } of p01BaseActivities) {
    assert.ok(activity.materials.length > 0);
    assert.ok(activity.feedback.passed.length > 0);
    assert.ok(activity.feedback.failed.length > 0);
    assert.ok(activity.correctionPath.length > 0);
    assert.ok(activity.transferTarget.length > 0);
    assert.equal(activity.retryable, true);
  }
});

test('scope classification fails an incomplete answer and passes the corrected answer', () => {
  const scopeActivity = p01BaseActivities[0]!;
  const wrongResponse = {
    assignments: {
      'room-01-cabinets': 'in-scope',
      'shared-operator-cabinet': 'in-scope',
    },
  };
  const correctedResponse = {
    assignments: {
      'room-01-cabinets': 'in-scope',
      'shared-operator-cabinet': 'out-of-scope',
      'room-02-cabinets': 'out-of-scope',
    },
  };

  assert.equal(evaluateActivity(scopeActivity, wrongResponse).passed, false);
  const corrected = evaluateActivity(scopeActivity, correctedResponse);
  assert.equal(corrected.passed, true);
  assert.equal(corrected.correctionPath.length, 0);
  assert.equal(corrected.artifact.activityId, scopeActivity.activity.id);
});

test('each activity kind uses its own answer model', () => {
  const correctResponses = [
    { assignments: { 'room-01-cabinets': 'in-scope', 'shared-operator-cabinet': 'out-of-scope', 'room-02-cabinets': 'out-of-scope' } },
    { assignments: { 'room-overview': 'location', 'device-nameplate': 'identity', 'two-ended-port-trace': 'link' } },
    { order: ['bbu-port', 'odf-in', 'odf-out', 'aau-port'] },
    { fields: { siteId: 'HY-01', roomId: '01', cabinetId: 'K02', deviceId: 'BBU-01', nearPort: 'BBU-1/0', farPort: 'AAU-1' } },
    { states: { power: 'confirmed', grounding: 'missing', transport: 'confirmed', environment: 'conflicting' } },
    { revisions: { duplicatePhotoId: 'IMG-024B', missingSource: 'IMG-021', openGap: 'GAP-03: reshoot grounding label' } },
  ];

  p01BaseActivities.forEach((activity, index) => {
    assert.equal(evaluateActivity(activity, correctResponses[index]).passed, true, activity.activity.kind);
  });
});

test('repository persists the server-evaluated attempt in migration 009 practice_attempts', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    const repository = new ActivityRepository(fixture.database);
    const activity = p01BaseActivities[0]!;
    const result = repository.recordEvaluatedAttempt({
      attemptId: 'practice-attempt-001',
      studentId: 'stu-01',
      activity,
      response: {
        assignments: {
          'room-01-cabinets': 'in-scope',
          'shared-operator-cabinet': 'out-of-scope',
          'room-02-cabinets': 'out-of-scope',
        },
      },
      expectedVersion: 0,
    });

    assert.equal(result.passed, true);
    assert.equal(result.version, 1);
    assert.deepEqual(repository.readAttempt('stu-01', 'practice-attempt-001'), result);
    assert.deepEqual(fixture.database.prepare(`
      SELECT student_id AS studentId, activity_id AS activityId, node_id AS nodeId,
        passed, origin
      FROM practice_attempts WHERE attempt_id = ?
    `).get('practice-attempt-001'), {
      studentId: 'stu-01',
      activityId: activity.activity.id,
      nodeId: activity.activity.nodeId,
      passed: 1,
      origin: 'user',
    });
    assert.throws(() => repository.recordEvaluatedAttempt({
      attemptId: 'practice-attempt-001',
      studentId: 'stu-01',
      activity,
      response: {},
      expectedVersion: 0,
    }), /expected version 0, received 1/i);
  } finally {
    fixture.cleanup();
  }
});

test('the self-study public activity payload contains no private answer model', () => {
  const content = loadP1DemoContent();
  const node = content.tasks[0].nodes[0];
  const practice = node.selfStudy.kind === 'standard' ? node.selfStudy.microPractice[0]! : undefined;
  assert.ok(practice);
  const publicActivity = publicActivityFromPractice(practice, node.id);
  assert.ok(publicActivity);

  for (const serialized of [JSON.stringify(publicActivity), JSON.stringify(content.tasks[0].nodes)]) {
    assert.doesNotMatch(serialized, /answerModel|answerKey|correctAnswer|evaluationRule/i);
  }
});

test('defective-sheet revision normalizes text and accepts multiple valid corrections', () => {
  const revisionActivity = p01BaseActivities[5]!;
  const validResponses = [
    {
      revisions: {
        duplicatePhotoId: ' img-024b ',
        missingSource: ' img-021 ',
        openGap: 'GAP-03：补拍接地排标识',
      },
    },
    {
      revisions: {
        duplicatePhotoId: 'IMG-025',
        missingSource: 'IMG-022',
        openGap: '安排工程师重拍 GAP03 grounding cable label',
      },
    },
  ];

  for (const response of validResponses) {
    assert.equal(evaluateActivity(revisionActivity, response).passed, true);
  }
  assert.equal(evaluateActivity(revisionActivity, {
    revisions: {
      duplicatePhotoId: 'IMG-024',
      missingSource: 'IMG-099',
      openGap: 'GAP-03 保持未拍到',
    },
  }).passed, false);
});

test('targeted remediation activities require their own defect and conclusion responses', () => {
  assert.equal(p01Activities.length, 8);
  const revision = readActivityDefinition('P1T1-N02-remediation-revision-01');
  const conclusion = readActivityDefinition('P1T1-N02-remediation-conclusion-01');
  assert.ok(revision);
  assert.ok(conclusion);

  assert.equal(evaluateActivity(revision, {
    fields: {
      siteId: 'HY-01',
      roomId: '01',
      cabinetId: 'K02',
      deviceId: 'BBU-01',
      nearPort: 'BBU-1/0',
      farPort: 'AAU-1',
    },
  }).passed, false);
  assert.equal(evaluateActivity(revision, {
    revisions: {
      sourceEvidenceRevision: '原表缺少字段来源，补充设备铭牌 IMG-031 和源端口 IMG-032。',
      photoIndexRevision: '设备对应 IMG-031，源端口对应 IMG-032，对端口对应 IMG-033。',
      directionRevision: '连接方向为源端 BBU-01 CPRI-1 至对端 AAU-01 OPT-1。',
    },
  }).passed, true);

  assert.equal(evaluateActivity(conclusion, {
    fields: {
      siteId: 'HY-01',
      roomId: '01',
      cabinetId: 'K02',
      deviceId: 'BBU-01',
      nearPort: 'BBU-1/0',
      farPort: 'AAU-1',
    },
  }).passed, false);
  assert.equal(evaluateActivity(conclusion, {
    fields: {
      confirmedFact: '设备铭牌可识别，源端口照片清晰，已确认设备身份和源端口。',
      evidenceGap: '对端端口照片模糊，当前无法确认对端端口编号。',
      risk: '直接下结论存在链路误判风险，会影响成果交付。',
      action: '补拍对端端口照片并复核编号后再更新记录。',
    },
  }).passed, true);
});
