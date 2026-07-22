import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

test('projector names each independent page counter in learner-facing Chinese', () => {
  const projector = source('./projector-client.tsx');
  const sharedScene = source('../textbook-scene/shared-classroom-scene.tsx');
  const n02Stage = source('../textbook-scene/p01-n02-lesson-stage.tsx');

  assert.match(projector, /授课包页/);
  assert.match(projector, /讲解动作/);
  assert.match(sharedScene, /任务节点/);
  assert.match(n02Stage, /课时页/);
  assert.match(projector, /data-session-action="previous-page"/);
  assert.match(projector, /data-session-action="next-page"/);
});
