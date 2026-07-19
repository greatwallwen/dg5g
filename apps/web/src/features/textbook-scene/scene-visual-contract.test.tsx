import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SceneVisual } from './learning-scene.tsx';
import { sceneVisualIds } from './scene-visual-contract.ts';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

test('SceneVisual supports the declared visual set and fails closed for unknown values', () => {
  for (const visualId of sceneVisualIds) {
    assert.doesNotThrow(() => renderToStaticMarkup(createElement(SceneVisual, {
      visualId,
      activeStep: 1,
    })), visualId);
  }

  assert.throws(() => renderToStaticMarkup(createElement(SceneVisual, {
    visualId: 'unrelated-route-map',
    activeStep: 1,
  })), /Unsupported scene visual/);
});
