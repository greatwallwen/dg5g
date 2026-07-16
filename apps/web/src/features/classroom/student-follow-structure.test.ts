import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

test('student classroom runtime is exact-session and participation driven', () => {
  const page = source('../../app/classroom/[sessionId]/page.tsx');
  const loader = source('./student-follow-loader.ts');
  const client = source('./student-follow-client.tsx');
  const polling = source('./use-class-session.ts');

  assert.match(page, /loadStudentFollowPage\(getDatabase\(\), actor, params\.sessionId\)/);
  assert.doesNotMatch(page, /isActiveDemoSession|getStudentFollowState|mock-api/);

  assert.match(loader, /sessionRepository\.readSession\(sessionId\)/);
  assert.match(loader, /participationRepository\.read\(sessionId, studentId\)/);
  assert.doesNotMatch(loader, /joinClassroomParticipation|P1T1-N01/);

  assert.match(client, /createClassroomParticipationClient/);
  assert.match(client, /ClassroomStudentModeRenderer/);
  assert.doesNotMatch(client, /scene-follow-path|studentControlSource|setSelfIndex|self-study-cursor-client/);

  assert.match(polling, /createClassSessionPoller/);
  assert.match(polling, /resolvePollTier/);
  assert.doesNotMatch(polling, /setInterval|ACTIVE_POLL_INTERVAL_MS|\b400\b/);
});

test('student classroom runtime has dedicated responsive four-region styles', () => {
  const css = source('../../app/student-classroom-runtime.css');

  for (const selector of [
    '.classroom-runtime',
    '.classroom-follow-renderer',
    '.classroom-follow-current',
    '.classroom-follow-task',
    '.classroom-follow-activity',
    '.classroom-follow-return',
    '.classroom-self-status',
    '.classroom-entry-status',
    '.classroom-content-unavailable',
  ]) {
    assert.match(css, new RegExp(selector.replace('.', '\\.') + '\\b'), selector);
  }
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /min-height: 44px/);
});
