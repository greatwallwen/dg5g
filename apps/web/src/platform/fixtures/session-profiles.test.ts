import assert from 'node:assert/strict';
import test from 'node:test';
import { loadP1DemoContent } from '../../features/platform/p1-content.ts';
import { getNodeLearningPolicy } from '../learning-policy.ts';
import { sessionProfiles } from './session-profiles.ts';

const semanticAnchors = {
  'P1T1-N01': ['任务单', 'K01—K04', '排除理由'],
  'P1T1-N02': ['位置证据', '设备身份', '连接方向'],
  'P1T1-N03': ['授权', '阈值来源', '待复核'],
  'P1T1-N04': ['N01', 'N02', 'N03'],
  'P1T2-N01': ['站点坐标', '扇区方向', '道路与热点', '邻区边界', '采样边界'],
  'P1T2-N02': ['方位角', '机械下倾', '电子下倾', '挂高', '测量基准'],
  'P1T2-N03': ['遮挡体', '风险采样点', '对照采样点', '待验证假设'],
  'P1T2-N04': ['风险图层', 'DT路线', 'CQT点位', '时间窗'],
  'P1T3-N01': ['时间窗', '地点', '业务', '终端', '现象', '频次', '待追问'],
  'P1T3-N02': ['同地点', '同业务', '同终端', '时间窗', '条件不等价'],
  'P1T3-N03': ['投诉', '复测', '告警', 'KPI', '工参', '冲突', '根因假设'],
  'P1T3-N04': ['事实', '证据', '根因假设', '责任', '时限', '复测', '回访'],
} as const;

function profileCopy(nodeId: keyof typeof sessionProfiles): string {
  const profile = sessionProfiles[nodeId];
  return [profile.visualTitle, profile.sceneTitle, ...profile.slides.flat()].join(' ');
}

test('all twelve five-page profiles stay anchored to their generated node goal', () => {
  const nodes = loadP1DemoContent().tasks.flatMap((task) => task.nodes);

  assert.equal(nodes.length, 12);
  for (const node of nodes) {
    const nodeId = node.id as keyof typeof sessionProfiles;
    const profile = sessionProfiles[nodeId];
    const copy = profileCopy(nodeId);

    assert.ok(profile, `${node.id} session profile`);
    assert.equal(profile.slides.length, 5, `${node.id} page count`);
    assert.match(profile.visualTitle, new RegExp(node.title), `${node.id} visual title`);
    assert.match(profile.sceneTitle, new RegExp(node.title), `${node.id} scene title`);
    for (const anchor of semanticAnchors[nodeId]) {
      assert.match(copy, new RegExp(anchor), `${node.id} must teach ${anchor}`);
    }
  }
});

test('measurement and diagnosis pages preserve authorization and conclusion boundaries', () => {
  const indoorConditions = profileCopy('P1T1-N03');
  assert.match(indoorConditions, /观察/);
  assert.match(indoorConditions, /授权.{0,20}(测量|人员)|测量.{0,20}授权/);
  assert.match(indoorConditions, /阈值来源/);
  assert.match(indoorConditions, /权限不足.{0,20}待复核|待复核.{0,20}权限不足/);
  assert.match(indoorConditions, /学生.{0,16}不(独立|自行).{0,12}(带电测量|开柜)/);

  const antennaPosture = profileCopy('P1T2-N02');
  assert.match(antennaPosture, /授权/);
  assert.match(antennaPosture, /测量基准/);

  const sceneMapping = profileCopy('P1T2-N03');
  assert.doesNotMatch(sceneMapping, /判断干扰来源|异常噪声/);
  assert.match(sceneMapping, /待验证假设/);

  const complaintReproduction = profileCopy('P1T3-N02');
  assert.match(complaintReproduction, /测试SIM/);
  assert.match(complaintReproduction, /脱敏/);
  assert.match(complaintReproduction, /条件不等价/);

  const complaintCrossCheck = profileCopy('P1T3-N03');
  assert.doesNotMatch(complaintCrossCheck, /形成网络侧判断/);
  assert.match(complaintCrossCheck, /冲突.{0,24}(待验证|备选)|待验证.{0,24}冲突/);
});

test('professional-output nodes name the real form and stop at teacher confirmation', () => {
  for (const nodeId of ['P1T1-N04', 'P1T2-N04', 'P1T3-N04'] as const) {
    const policy = getNodeLearningPolicy(nodeId);
    assert.ok(policy?.requiresProfessionalOutput, `${nodeId} professional output policy`);
    assert.ok(policy.requiresTeacherVerification, `${nodeId} teacher verification policy`);
    assert.ok(policy.professionalOutputTitle, `${nodeId} output title`);

    const copy = profileCopy(nodeId);
    assert.match(copy, new RegExp(policy.professionalOutputTitle));
    assert.match(copy, /提交/);
    assert.match(copy, /教师确认/);
    assert.doesNotMatch(copy, /提交[^。；]{0,24}(能力达成|闭环完成)/);
  }
});

test('outdoor sampling pages carry authorization privacy and threshold provenance', () => {
  const sceneMapping = profileCopy('P1T2-N03');
  assert.match(sceneMapping, /授权/);
  assert.match(sceneMapping, /测试SIM/);
  assert.match(sceneMapping, /脱敏/);
  assert.match(sceneMapping, /阈值来源/);

  const riskMap = profileCopy('P1T2-N04');
  assert.match(riskMap, /判断依据.{0,18}(手册|规程|教师)|(?:手册|规程|教师).{0,18}判断依据/);
  assert.match(riskMap, /案例.{0,16}统一阈值/);
});

test('complaint profiles protect accounts and data without overstating a root cause', () => {
  const reproduction = profileCopy('P1T3-N02');
  assert.doesNotMatch(reproduction, /(用户|业务)账号.{0,12}(相同|一致|保持)/);
  assert.match(reproduction, /获授权.{0,8}测试账号/);
  assert.match(reproduction, /SIM.{0,16}(差异|登记|留痕)/);

  const crossCheck = profileCopy('P1T3-N03');
  assert.match(crossCheck, /授权/);
  assert.match(crossCheck, /脱敏/);
  assert.match(crossCheck, /阈值来源/);
});

test('complaint closure turns a confirmed case into a reusable positioning path', () => {
  const copy = profileCopy('P1T3-N04');
  for (const anchor of ['触发场景', '证据清单', '判断边界', '复测条件']) {
    assert.match(copy, new RegExp(anchor));
  }
  assert.match(copy, /责任人/);
  assert.doesNotMatch(copy, /责任对象/);
});
