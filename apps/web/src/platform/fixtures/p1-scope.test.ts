import assert from 'node:assert/strict';
import test from 'node:test';
import { activeDemoNodeIds, activeDemoTaskIds } from './ids.ts';

test('P1 active scope contains P01 P02 and P03 with twelve nodes', () => {
  assert.deepEqual(activeDemoTaskIds, ['P1-T1', 'P1-T2', 'P1-T3']);
  assert.equal(activeDemoNodeIds.length, 12);
  assert.deepEqual(activeDemoNodeIds.slice(-4), ['P1T3-N01', 'P1T3-N02', 'P1T3-N03', 'P1T3-N04']);
});
