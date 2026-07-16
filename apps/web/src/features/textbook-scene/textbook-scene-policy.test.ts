import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) return nextResolve(new URL(`../../${specifier.slice(2)}.ts`, import.meta.url).href, context);
    if (specifier.startsWith('.') && !specifier.endsWith('.ts')) return nextResolve(`${specifier}.ts`, context);
    return nextResolve(specifier, context);
  },
});

const { classifyCompletedLearningNode } = await import('./textbook-scene-policy.ts');

test('P1T3 navigation is explicit and formal assessment comes from node policy', () => {
  assert.deepEqual(classifyCompletedLearningNode('P1T3-N01'), { kind: 'continue', taskId: 'P03' });
  assert.deepEqual(classifyCompletedLearningNode('P1T3-N02'), { kind: 'challenge', taskId: 'P03' });
  assert.deepEqual(classifyCompletedLearningNode('P1T3-N04'), { kind: 'challenge', taskId: 'P03' });
});

test('unknown nodes fail closed instead of falling back to P01', () => {
  assert.deepEqual(classifyCompletedLearningNode('missing-node'), { kind: 'unavailable' });
});
