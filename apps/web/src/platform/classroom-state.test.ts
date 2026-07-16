import assert from 'node:assert/strict';
import test from 'node:test';
import type { ClassroomLessonState, LessonPhase } from './models.ts';
import {
  applyClassroomLessonIntent,
  canStudentInteract,
  initialLessonState,
  materializeClassroomLessonEvent,
  playbackPositionAt,
  reduceClassroomLessonState,
} from './classroom-state.ts';

const baseTime = Date.parse('2026-07-13T01:00:00.000Z');
const at = (offsetMs: number) => new Date(baseTime + offsetMs);

const allowedTransitions: Record<LessonPhase, LessonPhase[]> = {
  prepare: ['lecture'],
  lecture: ['question', 'practice', 'review', 'close'],
  question: ['lecture', 'practice', 'review'],
  practice: ['lecture', 'challenge', 'review'],
  challenge: ['review'],
  review: ['lecture', 'close'],
  close: [],
};

const paths: Record<LessonPhase, LessonPhase[]> = {
  prepare: [],
  lecture: ['lecture'],
  question: ['lecture', 'question'],
  practice: ['lecture', 'practice'],
  challenge: ['lecture', 'practice', 'challenge'],
  review: ['lecture', 'review'],
  close: ['lecture', 'close'],
};

test('starts in preparation with teacher-owned silent followers', () => {
  const state = initialLessonState('P1T1-N02', 'P01-ku-02');

  assert.equal(state.phase, 'prepare');
  assert.equal(state.revision, 0);
  assert.equal(state.playback.status, 'idle');
  assert.equal(state.playback.audioOwner, 'teacher');
  assert.equal(state.playback.sceneId, 'P1T1-N02-lesson');
  assert.equal(state.playback.revision, 0);
});

test('keeps lecture and review strict while learning activities remain interactive', () => {
  assert.equal(canStudentInteract('prepare'), false);
  assert.equal(canStudentInteract('lecture'), false);
  assert.equal(canStudentInteract('question'), true);
  assert.equal(canStudentInteract('practice'), true);
  assert.equal(canStudentInteract('challenge'), true);
  assert.equal(canStudentInteract('review'), false);
  assert.equal(canStudentInteract('close'), false);
});

test('covers the complete legal phase transition matrix', () => {
  for (const [from, targets] of Object.entries(allowedTransitions) as Array<[LessonPhase, LessonPhase[]]>) {
    for (const target of targets) {
      const current = stateAtPhase(from);
      const next = applyClassroomLessonIntent(current, { type: 'phase_changed', phase: target }, at(10_000));
      assert.equal(next.phase, target, `${from} -> ${target}`);
      assert.equal(next.revision, current.revision + 1, `${from} -> ${target} revision`);
    }
  }
});

test('rejects illegal phase transitions and treats close as terminal', () => {
  const phases = Object.keys(allowedTransitions) as LessonPhase[];
  for (const from of phases) {
    const current = stateAtPhase(from);
    const illegalTargets = phases.filter((target) => target !== from && !allowedTransitions[from].includes(target));
    for (const target of illegalTargets) {
      const next = applyClassroomLessonIntent(current, { type: 'phase_changed', phase: target }, at(10_000));
      assert.equal(next, current, `${from} must reject ${target}`);
    }
  }
});

test('server materializes revision and authoritative time from an intent', () => {
  const current = initialLessonState('P1T1-N02', 'P01-ku-02');
  const intent = { type: 'playback_started', actionId: 'P1T1-N02-lesson-case', actionIndex: 0, rate: 1 } as const;
  const event = materializeClassroomLessonEvent(current, intent, at(750));

  assert.equal('revision' in intent, false);
  assert.equal(event.revision, 1);
  assert.equal(event.type, 'playback_started');
  if (event.type === 'playback_started') assert.equal(event.startedAt, at(750).toISOString());
});

test('ignores stale and non-integer authoritative revisions', () => {
  const current = applyClassroomLessonIntent(stateAtPhase('lecture'), {
    type: 'playback_started',
    actionId: 'P1T1-N02-lesson-visual',
    actionIndex: 1,
    rate: 1,
  }, at(0));
  const stale = reduceClassroomLessonState(current, {
    type: 'phase_changed',
    phase: 'review',
    revision: current.revision,
    at: at(2_000).toISOString(),
    positionMs: 2_000,
  });
  const fractional = reduceClassroomLessonState(current, {
    type: 'phase_changed',
    phase: 'review',
    revision: current.revision + 0.5,
    at: at(2_000).toISOString(),
    positionMs: 2_000,
  });

  assert.equal(stale, current);
  assert.equal(fractional, current);
  assert.equal(playbackPositionAt(current.playback, at(2_000)), 2_000);
});

test('atomically pauses narration when lecture enters a student activity', () => {
  let current = stateAtPhase('lecture');
  current = applyClassroomLessonIntent(current, {
    type: 'playback_started',
    actionId: 'P1T1-N02-lesson-visual',
    actionIndex: 1,
    rate: 1,
  }, at(0));
  const question = applyClassroomLessonIntent(current, { type: 'phase_changed', phase: 'question' }, at(2_500));

  assert.equal(question.phase, 'question');
  assert.equal(question.playback.status, 'paused');
  assert.equal(question.playback.positionMs, 2_500);
  assert.equal(question.playback.startedAt, undefined);
});

test('keeps paused playback fixed regardless of wall-clock time', () => {
  const current = applyClassroomLessonIntent(initialLessonState('P1T1-N02'), {
    type: 'playback_paused',
  }, at(4_820));

  assert.equal(current.playback.status, 'paused');
  assert.equal(playbackPositionAt(current.playback, at(180_000)), 0);
});

test('pauses before transferring the only classroom audio owner', () => {
  let current = applyClassroomLessonIntent(stateAtPhase('lecture'), {
    type: 'playback_started',
    actionId: 'P1T1-N02-lesson-case',
    actionIndex: 0,
    rate: 1,
  }, at(0));
  const beforeTransferRevision = current.revision;
  current = applyClassroomLessonIntent(current, { type: 'audio_owner_changed', audioOwner: 'projector' }, at(2_500));

  assert.equal(current.playback.audioOwner, 'projector');
  assert.equal(current.playback.status, 'paused');
  assert.equal(current.playback.positionMs, 2_500);
  assert.equal(current.revision, beforeTransferRevision + 1);
});

test('makes the ended playback state reachable and stable', () => {
  let current = applyClassroomLessonIntent(stateAtPhase('lecture'), {
    type: 'playback_started',
    actionId: 'P1T1-N02-lesson-output',
    actionIndex: 5,
    rate: 1,
  }, at(0));
  current = applyClassroomLessonIntent(current, { type: 'playback_ended' }, at(3_000));

  assert.equal(current.playback.status, 'ended');
  assert.equal(current.playback.positionMs, 3_000);
  assert.equal(playbackPositionAt(current.playback, at(30_000)), 3_000);
});

function stateAtPhase(phase: LessonPhase): ClassroomLessonState {
  let state = initialLessonState('P1T1-N02', 'P01-ku-02');
  for (const nextPhase of paths[phase]) {
    state = applyClassroomLessonIntent(state, { type: 'phase_changed', phase: nextPhase }, at(state.revision + 1));
  }
  return state;
}
