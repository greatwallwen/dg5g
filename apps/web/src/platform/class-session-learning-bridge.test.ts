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

test('scopes legacy assessment participants to the exact assessment and fails closed for an unproven run', () => {
  insertFormalAttempt({
    attemptId: 'bridge-prior-attempt',
    assessmentId: 'bridge-prior-assessment',
    score: 73,
    completedAt: '2026-07-15T08:00:00.000Z',
  });
  const session = getClassSession('demo-class');
  assert.ok(session.formalTest);
  const legacyFormalTest = {
    ...session.formalTest,
    assessmentId: 'bridge-current-assessment',
    participants: session.formalTest.participants.map((participant) => ({
      ...participant,
      state: 'waiting' as const,
    })),
  };

  const historicalOnly = hydrateClassSessionLearning({ ...session, formalTest: legacyFormalTest });
  const historicalParticipant = historicalOnly.formalTest?.participants.find(({ studentId }) => studentId === 'stu-01');
  const historicalRosterStudent = historicalOnly.studentRoster.find(({ studentId }) => studentId === 'stu-01');
  assert.equal(historicalParticipant?.state, 'waiting');
  assert.equal(historicalParticipant?.score, undefined);
  assert.equal(historicalRosterStudent?.latestGameScore, 73, 'the generic roster keeps truthful user history');

  insertFormalAttempt({
    attemptId: 'bridge-current-attempt',
    assessmentId: 'bridge-current-assessment',
    score: 91,
    completedAt: '2026-07-16T08:00:00.000Z',
  });
  const exactAssessment = hydrateClassSessionLearning({ ...session, formalTest: legacyFormalTest });
  const exactParticipant = exactAssessment.formalTest?.participants.find(({ studentId }) => studentId === 'stu-01');
  assert.equal(exactParticipant?.state, 'submitted');
  assert.equal(exactParticipant?.score, 91);

  const unprovenRun = hydrateClassSessionLearning({
    ...session,
    formalTest: { ...legacyFormalTest, runId: 'classroom-run-unproven' },
  });
  const unprovenParticipant = unprovenRun.formalTest?.participants.find(({ studentId }) => studentId === 'stu-01');
  assert.equal(unprovenParticipant?.state, 'waiting');
  assert.equal(unprovenParticipant?.score, undefined);
});

test('does not expose a process-local event store in the bridge implementation', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('./class-session-learning-bridge.ts', import.meta.url), 'utf8'));
  assert.doesNotMatch(source, /__dgbookSkillEvents|appendSkillLearningEvent|resetSkillProgressForStudent/);
});

function insertFormalAttempt(input: {
  attemptId: string;
  assessmentId: string;
  score: number;
  completedAt: string;
}): void {
  fixture.database.prepare(`
    INSERT INTO formal_assessment_instances (
      assessment_id, node_id, game_id, question_version, status, opened_at, closed_at
    ) VALUES (?, 'P1T1-N02', 'P1T1-N02-server-assessment', 'p01-n02-v1', 'closed', ?, ?)
  `).run(input.assessmentId, input.completedAt, input.completedAt);
  fixture.database.prepare(`
    INSERT INTO formal_attempts (
      attempt_id, student_id, node_id, assessment_id, game_id, score,
      duration_seconds, mistake_knowledge_point_ids_json, question_version,
      answers_json, diagnostics_json, completed_at, origin
    ) VALUES (
      ?, 'stu-01', 'P1T1-N02', ?, 'P1T1-N02-server-assessment', ?,
      180, '[]', 'p01-n02-v1', '{}', '{}', ?, 'user'
    )
  `).run(input.attemptId, input.assessmentId, input.score, input.completedAt);
}
