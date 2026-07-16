import assert from 'node:assert/strict';
import test from 'node:test';
import { rootDestinationForActor } from './root-route.ts';

test('authenticated root visits resolve to the authoritative role home', () => {
  assert.equal(rootDestinationForActor(null), null);
  assert.equal(rootDestinationForActor({ role: 'student' }), '/student/home');
  assert.equal(rootDestinationForActor({ role: 'teacher' }), '/teacher/workbench');
});
