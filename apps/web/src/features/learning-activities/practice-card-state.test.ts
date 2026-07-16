import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activityPracticeCardState,
  practiceCardClassName,
} from './practice-card-state.ts';

test('practice cards use the shared static state class mapping', () => {
  assert.deepEqual([
    practiceCardClassName('idle'),
    practiceCardClassName('wrong'),
    practiceCardClassName('correct'),
  ], [
    'self-study-practice-card is-idle',
    'self-study-practice-card is-wrong',
    'self-study-practice-card is-correct',
  ]);
});

test('activity result state is resolved independently from class composition', () => {
  assert.equal(activityPracticeCardState({ persistedPassed: false, result: null }), 'idle');
  assert.equal(activityPracticeCardState({ persistedPassed: false, result: { passed: false } }), 'wrong');
  assert.equal(activityPracticeCardState({ persistedPassed: false, result: { passed: true } }), 'correct');
  assert.equal(activityPracticeCardState({ persistedPassed: true, result: null }), 'correct');
});
