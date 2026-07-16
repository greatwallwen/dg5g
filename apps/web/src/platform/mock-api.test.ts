import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test, { after } from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && context.parentURL?.includes('/apps/web/src/') && !specifier.endsWith('.ts')) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const { createTestDatabase } = await import('./db/test-database.ts');
const { migrateDatabase } = await import('./db/migrations.ts');
const { seedDemo } = await import('./db/demo-seed.ts');
const { closeDatabase } = await import('./db/database.ts');
const fixture = createTestDatabase();
migrateDatabase(fixture.database);
seedDemo(fixture.database);
process.env.DGBOOK_SQLITE_PATH = fixture.databasePath;

const { getCapabilityGraph, getProjectorState, getStudentSelfStudy, getTeacherSession } = await import('./mock-api.ts');
const { nodeLearningPolicies } = await import('./learning-policy.ts');

after(() => {
  closeDatabase();
  delete process.env.DGBOOK_SQLITE_PATH;
  fixture.cleanup();
});

test('real node loaders reject unknown focus instead of resolving it to P1T1-N01', async () => {
  await assert.rejects(
    getCapabilityGraph('does-not-exist'),
    { name: 'NodeRouteAccessError', message: 'Learning node is not accessible: does-not-exist (not-found)' },
  );
  await assert.rejects(
    getStudentSelfStudy('does-not-exist'),
    { name: 'NodeRouteAccessError', message: 'Learning node is not accessible: does-not-exist (not-found)' },
  );
});

test('real node loaders reject an explicitly not-open known policy', async () => {
  const policy = nodeLearningPolicies.find((item) => item.nodeId === 'P1T3-N01');
  assert.ok(policy);
  const originalStatus = policy.publicationStatus;
  policy.publicationStatus = 'not-open';
  try {
    await assert.rejects(
      getCapabilityGraph(policy.nodeId),
      { name: 'NodeRouteAccessError', message: `Learning node is not accessible: ${policy.nodeId} (not-open)` },
    );
    await assert.rejects(
      getStudentSelfStudy(policy.nodeId),
      { name: 'NodeRouteAccessError', message: `Learning node is not accessible: ${policy.nodeId} (not-open)` },
    );
  } finally {
    policy.publicationStatus = originalStatus;
  }
});

test('course overview keeps its intentional default focus when no node is supplied', async () => {
  const graph = await getCapabilityGraph();
  assert.ok(graph.views.length > 0);
  assert.ok(graph.views.every((view) => view.focusNodeId === 'P1T1-N01'));
});

test('teacher loader reads the exact SQLite session and resolves static teaching content from its active node', async () => {
  const data = await getTeacherSession('demo-class');

  assert.equal(data.session.sessionId, 'demo-class');
  assert.equal(data.session.activeNodeId, 'P1T1-N02');
  assert.equal(data.task.taskId, 'P1-T1');
  assert.ok(data.slides.length > 0);
  assert.ok(data.slides.every(({ nodeId }) => nodeId === 'P1T1-N02'));
  assert.equal(data.playback.sceneId, 'P1T1-N02-playback');
});

test('teacher and projector loaders reject legacy node-shaped IDs instead of falling back', async () => {
  await assert.rejects(
    getTeacherSession('P1T1-N02'),
    { name: 'ClassSessionAccessError', message: 'Class session is not open: P1T1-N02' },
  );
  await assert.rejects(
    getProjectorState('P1T1-N02'),
    { name: 'ClassSessionAccessError', message: 'Class session is not open: P1T1-N02' },
  );
});

test('initial projector loader returns no per-student arrays or identifiers', async () => {
  const data = await getProjectorState('demo-class');
  const serialized = JSON.stringify(data);

  for (const key of ['studentRoster', 'studentProgress', 'formalTest', 'devicePresence', 'commandAcks']) {
    assert.equal(key in data.session, false, `projector session leaked ${key}`);
  }
  assert.equal('submissionAnswers' in data.session, false);
  assert.equal('selfStudyAnswers' in data.session, false);
  assert.ok(data.slides.every((slide) => slide.focus === '' && slide.script.length === 0 && slide.questions.length === 0));
  for (const forbidden of ['studentId', 'displayName', 'participants', 'anonymous-', 'stu-01', 'stu-02', 'stu-03']) {
    assert.equal(serialized.includes(forbidden), false, `projector loader leaked ${forbidden}`);
  }
});

test('projector loader reuses the authoritative projector projection', () => {
  const source = readFileSync(new URL('./mock-api.ts', import.meta.url), 'utf8');
  assert.match(source, /session:\s*projectClassSession\(teacher\.session, ['"]projector['"]\)/);
});
