import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { after } from 'node:test';

const { createTestDatabase } = await import('./db/test-database.ts');
const { migrateDatabase } = await import('./db/migrations.ts');
const { seedBase, seedDemo } = await import('./db/demo-seed.ts');
const { closeDatabase } = await import('./db/database.ts');

const fixture = createTestDatabase();
migrateDatabase(fixture.database);
seedDemo(fixture.database);
process.env.DGBOOK_SQLITE_PATH = fixture.databasePath;

const { getClassSession } = await import('./class-session-store.ts');
const { projectClassSession } = await import('./class-session-projection.ts');

after(() => {
  closeDatabase();
  delete process.env.DGBOOK_SQLITE_PATH;
  fixture.cleanup();
});

test('loads the exact SQLite demo-class with the three configured members', () => {
  const session = getClassSession('demo-class');
  const rosterIds = session.studentRoster.map(({ studentId }) => studentId);
  const participantIds = session.formalTest?.participants.map(({ studentId }) => studentId);

  assert.deepEqual(rosterIds, ['stu-01', 'stu-02', 'stu-03']);
  assert.deepEqual(participantIds, rosterIds);
  assert.equal(new Set(participantIds).size, 3);
  assert.equal(session.activeNodeId, 'P1T1-N02');
  assert.equal(session.activeTaskId, 'P01');
});

test('fails closed for every URL-derived or unknown classroom session ID', () => {
  for (const sessionId of [
    'P1T1-N02',
    'P1T1-N02-sqlite-roster',
    'P1T2-N01-runtime-session',
    'P1T3-N02-not-open-session',
    'not-a-p1-session',
  ]) {
    assert.throws(
      () => getClassSession(sessionId),
      { name: 'ClassSessionAccessError', message: `Class session is not open: ${sessionId}` },
      sessionId,
    );
  }
});

test('role classroom pages render an explicit unavailable state instead of redirecting unknown sessions to N01', () => {
  const pageContracts = [
    {
      pagePath: '../app/classroom/[sessionId]/page.tsx',
      protectedLoad: 'loadStudentFollowPage(',
      returnHref: '/student/home',
    },
    {
      pagePath: '../app/teacher/sessions/[sessionId]/page.tsx',
      protectedLoad: 'getTeacherSession(',
      returnHref: '/teacher/workbench',
    },
    {
      pagePath: '../app/present/[sessionId]/page.tsx',
      protectedLoad: 'getProjectorState(',
      returnHref: '/teacher/workbench',
    },
  ];

  for (const { pagePath, protectedLoad, returnHref } of pageContracts) {
    const source = readFileSync(new URL(pagePath, import.meta.url), 'utf8');
    assert.match(source, /ClassSessionUnavailable/, pagePath);
    assert.match(source, new RegExp(`returnHref=["']${returnHref}["']`), pagePath);
    assert.doesNotMatch(source, /redirect\(['"]\/(?:classroom|teacher\/sessions|present)\/P1T1-N01['"]\)/, pagePath);
    assert.ok(
      source.indexOf('requireClassRole(') < source.indexOf(protectedLoad),
      `authorization must precede unknown-session disclosure: ${pagePath}`,
    );
  }
});

test('teacher and self-only student projections retain scoped detail while projector has no person-level participants', () => {
  const teacher = getClassSession('demo-class');
  const projector = projectClassSession(teacher, 'projector');
  const student = projectClassSession(teacher, 'student', 'stu-01');

  assert.equal(teacher.studentRoster.length, 3);
  assert.equal(teacher.formalTest?.participants.length, 3);
  assertProjectorHasNoPersonFields(projector);
  assert.deepEqual(student.studentRoster, []);
  assert.deepEqual(student.formalTest?.participants.map(({ studentId }) => studentId), ['stu-01']);
  assert.equal(JSON.stringify(student).includes('stu-02'), false);
  assert.equal(JSON.stringify(student).includes('stu-03'), false);
});

test('a fourth SQLite demo-class membership appears without creating a synthetic session', () => {
  fixture.database.exec(`
    INSERT INTO users (id, username, display_name, role, password_hash)
    VALUES ('stu-04', 'student04', 'Student Four', 'student', 'test-only');
    INSERT INTO classroom_members (session_id, student_id)
    VALUES ('demo-class', 'stu-04');
  `);
  try {
    const session = getClassSession('demo-class');
    assert.deepEqual(
      session.studentRoster.map(({ studentId }) => studentId),
      ['stu-01', 'stu-02', 'stu-03', 'stu-04'],
    );
    assert.deepEqual(
      session.formalTest?.participants.map(({ studentId }) => studentId),
      ['stu-01', 'stu-02', 'stu-03', 'stu-04'],
    );
    assert.equal(session.studentRoster.at(-1)?.bestGameScore, undefined);
  } finally {
    fixture.database.prepare(`DELETE FROM classroom_members WHERE student_id = 'stu-04'`).run();
    fixture.database.prepare(`DELETE FROM users WHERE id = 'stu-04'`).run();
  }
});

test('24 SQLite demo-class memberships drive teacher totals without leaking a projector roster', () => {
  const insertUser = fixture.database.prepare(`
    INSERT INTO users (id, username, display_name, role, password_hash)
    VALUES (?, ?, ?, 'student', 'test-only')
  `);
  const insertMember = fixture.database.prepare(`
    INSERT INTO classroom_members (session_id, student_id)
    VALUES ('demo-class', ?)
  `);
  fixture.database.transaction(() => {
    for (let index = 4; index <= 24; index += 1) {
      const suffix = String(index).padStart(2, '0');
      insertUser.run(`stu-${suffix}`, `student${suffix}`, `Student ${suffix}`);
      insertMember.run(`stu-${suffix}`);
    }
  })();

  try {
    const teacher = getClassSession('demo-class');
    const projector = projectClassSession(teacher, 'projector');
    const student = projectClassSession(teacher, 'student', 'stu-24');

    assert.equal(teacher.studentRoster.length, 24);
    assert.equal(teacher.formalTest?.participants.length, 24);
    assertProjectorHasNoPersonFields(projector);
    assert.deepEqual(student.studentRoster, []);
    assert.deepEqual(student.formalTest?.participants.map(({ studentId }) => studentId), ['stu-24']);
  } finally {
    fixture.database.prepare(`
      DELETE FROM classroom_members
      WHERE session_id = 'demo-class'
        AND student_id GLOB 'stu-[0-9][0-9]'
        AND student_id NOT IN ('stu-01', 'stu-02', 'stu-03')
    `).run();
    fixture.database.prepare(`
      DELETE FROM users
      WHERE id GLOB 'stu-[0-9][0-9]'
        AND id NOT IN ('stu-01', 'stu-02', 'stu-03')
    `).run();
  }
});

test('the real demo-class fails closed when it has no active student membership', () => {
  fixture.database.prepare(`DELETE FROM classroom_members WHERE session_id = 'demo-class'`).run();
  try {
    assert.throws(
      () => getClassSession('demo-class'),
      { name: 'ClassSessionRosterError', message: 'Class session has no active students: P1T1-N02' },
    );
  } finally {
    seedBase(fixture.database);
  }
});

function assertProjectorHasNoPersonFields(projector: unknown): void {
  const serialized = JSON.stringify(projector);
  for (const forbidden of [
    'studentRoster', 'studentProgress', 'studentId', 'participants', 'devicePresence',
    'commandAcks', 'displayName', 'anonymous-', 'stu-01', 'stu-02', 'stu-03',
  ]) {
    assert.equal(serialized.includes(forbidden), false, `projector leaked ${forbidden}`);
  }
}
