import assert from 'node:assert/strict';
import test, { after } from 'node:test';

const { createTestDatabase } = await import('./db/test-database.ts');
const { migrateDatabase } = await import('./db/migrations.ts');
const { seedDemo } = await import('./db/demo-seed.ts');
const { closeDatabase } = await import('./db/database.ts');

const fixture = createTestDatabase();
migrateDatabase(fixture.database);
seedDemo(fixture.database);
process.env.DGBOOK_SQLITE_PATH = fixture.databasePath;
closeDatabase();

const store = await import('./skill-progress-store.ts');

after(() => {
  closeDatabase();
  delete process.env.DGBOOK_SQLITE_PATH;
  fixture.cleanup();
});

test('projects seeded SQLite learning facts without a process-local event store', () => {
  const progress = store.getSkillProgressForStudent('stu-02');
  const n02 = progress.find((item) => item.nodeId === 'P1T1-N02');
  const p01 = store.getTaskMasteryForStudent('stu-02').find((item) => item.taskId === 'P01');

  assert.equal(n02?.bestGameScore, 88);
  assert.equal(n02?.formalTestPassed, true);
  assert.equal(p01?.taskScore, 89);
  assert.equal(p01?.professionalOutputScore, 90);
});

test('keeps compatibility reads fail-closed for unknown nodes', () => {
  assert.throws(
    () => store.getSkillProgress('stu-01', 'missing-node'),
    { name: 'UnknownLearningNodeError', message: 'Unknown learning node: missing-node' },
  );
});

test('exposes only stateless SQLite projections and no in-memory write/reset API', () => {
  assert.equal('appendSkillLearningEvent' in store, false);
  assert.equal('resetSkillProgressForStudent' in store, false);
  assert.equal(JSON.stringify(store).includes('__dgbookSkillEvents'), false);
});

test('projects the three-task P1 outcome from the same snapshot', () => {
  const project = store.getProjectMasteryForStudent('stu-03');

  assert.deepEqual(project.taskIds, ['P01', 'P02', 'P03']);
  assert.deepEqual(store.getTaskMasteryForStudent('stu-03').map((task) => task.taskId), ['P01', 'P02', 'P03']);
  assert.equal(project.provisionalScore, undefined);
});
