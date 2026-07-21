import assert from 'node:assert/strict';
import test from 'node:test';
import {
  lessonSegmentAt,
  p01n02LessonSegments,
  p01TeachingPackage,
  phaseLabel,
  teachingPageAt,
} from './classroom-lesson-model.ts';

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
