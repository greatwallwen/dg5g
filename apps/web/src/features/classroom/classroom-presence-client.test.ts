import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  classroomPresenceStorageKey,
  presenceIntervalFor,
} from './classroom-presence-client.ts';

test('browser presence uses one stable tab device key for each classroom surface', () => {
  assert.equal(
    classroomPresenceStorageKey('demo-class', 'student-follow'),
    'dgbook:classroom-presence:demo-class:student-follow',
  );
  assert.notEqual(
    classroomPresenceStorageKey('demo-class', 'student-follow'),
    classroomPresenceStorageKey('demo-class', 'projector'),
  );
});

test('browser presence uses visible and hidden heartbeat intervals without reporting fake offline', () => {
  assert.equal(presenceIntervalFor('visible'), 3_000);
  assert.equal(presenceIntervalFor('hidden'), 10_000);
});

test('a browser fetches its latest authorized cut before posting the minimal presence payload', () => {
  const source = readFileSync(new URL('./classroom-presence-client.ts', import.meta.url), 'utf8');
  const cutFetch = source.indexOf('/api/snapshot?');
  const heartbeat = source.indexOf('/presence');
  assert.ok(cutFetch >= 0 && heartbeat > cutFetch);
  assert.match(source, /body: JSON\.stringify\(\{[\s\S]*?deviceId,[\s\S]*?visibility,[\s\S]*?pageState:[\s\S]*?lastSeenClassroomRevision,[\s\S]*?\}\)/);
  assert.doesNotMatch(source, /actorRole|studentId|helperReady/);
  assert.doesNotMatch(source, /setConnection|data-connection-state/);
  assert.match(source, /visibilitychange/);
  assert.match(source, /controller\?\.abort\(\)/);
});
