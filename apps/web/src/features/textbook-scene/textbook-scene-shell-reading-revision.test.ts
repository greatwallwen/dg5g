import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const facts = readFileSync(new URL('./textbook-scene-learning-facts.ts', import.meta.url), 'utf8');
const renderer = readFileSync(new URL('./self-study-renderer.tsx', import.meta.url), 'utf8');

test('sequential reading writes consume the latest committed learning revision', () => {
  assert.match(renderer, /await persistSection\(sectionId\);\s*await onReadingComplete/);
  assert.match(facts, /const latest = await fetchLearningProgress\(\)/);
  assert.match(facts, /latest\.version/);
  assert.doesNotMatch(facts, /input\.snapshot\.version/);
  assert.doesNotMatch(renderer, /removeEventListener\('beforeunload'[\s\S]{0,120}flushSection/);
});
