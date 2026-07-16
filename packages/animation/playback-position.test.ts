import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePlaybackStart } from './src/playback-position.ts';

test('normalizes an authoritative action cursor and action-relative position', () => {
  assert.deepEqual(normalizePlaybackStart({
    sceneCount: 1,
    actionCount: 6,
    sceneIndex: 0,
    actionIndex: 3,
    positionMs: 12_450,
  }), {
    sceneIndex: 0,
    actionIndex: 3,
    positionMs: 12_450,
  });
});

test('clamps stale or invalid cursor values', () => {
  assert.deepEqual(normalizePlaybackStart({
    sceneCount: 1,
    actionCount: 6,
    sceneIndex: 7,
    actionIndex: 99,
    positionMs: -20,
  }), {
    sceneIndex: 0,
    actionIndex: 5,
    positionMs: 0,
  });
});
