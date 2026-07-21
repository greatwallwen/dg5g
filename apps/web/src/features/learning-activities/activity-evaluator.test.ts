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
  const correctedWithReasons = {
    ...correctedResponse,
    reasons: {
      'shared-operator-cabinet': '柜门标识属于其他运营商，不能混入本次任务台账。',
      'room-02-cabinets': '02号机房不在任务单的01号机房范围内，本次先排除。',
    },
  };

  assert.equal(evaluateActivity(scopeActivity, wrongResponse).passed, false);
  assert.equal(evaluateActivity(scopeActivity, correctedResponse).passed, false, '排除对象必须写出可复核理由');
  const corrected = evaluateActivity(scopeActivity, correctedWithReasons);
  assert.equal(corrected.passed, true);
  assert.equal(corrected.correctionPath.length, 0);
  assert.equal(corrected.artifact.activityId, scopeActivity.activity.id);
});

test('each activity kind uses its own answer model', () => {
  const correctResponses = [
    {
      assignments: { 'room-01-cabinets': 'in-scope', 'shared-operator-cabinet': 'out-of-scope', 'room-02-cabinets': 'out-of-scope' },
      reasons: {
        'shared-operator-cabinet': '柜门标识属于其他运营商，不能混入本次采集范围。',
        'room-02-cabinets': '任务单只列入01号机房，02号机房本次排除。',
      },
    },
    { assignments: { 'room-overview': 'location', 'device-nameplate': 'identity', 'two-ended-port-trace': 'link' } },
    { order: ['bbu-port', 'odf-in', 'odf-out', 'aau-port'] },
    { fields: { siteId: 'HY-01', roomId: '01', cabinetId: 'K02', deviceId: 'BBU-01', nearPort: 'BBU-1/0', farPort: 'AAU-1' } },
    { states: { power: 'satisfied', grounding: 'pendingReview', transport: 'satisfied', environment: 'abnormal', unauthorizedOperation: 'noAuthority' } },
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
        reasons: {
          'shared-operator-cabinet': '柜门标识属于其他运营商，不能混入本次采集范围。',
          'room-02-cabinets': '任务单只列入01号机房，02号机房本次排除。',
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

const p02AndP03ActivityIds = [
  'P1T2-N01-micro-01',
  'P1T2-N02-foundation-01',
  'P1T2-N02-application-01',
  'P1T2-N02-transfer-01',
  'P1T2-N03-micro-01',
  'P1T2-N04-micro-01',
  'P1T3-N01-micro-01',
  'P1T3-N02-foundation-01',
  'P1T3-N02-application-01',
  'P1T3-N02-transfer-01',
  'P1T3-N03-micro-01',
  'P1T3-N04-micro-01',
] as const;

const validStructuredResponses: Record<typeof p02AndP03ActivityIds[number], string> = {
  'P1T2-N01-micro-01': '采用站点坐标统一底图，标出三个扇区方向、道路热点 H1/H2、邻区边界和本次采样范围。',
  'P1T2-N02-foundation-01': '扇区2方位角以正北为基准，机械下倾用支架刻度，电下倾读取 RET，挂高从地面起算并绑定照片。',
  'P1T2-N02-application-01': '扇区2方位角120度与投诉路段125度接近，机械下倾2度、电下倾4度和挂高32米支持主瓣方向判断；仍需补罗盘基准与 RET 采集时间。',
  'P1T2-N02-transfer-01': '不拆美化罩，先用站点工单和扇区标签确认身份，再用罗盘测向、RET 网管参数和挂高测量交叉复核，并把遮挡与不确定性登记为待复核。',
  'P1T2-N03-micro-01': '照片显示扇区主瓣120度指向东南，遮挡楼体位于热点 H2 前方；在楼体两侧设置风险点和对照点采样，结论为待验证遮挡假设。',
  'P1T2-N04-micro-01': '选择路线B：路线穿越遮挡风险边界，在 H2 设置 CQT 热点点位并在楼体两侧设置对照点，规定18:00-19:00采样 RSRP 和 SINR 作为验收指标。',
  'P1T3-N01-micro-01': '事实：18:00-19:00在A座18层会议室使用视频会议时5次中4次卡顿；仍缺终端型号和5G模式，需要追问并按同地点同业务条件复测。',
  'P1T3-N02-foundation-01': '记录A满足同地点、同业务、同终端；记录B地点不同，记录C业务不同，记录D终端不同。后三份条件不等价，不能写成未复现。',
  'P1T3-N02-application-01': '0-2分钟确认地点、终端和视频会议业务；2-12分钟重复入会并记录卡顿时刻；全程采集服务小区、RSRP、SINR和业务日志；12-15分钟复核时间轴。',
  'P1T3-N02-transfer-01': '按相同车次和运行区段复测，保持通话业务与终端一致，记录沿途服务小区、切换轨迹和掉线时刻，并用相同时间段重复路线。',
  'P1T3-N03-micro-01': '将18:07业务卡顿日志、同时窗 SINR -3dB、服务小区拥塞 KPI 和告警放到统一时间轴；业务侧与网络侧独立来源共同支持假设，同时保留无告警这条冲突线索。',
  'P1T3-N04-micro-01': '依据业务日志与网络 KPI 形成可派单结论：由无线优化负责人在24小时内复核拥塞参数，完成后按同地点同业务同终端复测并回访用户，以卡顿不再复现作为闭环验收。',
};

test('P02 and P03 expose one-field structured records while keeping text criteria server-only', () => {
  for (const activityId of p02AndP03ActivityIds) {
    const definition = readActivityDefinition(activityId);
    assert.ok(definition, `missing ${activityId}`);
    assert.equal(definition.activity.kind, 'structured-record');
    assert.equal(definition.activity.interaction.type, 'record-form');
    assert.deepEqual(definition.activity.interaction.fields.map(({ id }) => id), ['response']);
    assert.ok(definition.activity.materials.length > 0);
    assert.equal(definition.rule.type, 'text-criteria-map');
    if (definition.rule.type === 'text-criteria-map') {
      assert.deepEqual(Object.keys(definition.rule.constraints), ['response']);
      assert.ok(definition.rule.constraints.response!.minimumCharacters >= 20);
      assert.ok(definition.rule.constraints.response!.groups.length >= 3);
    }
    const publicPayload = JSON.stringify(definition.activity);
    assert.doesNotMatch(publicPayload, /textCriteriaRules|minimumCharacters|constraints|groups/i);
    assert.equal(evaluateActivity(definition, { fields: { response: '' } }).passed, false);
    assert.equal(evaluateActivity(definition, {
      fields: { response: validStructuredResponses[activityId] },
    }).passed, true, activityId);
  }
});

test('repository records targeted failure and successful retry for P02 and P03 activities', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    const repository = new ActivityRepository(fixture.database);
    for (const activityId of ['P1T2-N03-micro-01', 'P1T3-N04-micro-01'] as const) {
      const activity = readActivityDefinition(activityId);
      assert.ok(activity);
      const attemptId = `retry-${activityId}`;
      const failed = repository.recordEvaluatedAttempt({
        attemptId,
        studentId: 'stu-01',
        activity,
        response: { fields: { response: '只有一个主观结论' } },
        expectedVersion: 0,
      });
      assert.equal(failed.passed, false);
      assert.equal(failed.feedback, activity.activity.feedback.failed);
      assert.ok(failed.correctionPath.length > 0);

      const passed = repository.recordEvaluatedAttempt({
        attemptId,
        studentId: 'stu-01',
        activity,
        response: { fields: { response: validStructuredResponses[activityId] } },
        expectedVersion: 1,
      });
      assert.equal(passed.passed, true);
      assert.equal(passed.version, 2);
      assert.equal(passed.feedback, activity.activity.feedback.passed);
      assert.deepEqual(fixture.database.prepare(`
        SELECT activity_id AS activityId, node_id AS nodeId, passed, origin
        FROM practice_attempts WHERE attempt_id = ?
      `).get(attemptId), {
        activityId,
        nodeId: activity.activity.nodeId,
        passed: 1,
        origin: 'user',
      });
    }
  } finally {
    fixture.cleanup();
  }
});
