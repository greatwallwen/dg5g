import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const elements = readFileSync(new URL('./semantic-graph-elements.tsx', import.meta.url), 'utf8');

test('graph nodes expose stable access markers and do not overlap future-open labels', () => {
  assert.match(elements, /data-graph-node-label=\{access\.label\}/);
  assert.match(elements, /data-graph-node-state=\{access\.kind\}/);
  assert.match(elements, /node\.subtitle && !access\.disabled/);
  assert.match(elements, /className="semantic-edge-label"/);
  assert.match(elements, /`任务综合分 \$\{taskScore === undefined \? '尚未形成'/);
  assert.doesNotMatch(elements, /P1T1-N04' \? '证据链重建'/);
});

test('semantic edges use tested orthogonal routing and auditable endpoint markers', () => {
  assert.match(elements, /routeSemanticEdge/);
  assert.match(elements, /placeEdgeLabel/);
  assert.match(elements, /data-edge-source=/);
  assert.match(elements, /data-edge-target=/);
  assert.match(elements, /data-edge-route=/);
  assert.doesNotMatch(elements, /\sC\$\{points\.x1\}/);
});

test('graph nodes retain Enter and Space keyboard activation', () => {
  assert.match(elements, /event\.key === 'Enter' \|\| event\.key === ' '/);
  assert.match(elements, /event\.preventDefault\(\)/);
  assert.match(elements, /tabIndex=\{access\.disabled \? -1 : 0\}/);
});

test('graph nodes distinguish a short pointer activation from D3 graph panning', () => {
  assert.match(elements, /onPointerDownCapture=\{startPointer\}/);
  assert.match(elements, /onPointerUpCapture=\{finishPointer\}/);
  assert.match(elements, /Math\.hypot\([\s\S]*?\) <= 6/);
  assert.doesNotMatch(elements, /\s+onClick=/);
});
