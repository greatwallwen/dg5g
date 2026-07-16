import assert from 'node:assert/strict';
import test from 'node:test';
import { practiceKindForNode } from './micro-practice-model.ts';

test('micro practices rotate between choice, connection and evidence cards', () => {
  assert.equal(practiceKindForNode('P1T1-N01'), 'selection');
  assert.equal(practiceKindForNode('P1T1-N02'), 'connection');
  assert.equal(practiceKindForNode('P1T1-N03'), 'ordering');
  assert.equal(practiceKindForNode('P1T1-N04'), 'card-flip');
  assert.equal(practiceKindForNode('P1T2-N02'), 'connection');
  assert.equal(practiceKindForNode('P1T2-N04'), 'card-flip');
  assert.equal(practiceKindForNode('P1T3-N02'), 'connection');
  assert.equal(practiceKindForNode('P1T3-N03'), 'ordering');
  assert.equal(practiceKindForNode('P1T3-N04'), 'card-flip');
  assert.equal(practiceKindForNode('unknown-N04'), 'selection');
});
