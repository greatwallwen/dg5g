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
    helperReady: true,
  }), 'start-formal-test');
  assert.equal(teacherPrimaryActionForPhase({
    phase: 'review',
    formalTestAvailable: true,
    formalTestRunning: false,
    hasNextNode: true,
    helperReady: true,
  }), 'next-node');
  assert.equal(teacherPrimaryActionForPhase({
    phase: 'lecture',
    formalTestAvailable: true,
    formalTestRunning: false,
    hasNextNode: true,
    helperReady: true,
  }), 'push-page');
  assert.equal(teacherPrimaryActionForPhase({
    phase: 'lecture',
    formalTestAvailable: true,
    formalTestRunning: false,
    hasNextNode: true,
    helperReady: false,
  }), 'reconnect-helper');
  assert.notEqual(teacherPrimaryActionForPhase({
    phase: 'challenge',
    formalTestAvailable: true,
    formalTestRunning: true,
    hasNextNode: true,
    helperReady: true,
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
  assert.match(teacher, /data-helper-reconnect-entry/);
  assert.match(teacher, /formalAssessment\.submittedCount === 0/);
  assert.match(teacher, /data-session-action="begin-review"/);
  assert.match(projector, /data-primary-action-policy="none"/);
  assert.match(projector, /data-motion="paused"/);
  assert.match(projector, /data-session-action="previous-page"/);
  assert.match(projector, /data-session-action="next-page"/);
  assert.match(projector, /data-session-action="back-to-teacher"/);
  assert.match(projector, /allowProjectorControls: true/);
  assert.match(projector, /snapshot\.helper\.canPush/);
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

test('offline helper entry is a real teacher-only reconnect and recheck page', () => {
  const page = source('../../app/teacher/classroom-helper/page.tsx');
  assert.match(page, /requireClassRole\('teacher'\)/);
  assert.match(page, /data-helper-reconnect-page/);
  assert.match(page, /data-helper-recheck/);
  assert.match(page, /classroom-helper:start/);
});
