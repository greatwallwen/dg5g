import assert from 'node:assert/strict';
import test from 'node:test';
import { lessonSegmentAt, p01n02LessonSegments, phaseLabel } from './classroom-lesson-model.ts';

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
  assert.match(copy, /汇入P01 N04成果表/);
  assert.doesNotMatch(copy, /教师(审核|复核|认证)|获得认证|能力达成/);
});
