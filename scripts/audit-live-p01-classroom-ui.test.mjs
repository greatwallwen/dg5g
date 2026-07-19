import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('./audit-live-p01-classroom-ui.mjs', import.meta.url), 'utf8');

test('live classroom acceptance is UI-driven and requires explicit remote mutation authority', () => {
  assert.match(source, /--allow-remote-mutation/);
  assert.match(source, /remote classroom mutation requires the explicit/);
  for (const forbidden of ['context.request', 'requestJson', 'fetch(', '/api/']) {
    assert.doesNotMatch(source, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('live classroom acceptance keeps exactly three students and the strict two-second sync gate', () => {
  assert.match(source, /\['student01', 'student02', 'student03'\]/);
  assert.match(source, /teacherSyncMs <= 2_000/);
  assert.match(source, /threeStudentEntryMs <= 120_000/);
  assert.match(source, /data-start-lesson-node="P1T1-N01"/);
  assert.match(source, /P1T1-N01-micro-01/);
});

test('live classroom acceptance resets the online demo in finally', () => {
  assert.match(source, /finally \{[\s\S]*resetDemoFromWorkbench\(teacherPage\)/);
  assert.match(source, /cleanup = 'online demo reset to clean preparing state'/);
});
