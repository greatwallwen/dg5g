import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('student home renders one unmistakable primary path and all four novice questions', () => {
  const source = file('./student-home.tsx');
  for (const snippet of [
    'data-student-home',
    'data-student-home-primary-path',
    'data-student-home-progress',
    'data-student-home-recommendations',
    '我正在学什么',
    '为什么学',
    '下一步做什么',
    '做到什么算完成',
    '继续学习',
    '查看其他任务',
    '课程能力图谱',
  ]) assert.match(source, new RegExp(snippet), snippet);
  assert.equal((source.match(/data-role-home-primary/g) ?? []).length, 1);
  assert.equal((source.match(/data-primary-action(?:\s|=)/g) ?? []).length, 1);
  assert.match(source, /data-motion="paused"/);
  assert.match(source, /data-primary-action-policy="exactly-one"/);
  assert.match(source, /data-student-current-task=\{model\.current\.task\.id\}/);
  assert.match(source, /<Icon /);
  assert.doesNotMatch(source, /<svg|emoji|24\s*人|3\s*人/);
});

test('teacher workbench labels dynamic SQLite counts and exposes one-click continue plus two-click N02 selection', () => {
  const source = file('../workbench/teacher-workbench.tsx');
  const startLessonClient = file('../workbench/teacher-start-lesson-client.tsx');
  for (const snippet of [
    'data-teacher-workbench',
    'data-teacher-session-list',
    'data-teacher-workbench-progress',
    'data-teacher-workbench-actions',
    '继续授课',
    '开始新课',
    '待批阅专业产出',
    '班级薄弱点',
    '课堂活动已提交',
    '本轮正式测试已提交',
    '课程能力图谱',
    'memberCount',
    'submissionPercent',
  ]) assert.match(source, new RegExp(snippet), snippet);
  assert.match(source, /<TeacherStartLessonClient/);
  assert.match(startLessonClient, /<details/);
  assert.match(startLessonClient, /data-start-lesson-node=\{option\.nodeId\}/);
  assert.match(startLessonClient, /startTeacherLesson/);
  assert.doesNotMatch(`${source}\n${startLessonClient}`, /option\.href|\?nodeId=/);
  assert.equal((source.match(/data-primary-action(?:\s|=)/g) ?? []).length, 1);
  assert.match(source, /data-motion="paused"/);
  assert.match(source, /data-primary-action-policy="exactly-one"/);
  assert.match(source, /href=\{model\.continueAction\.href\}/);
  assert.match(source, /model\.lastPosition\.nodeId/);
  assert.match(source, /model\.lastPosition\.nodeTitle/);
  assert.match(source, /<Icon /);
  assert.doesNotMatch(source, /<svg|emoji|24\s*人|3\s*人|>成绩</);
  assert.doesNotMatch(source, /submittedCount\s*\/\s*model\.classroom\.memberCount/);
});

test('role homes use the selected Image2 dark engineering tokens without purple or gradient decoration', () => {
  const css = file('../../app/role-home-v5.css');
  for (const snippet of ['#061a35', '#32d3cf', '#32bd88', '#f2aa4c', '#eb6573']) {
    assert.match(css, new RegExp(snippet), snippet);
  }
  assert.doesNotMatch(css, /linear-gradient|radial-gradient|#6758f4|purple/i);
  assert.match(css, /min-height:\s*44px/);
  const primaryActionsRule = css.match(/\.student-primary-actions\s*\{[^}]*\}/)?.[0] ?? '';
  assert.doesNotMatch(primaryActionsRule, /margin-top:\s*auto/);
  const compactBreakpoint = css.match(/@media\s*\(max-width:\s*420px\)[\s\S]*$/)?.[0] ?? '';
  assert.match(compactBreakpoint, /\.student-primary-path/);
  assert.match(compactBreakpoint, /\.student-question-grid/);
  assert.match(compactBreakpoint, /\.student-primary-actions/);
}
);

function file(relativePath: string): string {
  try {
    return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  } catch {
    return '';
  }
}
