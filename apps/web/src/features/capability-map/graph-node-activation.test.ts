import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isGraphNodeKeyboardActivation,
  isGraphNodePointerActivation,
  isGraphNodeSyntheticClick,
} from './graph-node-activation.ts';

function activationCount(decisions: readonly boolean[]) {
  return decisions.filter(Boolean).length;
}

test('each graph-node activation channel fires once without counting a physical click twice', () => {
  const pointerStart = { id: 7, x: 20, y: 30 };

  assert.equal(activationCount([
    isGraphNodePointerActivation(pointerStart, { id: 7, x: 24, y: 34 }),
    isGraphNodeSyntheticClick(1),
  ]), 1, 'short physical pointer gesture followed by its click');
  assert.equal(activationCount([
    isGraphNodePointerActivation(pointerStart, { id: 7, x: 27, y: 30 }),
    isGraphNodeSyntheticClick(1),
  ]), 0, 'pointer movement beyond the six-pixel threshold');
  assert.equal(activationCount([isGraphNodeKeyboardActivation('Enter')]), 1, 'Enter key');
  assert.equal(activationCount([isGraphNodeKeyboardActivation(' ')]), 1, 'Space key');
  assert.equal(activationCount([isGraphNodeSyntheticClick(0)]), 1, 'assistive synthetic click');
});
