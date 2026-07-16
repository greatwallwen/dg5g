import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./use-class-session.ts', import.meta.url), 'utf8');

test('uses the completion-scheduled polling policy instead of a 400ms interval', () => {
  assert.match(source, /createClassSessionPoller/);
  assert.match(source, /resolvePollTier/);
  assert.match(source, /participationMode/);
  assert.match(source, /visibilitychange/);
  assert.doesNotMatch(source, /setInterval|ACTIVE_POLL_INTERVAL_MS|\b400\b/);
});

test('serializes teacher patches against the latest authoritative revision', () => {
  const updateBody = source.slice(
    source.indexOf('function update('),
    source.indexOf('async function submitIntent('),
  );

  assert.match(updateBody, /intentQueueRef\.current\s*=\s*intentQueueRef\.current\.then/);
  assert.match(updateBody, /ensureTeacherRevision\(mutationKey\)/);
  assert.match(updateBody, /applyTeacherPatchWithRecovery\([\s\S]*sessionRef\.current/);
  assert.match(updateBody, /teacherRevisionSynchronizedRef\.current/);
  assert.match(updateBody, /activeOperationKeyRef\.current\s*!==\s*mutationKey/);
});

test('keeps connection state and polling state on one authoritative update path', () => {
  assert.match(source, /connectionRef\.current\s*=\s*next;\s*setConnection\(next\)/);
  assert.equal((source.match(/\bsetConnection\(/g) ?? []).length, 1);
});

test('refreshes but does not replay a non-idempotent teacher intent after a conflict', () => {
  const intentBody = source.slice(source.indexOf('async function submitIntent('), source.indexOf('return [session'));
  assert.match(intentBody, /result\.status\s*===\s*409/);
  assert.match(intentBody, /teacherRevisionSynchronizedRef\.current\s*=\s*false/);
  assert.match(intentBody, /ensureTeacherRevision\(mutationKey\)/);
  assert.equal((intentBody.match(/transport\.submitIntent/g) ?? []).length, 1);
});

test('allows projector page controls only through the authenticated teacher intent path and projector-safe response', () => {
  const intentBody = source.slice(source.indexOf('async function submitIntent('), source.indexOf('return [session'));
  assert.match(source, /allowProjectorControls\?: boolean/);
  assert.match(intentBody, /options\.role === 'projector'\s*&&\s*options\.allowProjectorControls/);
  assert.match(intentBody, /transport\.submitIntent\([\s\S]*options\.role === 'projector' \? 'projector' : undefined/);
  assert.match(intentBody, /notifyPeers\('teacher'/);
});
