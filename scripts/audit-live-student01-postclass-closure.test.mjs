import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('./audit-live-student01-postclass-closure.mjs', import.meta.url), 'utf8');

test('post-class closure is UI-driven and requires explicit remote mutation authority', () => {
  assert.match(source, /--allow-remote-mutation/);
  assert.match(source, /remote post-class mutation requires the explicit/);
  for (const forbidden of ['context.request', 'requestJson', 'fetch(', '/api/']) {
    assert.doesNotMatch(source, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('only student01 forms real state while student02 and student03 remain previews', () => {
  assert.match(source, /actor: 'student01'/);
  assert.match(source, /untouchedPreviewActors: \['student02', 'student03'\]/);
  assert.match(source, /student02: \{[\s\S]*displayName: '学生二'[\s\S]*P01: 'returned'/);
  assert.match(source, /student03: \{[\s\S]*displayName: '学生三'[\s\S]*P01: 'verified'[\s\S]*P02: 'verified'[\s\S]*P03: 'verified'/);
  assert.match(source, /loginActor\(browserInstance, username/);
  assert.match(source, /\[data-account-menu="student"\] \.account-menu-identity/);
  assert.match(source, /\[data-student-home-recommendations\] a\[href="\/student\/projects\/p1"\]/);
  assert.match(source, /\[data-p1-output-status="\$\{status\}"\]/);
  assert.match(source, /\[data-p1-portfolio-status="demo-complete"\]/);
  assert.doesNotMatch(source, /assert\.match\(await home\.innerText\(\), \/演示数据\/\)/);
});

test('closure proves formal assessment, output revision, teacher verification, and projections', () => {
  for (const evidence of [
    'data-assessment-result="passed"',
    'candidate-a', 'far-end-label-mismatch', 'PWR-DC-17',
    'data-evidence-gap', 'evidenceGapFields: 1',
    'data-output-workflow', 'returned', 'resubmitted', 'verified',
    'data-portfolio-delivery', 'verified-deliverable',
    'data-graph-node-id="P1T1-N04"',
  ]) assert.match(source, new RegExp(String(evidence).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('verified state is preserved by default and reset only with an explicit flag', () => {
  assert.match(source, /const resetAfter = process\.argv\.includes\('--reset-after'\)/);
  assert.match(source, /cleanup: resetAfter \? 'pending' : 'preserve verified student01 state'/);
});
