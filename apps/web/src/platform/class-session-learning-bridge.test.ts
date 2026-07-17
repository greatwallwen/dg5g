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

const { getClassSession } = await import('./class-session-store.ts');
const { hydrateClassSessionLearning } = await import('./class-session-learning-bridge.ts');

after(() => {
  closeDatabase();
  delete process.env.DGBOOK_SQLITE_PATH;
  fixture.cleanup();
});

test('does not expose origin-less demo scores in the live roster or assessment participants', () => {
  const session = getClassSession('demo-class');
  const hydrated = hydrateClassSessionLearning(session);
  const student = hydrated.studentRoster.find((item) => item.studentId === 'stu-02');
  const participant = hydrated.formalTest?.participants.find((item) => item.studentId === 'stu-02');

  assert.equal(student?.activeNodeId, 'P1T1-N02');
  assert.equal(student?.firstGameScore, undefined);
  assert.equal(student?.bestGameScore, undefined);
  assert.equal(student?.latestGameScore, undefined);
  assert.equal(student?.attemptCount, 0);
  assert.equal(participant?.state, 'waiting');
  assert.equal(participant?.score, undefined);
});

test('hydrates a selected student with the same projection as its roster row', () => {
  const session = getClassSession('demo-class');
  const selected = session.studentRoster.find((student) => student.studentId === 'stu-02');
  assert.ok(selected);

  const hydrated = hydrateClassSessionLearning({ ...session, studentProgress: selected });
  const rosterStudent = hydrated.studentRoster.find((student) => student.studentId === 'stu-02');

  assert.deepEqual(hydrated.studentProgress, rosterStudent);
  assert.equal(hydrated.studentProgress?.latestGameScore, undefined);
});

test('does not expose a process-local event store in the bridge implementation', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('./class-session-learning-bridge.ts', import.meta.url), 'utf8'));
  assert.doesNotMatch(source, /__dgbookSkillEvents|appendSkillLearningEvent|resetSkillProgressForStudent/);
});
