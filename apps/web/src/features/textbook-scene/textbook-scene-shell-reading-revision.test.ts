import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./textbook-scene-shell.tsx', import.meta.url), 'utf8');

test('sequential reading writes consume the latest committed learning revision', () => {
  assert.match(source, /const snapshotRef = useRef\(initialSnapshot\)/);
  assert.match(source, /snapshotRef\.current = nextSnapshot;\s*setSnapshot\(nextSnapshot\)/);
  assert.match(source, /snapshot: snapshotRef\.current/);
  assert.match(source, /setSnapshot: commitSnapshot/);
  assert.doesNotMatch(source, /setSnapshot, snapshot, taskId/);
});
