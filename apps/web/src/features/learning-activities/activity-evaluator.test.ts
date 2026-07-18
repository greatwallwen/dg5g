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

test('repository appends immutable self-study and classroom attempts with one shared sequence', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    const repository = new ActivityRepository(fixture.database);
    const activity = p01BaseActivities[0]!;
    const wrong = repository.recordEvaluatedAttempt({
      attemptId: 'practice-attempt-wrong',
      studentId: 'stu-01',
      activity,
      delivery: { channel: 'classroom', sessionId: 'demo-class', classroomRunId: 'lesson-run-001' },
      response: { assignments: { 'room-01-cabinets': 'out-of-scope' } },
    });
    const corrected = repository.recordEvaluatedAttempt({
      attemptId: 'practice-attempt-corrected',
      studentId: 'stu-01',
      activity,
      delivery: { channel: 'self-study' },
      response: {
        assignments: {
          'room-01-cabinets': 'in-scope',
          'shared-operator-cabinet': 'out-of-scope',
          'room-02-cabinets': 'out-of-scope',
        },
      },
    });

    assert.equal(wrong.passed, false);
    assert.equal(wrong.attemptNumber, 1);
    assert.deepEqual(wrong.delivery, {
      channel: 'classroom', sessionId: 'demo-class', classroomRunId: 'lesson-run-001',
    });
    assert.ok(wrong.mistakeCodes.length > 0);
    assert.ok(Object.keys(wrong.fieldFeedback).length > 0);
    assert.equal(corrected.passed, true);
    assert.equal(corrected.attemptNumber, 2);
    assert.deepEqual(corrected.delivery, { channel: 'self-study' });
    assert.ok(corrected.snapshotVersion > wrong.snapshotVersion);
    assert.deepEqual(repository.readAttempt('stu-01', 'practice-attempt-corrected'), corrected);
    assert.deepEqual(fixture.database.prepare(`
      SELECT student_id AS studentId, activity_id AS activityId, node_id AS nodeId,
        passed, origin, delivery_channel AS deliveryChannel, attempt_number AS attemptNumber
      FROM practice_attempts WHERE attempt_id = ?
    `).get('practice-attempt-corrected'), {
      studentId: 'stu-01',
      activityId: activity.activity.id,
      nodeId: activity.activity.nodeId,
      passed: 1,
      origin: 'user',
      deliveryChannel: 'self-study',
      attemptNumber: 2,
    });
    assert.equal(fixture.database.prepare(`SELECT COUNT(*) FROM practice_attempts`).pluck().get(), 2);
    assert.ok(repository.readTopicVersion('learning:stu-01') > 0);
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

interface P23ActivityCase {
  activityId: typeof p02AndP03ActivityIds[number];
  validResponse: Record<string, unknown>;
  invalidResponse: Record<string, unknown>;
  invalidField: string;
}

const p23ActivityCases: P23ActivityCase[] = [
  {
    activityId: 'P1T2-N01-micro-01',
    validResponse: { assignments: {
      'sector-0': 'in-scope', 'hotspot-h2': 'in-scope', 'other-operator': 'out-of-scope',
      'west-road': 'out-of-scope', 'unclear-sector': 'pending',
    } },
    invalidResponse: { assignments: {
      'sector-0': 'in-scope', 'hotspot-h2': 'in-scope', 'other-operator': 'out-of-scope',
      'west-road': 'in-scope', 'unclear-sector': 'pending',
    } },
    invalidField: 'west-road',
  },
  {
    activityId: 'P1T2-N02-foundation-01',
    validResponse: { assignments: {
      'sector-label': 'sector-identity', 'compass-north': 'azimuth',
      'bracket-scale': 'mechanical-tilt', 'ret-current': 'electrical-tilt',
      'height-reference': 'mounting-height',
    } },
    invalidResponse: { assignments: {
      'sector-label': 'sector-identity', 'compass-north': 'azimuth',
      'bracket-scale': 'mechanical-tilt', 'ret-current': 'mechanical-tilt',
      'height-reference': 'mounting-height',
    } },
    invalidField: 'ret-current',
  },
  {
    activityId: 'P1T2-N02-application-01',
    validResponse: { order: ['sector-s2', 'azimuth-120', 'tilt-2-4', 'height-32', 'hotspot-125'] },
    invalidResponse: { order: ['azimuth-120', 'sector-s2', 'tilt-2-4', 'height-32', 'hotspot-125'] },
    invalidField: 'order',
  },
  {
    activityId: 'P1T2-N02-transfer-01',
    validResponse: { fields: {
      objectIdentity: 'HY-02工单与现场S2扇区标签一致，确认目标扇区2。',
      externalDirection: '外部罗盘以真北校准，重复测得主瓣方位120度并挂接照片。',
      retAndHeight: '当前RET电下倾4度；挂高32米，以塔基地面为起算面。',
      permissionBoundary: '美化罩内部刻度不可见，工单禁止拆罩，现场人员无权操作。',
      reviewAction: '申请授权复核；未获授权前采用外部测向、工参和道路对照采样。',
    } },
    invalidResponse: { fields: {
      objectIdentity: 'HY-02工单与现场S2扇区标签一致，确认目标扇区2。',
      externalDirection: '外部罗盘以真北校准，重复测得主瓣方位120度并挂接照片。',
      retAndHeight: '当前RET电下倾4度；挂高32米，以塔基地面为起算面。',
      permissionBoundary: '拆罩查看。',
      reviewAction: '申请授权复核；未获授权前采用外部测向、工参和道路对照采样。',
    } },
    invalidField: 'permissionBoundary',
  },
  {
    activityId: 'P1T2-N03-micro-01',
    validResponse: { states: {
      obstruction: 'pending', 'parameter-conflict': 'anomaly',
      'stale-ret': 'pending', 'locked-ladder': 'unauthorized',
    } },
    invalidResponse: { states: {
      obstruction: 'anomaly', 'parameter-conflict': 'anomaly',
      'stale-ret': 'pending', 'locked-ladder': 'unauthorized',
    } },
    invalidField: 'obstruction',
  },
  {
    activityId: 'P1T2-N04-micro-01',
    validResponse: { revisions: {
      routeRevision: 'V2改为路线B，穿过楼体遮挡风险边界并覆盖H2。',
      comparisonPoints: '设置楼前点、边界点、楼后点和H2热点CQT对照点。',
      samplingWindow: '18:00—19:00使用同一终端、视频业务和服务小区S2采样。',
      acceptanceMetrics: '同步记录RSRP、SINR、卡顿现象和接通率作为验收指标。',
      versionDifference: 'V1路线A绕开风险区；V2路线B穿越风险边界，修订依据为遮挡假设。',
    } },
    invalidResponse: { revisions: {
      routeRevision: 'V2改为路线B，穿过楼体遮挡风险边界并覆盖H2。',
      comparisonPoints: '设置楼前点、边界点、楼后点和H2热点CQT对照点。',
      samplingWindow: '18:00—19:00使用同一终端、视频业务和服务小区S2采样。',
      acceptanceMetrics: '记录信号。',
      versionDifference: 'V1路线A绕开风险区；V2路线B穿越风险边界，修订依据为遮挡假设。',
    } },
    invalidField: 'acceptanceMetrics',
  },
  {
    activityId: 'P1T3-N01-micro-01',
    validResponse: { fields: {
      occurrenceWindow: '工作日18:00—19:00，重点复测18:07前后。',
      location: 'A座18层会议室，记录具体座位和朝向。',
      business: '使用视频会议执行入会、共享屏幕和退出重进。',
      symptomFrequency: '5次中4次卡顿，退出重进后暂时恢复。',
      terminalNetwork: '终端型号和5G网络模式尚缺，需要向用户追问。',
      excludedGuess: '删除“网络差导致”的原因猜测，因为当前事实尚未支持根因。',
    } },
    invalidResponse: { fields: {
      occurrenceWindow: '工作日18:00—19:00，重点复测18:07前后。',
      location: 'A座18层会议室，记录具体座位和朝向。',
      business: '使用视频会议执行入会、共享屏幕和退出重进。',
      symptomFrequency: '5次中4次卡顿，退出重进后暂时恢复。',
      terminalNetwork: '终端型号和5G网络模式尚缺，需要向用户追问。',
      excludedGuess: '确定是网络差。',
    } },
    invalidField: 'excludedGuess',
  },
  {
    activityId: 'P1T3-N02-foundation-01',
    validResponse: { fields: {
      recordAComparison: '保持A座18层会议室、原视频会议和原终端，结果未卡顿。',
      recordBComparison: '地点改为一层大厅，业务终端相同但地点条件不等价。',
      recordCComparison: '业务改为网页测速，地点终端相同但业务条件不等价。',
      recordDComparison: '终端改为工程测试机，地点业务相同但终端条件不等价。',
      comparableConclusion: '只有记录A与投诉条件可比，结论为同条件一次未复现；B、C、D不能否定投诉。',
    } },
    invalidResponse: { fields: {
      recordAComparison: '保持A座18层会议室、原视频会议和原终端，结果未卡顿。',
      recordBComparison: '地点改为一层大厅，业务终端相同但地点条件不等价。',
      recordCComparison: '业务改为网页测速，地点终端相同但业务条件不等价。',
      recordDComparison: '测试流畅。',
      comparableConclusion: '只有记录A与投诉条件可比，结论为同条件一次未复现；B、C、D不能否定投诉。',
    } },
    invalidField: 'recordDComparison',
  },
  {
    activityId: 'P1T3-N02-application-01',
    validResponse: { order: [
      'enter-meeting', 'share-screen', 'freeze', 'retransmission',
      'radio-sample', 'recovery', 'clock-check',
    ] },
    invalidResponse: { order: [
      'enter-meeting', 'share-screen', 'radio-sample', 'freeze',
      'retransmission', 'recovery', 'clock-check',
    ] },
    invalidField: 'order',
  },
  {
    activityId: 'P1T3-N02-transfer-01',
    validResponse: { fields: {
      trainDirection: '固定G218次和上海至杭州运行方向。',
      routeSection: '固定嘉兴南至杭州东区段，以里程标和定位轨迹为口径。',
      timeWindow: '18:40前后复测，并按列车实际晚点时间校正窗口。',
      deviceBusiness: '保持同一终端和通话业务，网络模式一致。',
      cellTrajectory: '连续记录服务小区、切换事件、无线指标和掉线时刻。',
      repeatPlan: '同车次同方向重复同一路线两次，完成后回访用户。',
    } },
    invalidResponse: { fields: {
      trainDirection: '固定G218次和上海至杭州运行方向。',
      routeSection: '固定嘉兴南至杭州东区段，以里程标和定位轨迹为口径。',
      timeWindow: '18:40前后复测，并按列车实际晚点时间校正窗口。',
      deviceBusiness: '保持同一终端和通话业务，网络模式一致。',
      cellTrajectory: '连续记录服务小区、切换事件、无线指标和掉线时刻。',
      repeatPlan: '看情况再测。',
    } },
    invalidField: 'repeatPlan',
  },
  {
    activityId: 'P1T3-N03-micro-01',
    validResponse: { states: {
      'business-freeze': 'supports', 'low-sinr': 'cannot-conclude',
      'high-load': 'supports', 'no-alarm': 'conflicts',
      'late-recovery': 'needs-correlation',
    } },
    invalidResponse: { states: {
      'business-freeze': 'supports', 'low-sinr': 'supports',
      'high-load': 'supports', 'no-alarm': 'conflicts',
      'late-recovery': 'needs-correlation',
    } },
    invalidField: 'low-sinr',
  },
  {
    activityId: 'P1T3-N04-micro-01',
    validResponse: { revisions: {
      evidenceLinks: '挂接18:07业务日志、无线采样和服务小区S2拥塞KPI索引。',
      boundedConclusion: '现有证据支持无线质量或容量线索，但根因尚未确定。',
      responsibleOwner: '由无线优化负责人接单，测试人员配合复测。',
      deadline: '责任人在24小时内完成参数核查并反馈。',
      retestPlan: '按同地点、同业务、同终端条件复测两次并记录全程。',
      callback: '复测完成后由客服回访用户，核对卡顿时间和恢复情况。',
      acceptance: '视频会议无卡顿、日志无重传且无线指标达标才通过验收。',
    } },
    invalidResponse: { revisions: {
      evidenceLinks: '挂接18:07业务日志、无线采样和服务小区S2拥塞KPI索引。',
      boundedConclusion: '现有证据支持无线质量或容量线索，但根因尚未确定。',
      responsibleOwner: '由无线优化负责人接单，测试人员配合复测。',
      deadline: '尽快处理。',
      retestPlan: '按同地点、同业务、同终端条件复测两次并记录全程。',
      callback: '复测完成后由客服回访用户，核对卡顿时间和恢复情况。',
      acceptance: '视频会议无卡顿、日志无重传且无线指标达标才通过验收。',
    } },
    invalidField: 'deadline',
  },
];

test('all twelve P02/P03 rules exactly match generated UI schemas and evaluate real responses', () => {
  for (const activityCase of p23ActivityCases) {
    const definition = readActivityDefinition(activityCase.activityId);
    assert.ok(definition, `missing ${activityCase.activityId}`);
    const { activity, rule } = definition;
    assert.ok(activity.materials.length > 0);

    switch (activity.kind) {
      case 'scope-classification':
      case 'evidence-classification':
        assert.equal(rule.type, 'exact-map', activity.id);
        assert.equal(rule.responseKey, 'assignments', activity.id);
        if (rule.type === 'exact-map') {
          assert.deepEqual(Object.keys(rule.expected), activity.materials.map(({ id }) => id), activity.id);
          const categories = new Set(activity.interaction.categories.map(({ id }) => id));
          assert.ok(Object.values(rule.expected).every((category) => categories.has(category)), activity.id);
        }
        break;
      case 'link-reconstruction':
        assert.equal(rule.type, 'exact-sequence', activity.id);
        assert.equal(rule.responseKey, 'order', activity.id);
        if (rule.type === 'exact-sequence') {
          assert.deepEqual([...rule.expected].sort(), activity.materials.map(({ id }) => id).sort(), activity.id);
        }
        break;
      case 'structured-record':
        assert.equal(rule.type, 'text-criteria-map', activity.id);
        assert.equal(rule.responseKey, 'fields', activity.id);
        if (rule.type === 'text-criteria-map') {
          assert.deepEqual(Object.keys(rule.constraints), activity.interaction.fields.map(({ id }) => id), activity.id);
        }
        break;
      case 'four-state-judgement':
        assert.equal(rule.type, 'exact-map', activity.id);
        assert.equal(rule.responseKey, 'states', activity.id);
        if (rule.type === 'exact-map') {
          assert.deepEqual(Object.keys(rule.expected), activity.materials.map(({ id }) => id), activity.id);
          const categories = new Set(activity.interaction.categories.map(({ id }) => id));
          assert.ok(Object.values(rule.expected).every((category) => categories.has(category)), activity.id);
        }
        break;
      case 'defective-sheet-revision':
        assert.equal(rule.type, 'revision-constraints', activity.id);
        assert.equal(rule.responseKey, 'revisions', activity.id);
        if (rule.type === 'revision-constraints') {
          assert.deepEqual(Object.keys(rule.constraints), activity.interaction.fields.map(({ id }) => id), activity.id);
        }
        break;
    }

    assert.doesNotMatch(
      JSON.stringify(activity),
      /expected|constraints|minimumCharacters|required-term-groups|accepted/i,
      activity.id,
    );
    assert.equal(evaluateActivity(definition, activityCase.validResponse).passed, true, activity.id);
    const failed = evaluateActivity(definition, activityCase.invalidResponse);
    assert.equal(failed.passed, false, activity.id);
    assert.equal(failed.feedback, activity.feedback.failed, activity.id);
    assert.deepEqual(
      Object.keys(failed.fieldFeedback),
      [activityCase.invalidField],
      `${activity.id} targeted field feedback`,
    );
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
      const activityCase = p23ActivityCases.find((candidate) => candidate.activityId === activityId)!;
      const failed = repository.recordEvaluatedAttempt({
        attemptId: `${attemptId}-failed`,
        studentId: 'stu-01',
        activity,
        delivery: { channel: 'self-study' },
        response: activityCase.invalidResponse,
      });
      assert.equal(failed.passed, false);
      assert.equal(failed.feedback, activity.activity.feedback.failed);
      assert.ok(failed.correctionPath.length > 0);

      const passed = repository.recordEvaluatedAttempt({
        attemptId: `${attemptId}-passed`,
        studentId: 'stu-01',
        activity,
        delivery: { channel: 'self-study' },
        response: activityCase.validResponse,
      });
      assert.equal(passed.passed, true);
      assert.equal(passed.attemptNumber, 2);
      assert.equal(passed.feedback, activity.activity.feedback.passed);
      assert.deepEqual(fixture.database.prepare(`
        SELECT activity_id AS activityId, node_id AS nodeId, passed, origin
        FROM practice_attempts WHERE attempt_id = ?
      `).get(`${attemptId}-passed`), {
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
