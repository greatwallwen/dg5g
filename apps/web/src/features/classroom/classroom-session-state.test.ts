import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { ClassSession } from '../../platform/models.ts';
import { commandDeliveryStats, submittedFormalScores } from './classroom-session-state.ts';

test('summarizes ACK delivery for the active command and online student devices', () => {
  const session = {
    activeCommand: { commandId: 'cmd-current' },
    devicePresence: [
      { actorRole: 'student', helperState: 'online' },
      { actorRole: 'student', helperState: 'online' },
      { actorRole: 'student', helperState: 'online' },
      { actorRole: 'teacher', helperState: 'online' },
    ],
    commandAcks: [
      { commandId: 'cmd-current', state: 'applied' },
      { commandId: 'cmd-current', state: 'failed' },
      { commandId: 'cmd-old', state: 'applied' },
    ],
  } as ClassSession;

  assert.deepEqual(commandDeliveryStats(session), {
    online: 3,
    applied: 1,
    failed: 1,
    pending: 1,
  });
});

test('keeps the latest applied ACK summary visible after the command TTL ends', () => {
  const session = {
    devicePresence: [
      { actorRole: 'student', helperState: 'online' },
      { actorRole: 'student', helperState: 'online' },
      { actorRole: 'student', helperState: 'online' },
    ],
    commandAcks: [
      { commandId: 'cmd-expired-from-feed', state: 'applied' },
      { commandId: 'cmd-expired-from-feed', state: 'applied' },
      { commandId: 'cmd-expired-from-feed', state: 'applied' },
    ],
  } as ClassSession;

  assert.deepEqual(commandDeliveryStats(session), {
    online: 3,
    applied: 3,
    failed: 0,
    pending: 0,
  });
});

test('teacher submitted-count denominator comes from the authoritative assessment snapshot', () => {
  const source = readFileSync(new URL('./teacher-console-inspector.tsx', import.meta.url), 'utf8');
  assert.match(source, /p\.formalAssessment\.submittedCount\}\/\{p\.formalAssessment\.eligibleCount/);
  assert.doesNotMatch(source, /formalScores|\/24/);
});

test('teacher formal-test aggregates count a persisted zero score as submitted', () => {
  const session = {
    studentRoster: [
      { studentId: 'stu-01', bestGameScore: 0 },
      { studentId: 'stu-02', bestGameScore: 92 },
      { studentId: 'stu-03', bestGameScore: 74 },
    ],
    formalTest: {
      participants: [
        { studentId: 'stu-01', state: 'submitted', score: 0 },
        { studentId: 'stu-02', state: 'playing' },
        { studentId: 'stu-03', state: 'submitted', score: 74 },
      ],
    },
  } as ClassSession;

  assert.deepEqual(submittedFormalScores(session), [0, 74]);
});
