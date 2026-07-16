import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const runtime = await source('audit-web-runtime.mjs');
const digitalTextbook = await source('audit-digital-textbook-v3.mjs');
const structure = await source('check-web-structure.mjs');
const runner = await source('run-web-runtime-audits.mjs');
const consistency = await source('audit-p1-three-terminal-consistency.mjs');
const portfolio = await source('audit-p1-output-portfolio.mjs');

test('runtime audit uses the authoritative four-audience snapshot and real demo-class routes', () => {
  for (const audience of ['student', 'teacher', 'projector', 'graph']) {
    assert.ok(runtime.includes(`, '${audience}')`), `missing ${audience} snapshot read`);
  }
  assert.ok(runtime.includes('/api/snapshot?audience=${audience}&sessionId=demo-class'));
  for (const route of ['/teacher/sessions/demo-class', '/present/demo-class', '/classroom/demo-class']) {
    assert.ok(runtime.includes(route), `missing ${route}`);
  }
  for (const legacy of [
    '/api/learning/me',
    '/api/learning/class/demo-class',
    '/teacher/sessions/P1T1-N02',
    '/present/P1T1-N02',
    '/classroom/P1T1-N02',
  ]) {
    assert.equal(runtime.includes(legacy), false, `legacy runtime contract remains: ${legacy}`);
  }
  for (const proof of ['assertCommonSnapshotFacts', 'assertProjectorPrivacy', 'snapshotVersion']) {
    assert.ok(runtime.includes(proof), `runtime audit omits ${proof}`);
  }
});

test('static gates require authoritative page snapshots and reject local or anonymous person aggregation', () => {
  for (const audit of [digitalTextbook, structure]) {
    for (const proof of ['AuthoritativeSnapshotReader', "read(actor, 'teacher'", "read(actor, 'projector'"]) {
      assert.ok(audit.includes(proof), `static audit omits ${proof}`);
    }
    for (const forbidden of ['anonymousProgress', 'formalTest?.participants', 'participants: studentRoster.map']) {
      assert.ok(audit.includes(forbidden), `static audit does not prohibit ${forbidden}`);
    }
  }
  assert.ok(structure.includes('runtime audit must prove the authoritative four-audience snapshot'));
  assert.equal(structure.includes('runtime audit must prove actor-scoped SQLite learning'), false);
  assert.ok(structure.includes('checkAuthoritativeDomSurfaceContract'));
  for (const attribute of [
    'data-snapshot-version',
    'data-classroom-revision',
    'data-class-size',
    'data-formal-submitted',
    'data-formal-passed',
  ]) assert.ok(structure.includes(attribute), `structure gate omits ${attribute}`);
});

test('one isolated server/reset run executes snapshot, classroom, and self-study audits', () => {
  assert.equal(count(runner, "runAudit('web-runtime'"), 1);
  assert.equal(count(runner, "runAudit('p1-three-terminal-consistency'"), 1);
  assert.equal(count(runner, "runAudit('class-session-cross-context'"), 1);
  assert.equal(count(runner, "runAudit('self-study-closure'"), 1);
  assert.ok(runner.includes("'--allow-local-mutation'"));
  assert.ok(runner.includes("'--isolated-sqlite', databasePath"));
  assert.equal(count(runner, 'db:reset:demo'), 1);
  assert.equal(count(runner, 'const server = spawn('), 1);
});

test('three-terminal audit uses a bounded stable-version handshake and API-to-DOM assertions', () => {
  for (const proof of [
    'MAX_SNAPSHOT_WINDOW_ATTEMPTS = 3',
    'captureStableSnapshotWindow',
    'teacherV1',
    'teacherV2',
    'helper.observedAt',
    'data-classroom-revision',
    'data-snapshot-version',
    'data-class-size',
    'data-formal-submitted',
    'data-formal-passed',
    '/student/home',
  ]) assert.ok(consistency.includes(proof), `consistency audit omits ${proof}`);
  assert.ok(consistency.includes("'nodeHeatmap', 'tasks'"));
  assert.ok(consistency.includes('stateCompletionPercent'));
  assert.ok(runtime.includes("'nodeHeatmap', 'tasks'"));
});

test('P1 output portfolio audit opens the real demo-class teacher session', () => {
  assert.ok(portfolio.includes('/teacher/sessions/demo-class'));
  assert.equal(portfolio.includes('/teacher/sessions/P1T1-N02'), false);
});

async function source(name) {
  return readFile(new URL(name, import.meta.url), 'utf8');
}

function count(value, snippet) {
  return value.split(snippet).length - 1;
}
