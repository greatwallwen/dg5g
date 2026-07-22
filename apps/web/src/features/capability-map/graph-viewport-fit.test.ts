import assert from 'node:assert/strict';
import test from 'node:test';
import { fitP1PathViewport } from './graph-viewport-fit.ts';

test('P1 path fit keeps layer labels and the rightmost result inside a 1440 desktop canvas', () => {
  const viewportWidth = 1_022;
  const transform = fitP1PathViewport(viewportWidth, 900);

  const layerLabelLeft = transform.x + 28 * transform.k;
  const rightmostResult = transform.x + 1_290 * transform.k;

  assert.ok(layerLabelLeft >= 8, `layer label starts at ${layerLabelLeft}px`);
  assert.ok(rightmostResult <= viewportWidth - 8, `rightmost result ends at ${rightmostResult}px`);
});
