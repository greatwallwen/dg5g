import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classroomTeachingPageAt,
  classroomTeachingPagesForNode,
  lessonSegmentAt,
  p01n02LessonSegments,
  p01TeachingPackage,
  phaseLabel,
  teachingPageAt,
} from './classroom-lesson-model.ts';

const publishedP1NodeIds = [
  'P1T1-N01', 'P1T1-N02', 'P1T1-N03', 'P1T1-N04',
  'P1T2-N01', 'P1T2-N02', 'P1T2-N03', 'P1T2-N04',
  'P1T3-N01', 'P1T3-N02', 'P1T3-N03', 'P1T3-N04',
] as const;

test('P01-N02 lesson binds the six textbook segments to playback targets', () => {
  assert.deepEqual(p01n02LessonSegments.map((segment) => segment.id), [
    'learning-case',
    'learning-visual',
    'learning-procedure',
    'learning-correction',
    'learning-practice',
    'learning-output',
  ]);
  assert.ok(p01n02LessonSegments.every((segment) => segment.points.length === 3));
  assert.ok(p01n02LessonSegments.every((segment) => segment.lead.length >= 45));
});

test('lesson segment selection is deterministic and bounded', () => {
  assert.equal(lessonSegmentAt(-2).id, 'learning-case');
  assert.equal(lessonSegmentAt(2.9).id, 'learning-procedure');
  assert.equal(lessonSegmentAt(99).id, 'learning-output');
});

test('classroom phases use concise textbook language', () => {
  assert.equal(phaseLabel('lecture'), '教师讲解');
  assert.equal(phaseLabel('challenge'), '正式测试');
});

test('P01-N02 output is a node evidence record feeding N04, not a teacher-certified task output', () => {
  const output = p01n02LessonSegments.find((segment) => segment.id === 'learning-output');
  assert.ok(output);
  const copy = [output.title, output.lead, ...output.points, output.checkpoint, output.evidence].join(' ');

  assert.match(copy, /节点证据记录/);
  assert.match(copy, /放到P01 N04成果表/);
  assert.doesNotMatch(copy, /教师(审核|复核|认证)|获得认证|能力达成/);
});

