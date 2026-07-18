import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { teacherPrimaryActionForPhase } from './teacher-console-view.tsx';

test('teacherPrimaryActionForPhase exposes one contextual action for every classroom phase', () => {
  assert.equal(teacherPrimaryActionForPhase({
    phase: 'challenge',
    formalTestAvailable: true,
    formalTestRunning: false,
    hasNextNode: true,
    controlsAvailable: true,
  }), 'start-formal-test');
  assert.equal(teacherPrimaryActionForPhase({
    phase: 'review',
    formalTestAvailable: true,
    formalTestRunning: false,
    hasNextNode: true,
    controlsAvailable: true,
  }), 'next-node');
  assert.equal(teacherPrimaryActionForPhase({
    phase: 'lecture',
    formalTestAvailable: true,
    formalTestRunning: false,
    hasNextNode: true,
    controlsAvailable: true,
  }), 'push-page');
  assert.equal(teacherPrimaryActionForPhase({
    phase: 'lecture',
    formalTestAvailable: true,
    formalTestRunning: false,
    hasNextNode: true,
    controlsAvailable: false,
  }), 'reconnect-session');
  assert.notEqual(teacherPrimaryActionForPhase({
    phase: 'challenge',
    formalTestAvailable: true,
    formalTestRunning: true,
    hasNextNode: true,
    controlsAvailable: true,
  }), 'start-formal-test');
});

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

test('teacher and projector roots declare their primary-action and motion contracts', () => {
  const teacher = source('./teacher-console-view.tsx');
  const projector = source('./projector-client.tsx');

  assert.match(teacher, /data-primary-action-policy="exactly-one"/);
  assert.match(teacher, /data-motion=/);
  assert.match(teacher, /data-inspector-open=/);
  assert.match(teacher, /data-primary-action/);
  assert.match(teacher, /data-session-action="reconnect-session"/);
  assert.match(teacher, /课堂连接/);
  assert.doesNotMatch(teacher, /重连课堂助手|启动课堂助手/);
  assert.match(teacher, /formalAssessment\.submittedCount === 0/);
  assert.match(teacher, /data-session-action="begin-review"/);
  assert.match(projector, /data-primary-action-policy="none"/);
  assert.match(projector, /data-motion="paused"/);
  assert.match(projector, /data-session-action="previous-page"/);
  assert.match(projector, /data-session-action="next-page"/);
  assert.match(projector, /data-session-action="back-to-teacher"/);
  assert.match(projector, /allowProjectorControls: true/);
  assert.match(projector, /connection\.state !== 'offline'/);
  assert.doesNotMatch(projector, /snapshot\.helper\.canPush/);
  assert.match(projector, /errorDistribution/);
  assert.doesNotMatch(projector, /studentName|studentIdentifier|participant\.studentId|answers\.map/u);
});

test('teacher console supports Escape close, focus return and a modal inspector backdrop', () => {
  const client = source('./teacher-console-client.tsx');
  const inspector = source('./teacher-console-inspector.tsx');

  assert.match(client, /event\.key === 'Escape'/);
  assert.match(client, /inspectorButtonRef\.current\?\.focus/);
  assert.match(inspector, /data-teacher-inspector-backdrop/);
  assert.match(inspector, /aria-modal="true"/);
});

test('zero student devices is a non-blocking preparation warning', () => {
  const inspector = source('./teacher-console-inspector.tsx');
  assert.match(inspector, /当前无学生设备在线，不影响备课/);
  assert.doesNotMatch(inspector, /启动课堂助手后才能控制学生屏幕/);
});