test('P01 teaching package is two complete 45-minute lessons with twelve ordered pages', () => {
  assert.equal(p01TeachingPackage.length, 2);
  assert.deepEqual(p01TeachingPackage.map(({ lessonNumber }) => lessonNumber), [1, 2]);
  assert.deepEqual(p01TeachingPackage.map(({ suggestedMinutes }) => suggestedMinutes), [45, 45]);

  const pages = p01TeachingPackage.flatMap(({ pages }) => pages);
  assert.equal(pages.length, 12);
  assert.deepEqual(pages.map(({ globalPageNumber }) => globalPageNumber), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(
    p01TeachingPackage.map(({ pages }) => pages.reduce((sum, page) => sum + page.suggestedMinutes, 0)),
    [45, 45],
  );
});

test('every P01 teaching page is directly teachable without a separate slide deck', () => {
  const pages = p01TeachingPackage.flatMap(({ pages }) => pages);
  for (const page of pages) {
    assert.ok(page.projectorContent.title.length >= 8, `${page.id} projector title`);
    assert.ok(page.projectorContent.material.length >= 35, `${page.id} concrete projector material`);
    assert.ok(page.teacherExplanation.length >= 80, `${page.id} teacher explanation`);
    assert.ok(page.caseQuestion.length >= 20, `${page.id} case question`);
    assert.ok(page.typicalAnswer.length >= 55, `${page.id} case-specific answer`);
    assert.ok(page.commonErrors.length >= 2, `${page.id} common errors`);
    assert.ok(page.followUpPrompts.length >= 2, `${page.id} follow-up prompts`);
    assert.ok(page.studentAction.length >= 20, `${page.id} student action`);
    assert.ok(page.transition.length >= 18, `${page.id} transition`);
  }
});

test('the two-lesson package explicitly teaches location, identity, direction, examples, counterexamples and output', () => {
  const copy = JSON.stringify(p01TeachingPackage);
  for (const required of [
    '位置证据',
    '设备身份',
    '连接方向',
    '机柜02',
    'BBU槽位3',
    'AAU5619',
    '完整示例一',
    '完整示例二',
    '反例一',
    '反例二',
    '室内设备与链路证据表',
    'P1T1-N02',
  ]) assert.match(copy, new RegExp(required), required);
  assert.doesNotMatch(copy, /答案需包含对象、证据、判断依据和下一步动作/);
});

test('teaching page selection is deterministic and bounded', () => {
  assert.equal(teachingPageAt(-1).id, 'P01-L1-P01');
  assert.equal(teachingPageAt(5.9).id, 'P01-L1-P06');
  assert.equal(teachingPageAt(6).id, 'P01-L2-P01');
  assert.equal(teachingPageAt(99).id, 'P01-L2-P06');
});

test('every published P1 node exposes multiple distinct classroom teaching pages', () => {
  for (const nodeId of publishedP1NodeIds) {
    const pages = classroomTeachingPagesForNode(nodeId);
    assert.equal(pages.length, nodeId === 'P1T1-N02' ? 12 : 5, nodeId);
    assert.equal(new Set(pages.map(({ id }) => id)).size, pages.length, `${nodeId} page ids`);
    assert.equal(new Set(pages.map(({ title }) => title)).size, pages.length, `${nodeId} page titles`);
    assert.ok(pages.every(({ projectorContent }) => projectorContent.material.length >= 12), `${nodeId} page material`);
  }
});

test('generic classroom page selection follows the active node instead of reusing N02 content', () => {
  const page = classroomTeachingPageAt('P1T1-N01', 1);
  assert.equal(page.id, 'P1T1-N01-S02');
  assert.equal(page.title, '入口证据确认现场');
  assert.match(page.projectorContent.material, /任务单与机房入口门牌/);
  assert.equal(classroomTeachingPageAt('P1T1-N01', 99).id, 'P1T1-N01-S05');
});

const genericTeachingAnchors: Record<Exclude<(typeof publishedP1NodeIds)[number], 'P1T1-N02'>, RegExp> = {
  'P1T1-N01': /任务单|采集范围|排除理由/,
  'P1T1-N03': /观察|授权测量|阈值|待复核/,
  'P1T1-N04': /成果表|字段|证据缺口|教师复核/,
  'P1T2-N01': /坐标|扇区|地图|采样边界/,
  'P1T2-N02': /方位角|下倾|挂高|工参/,
  'P1T2-N03': /热点|遮挡|风险点|对照点|待验证假设/,
  'P1T2-N04': /风险图层|DT|CQT|时间窗|测试条件/,
  'P1T3-N01': /工单原话|时间窗|业务|终端|现象|追问/,
  'P1T3-N02': /复测|地点|业务|终端|时间戳|条件等价/,
  'P1T3-N03': /投诉窗口|业务日志|KPI|工参|冲突证据|根因假设/,
  'P1T3-N04': /调查单|事实|根因假设|责任人|复测|回访/,
};

function privateTeachingCopy(page: ReturnType<typeof classroomTeachingPageAt>): string {
  return [
    page.teacherExplanation,
    page.caseQuestion,
    page.typicalAnswer,
    ...page.commonErrors,
    ...page.followUpPrompts,
    page.studentAction,
    page.transition,
  ].join(' ');
}

test('generic teaching guidance is domain-matched and changes on all five pages', () => {
  for (const [nodeId, anchor] of Object.entries(genericTeachingAnchors)) {
    const pages = classroomTeachingPagesForNode(nodeId);
    assert.equal(pages.length, 5, nodeId);
    assert.equal(new Set(pages.map(({ teacherExplanation }) => teacherExplanation)).size, 5, `${nodeId} explanations`);
    assert.equal(new Set(pages.map(({ caseQuestion }) => caseQuestion)).size, 5, `${nodeId} case questions`);
    assert.equal(new Set(pages.map(({ typicalAnswer }) => typicalAnswer)).size, 5, `${nodeId} typical answers`);
    assert.equal(new Set(pages.map(({ followUpPrompts }) => followUpPrompts.join('|'))).size, 5, `${nodeId} follow-ups`);
    assert.equal(new Set(pages.map(({ studentAction }) => studentAction)).size, 5, `${nodeId} student actions`);

    for (const page of pages) {
      assert.match(privateTeachingCopy(page), anchor, `${page.id} private guide must use node vocabulary`);
      assert.ok(page.teacherExplanation.includes(page.title), `${page.id} explanation follows current slide`);
      assert.ok(page.commonErrors.length >= 2, `${page.id} common errors`);
      assert.ok(page.followUpPrompts.length >= 2, `${page.id} follow-ups`);
    }
  }
});

test('archive, DT/CQT and complaint teaching guides do not reuse indoor device or cabinet prompts', () => {
  const unrelatedIndoorBoilerplate = /设备身份|哪一份材料负责证明对象身份|开柜|机柜|铭牌/;
  for (const nodeId of ['P1T1-N04', 'P1T2-N04', 'P1T3-N01', 'P1T3-N02', 'P1T3-N03', 'P1T3-N04'] as const) {
    const copy = classroomTeachingPagesForNode(nodeId).map(privateTeachingCopy).join(' ');
    assert.doesNotMatch(copy, unrelatedIndoorBoilerplate, nodeId);
    assert.doesNotMatch(copy, /先保留材料已经证明的事实/, `${nodeId} generic answer boilerplate`);
  }
});
