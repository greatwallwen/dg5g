import assert from 'node:assert/strict';
import test, { after } from 'node:test';

const { createTestDatabase } = await import('./db/test-database.ts');
const { migrateDatabase } = await import('./db/migrations.ts');
const { seedDemo } = await import('./db/demo-seed.ts');
const { closeDatabase } = await import('./db/database.ts');
const { AuthService } = await import('./auth/auth-service.ts');
const { AUTH_COOKIE_NAME } = await import('./auth/cookie.ts');

const fixture = createTestDatabase();
migrateDatabase(fixture.database);
seedDemo(fixture.database);
process.env.DGBOOK_SQLITE_PATH = fixture.databasePath;
const auth = new AuthService(fixture.database);
const teacherCookie = loginCookie('teacher01');
const studentCookie = loginCookie('student01');

after(() => {
  closeDatabase();
  delete process.env.DGBOOK_SQLITE_PATH;
  fixture.cleanup();
});

test('POST lesson commits P1T1-N02 before returning the active teacher session', async () => {
  const sessionId = seedSession('start-lesson-success');
  const route = await lessonRoute();

  const response = await route.POST(
    postRequest(sessionId, { nodeId: 'P1T1-N02', expectedRevision: 0 }, teacherCookie),
    { params: { sessionId } },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(body.session.sessionStatus, 'active');
  assert.equal(body.session.activeNodeId, 'P1T1-N02');
  assert.equal(body.session.activeUnitId, 'P01-ku-02');
  assert.equal(body.session.studentSyncState, 'idle');
  assert.equal(body.command.revision, 1);
  assert.deepEqual(fixture.database.prepare(`
    SELECT status, active_node_id AS activeNodeId, active_unit_id AS activeUnitId, revision
    FROM classroom_sessions WHERE session_id = ?
  `).get(sessionId), {
    status: 'active',
    activeNodeId: 'P1T1-N02',
    activeUnitId: 'P01-ku-02',
    revision: 1,
  });
});

test('POST lesson returns 400 for an unknown node and leaves the session unchanged', async () => {
  const sessionId = seedSession('start-lesson-unknown');
  const route = await lessonRoute();

  const response = await route.POST(
    postRequest(sessionId, { nodeId: 'P9T9-N99', expectedRevision: 0 }, teacherCookie),
    { params: { sessionId } },
  );

  assert.equal(response.status, 400);
  assert.deepEqual(fixture.database.prepare(`
    SELECT status, active_node_id AS activeNodeId, revision
    FROM classroom_sessions WHERE session_id = ?
  `).get(sessionId), {
    status: 'paused',
    activeNodeId: 'P1T1-N02',
    revision: 0,
  });
  assert.equal(commandCount(sessionId), 0);
});

test('POST lesson rejects non-number revisions without mutating the classroom', async () => {
  const route = await lessonRoute();
  const invalidRevisions: Array<[string, unknown]> = [
    ['null', null],
    ['empty', ''],
    ['string', '0'],
  ];

  for (const [label, expectedRevision] of invalidRevisions) {
    const sessionId = seedSession(`start-lesson-invalid-${label}`);
    const response = await route.POST(
      postRequest(sessionId, { nodeId: 'P1T1-N02', expectedRevision }, teacherCookie),
      { params: { sessionId } },
    );

    assert.equal(response.status, 400, label);
    assert.equal(fixture.database.prepare(`
      SELECT revision FROM classroom_sessions WHERE session_id = ?
    `).pluck().get(sessionId), 0, label);
    assert.equal(commandCount(sessionId), 0, label);
  }
});

test('POST lesson returns 403 for a student and does not create a classroom command', async () => {
  const sessionId = seedSession('start-lesson-student');
  const route = await lessonRoute();

  const response = await route.POST(
    postRequest(sessionId, { nodeId: 'P1T1-N02', expectedRevision: 0 }, studentCookie),
    { params: { sessionId } },
  );

  assert.equal(response.status, 403);
  assert.equal(fixture.database.prepare(`
    SELECT revision FROM classroom_sessions WHERE session_id = ?
  `).pluck().get(sessionId), 0);
  assert.equal(commandCount(sessionId), 0);
});

test('POST lesson returns 409 with currentRevision for a stale teacher command', async () => {
  const sessionId = seedSession('start-lesson-stale');
  const route = await lessonRoute();
  const first = await route.POST(
    postRequest(sessionId, { nodeId: 'P1T1-N03', expectedRevision: 0 }, teacherCookie),
    { params: { sessionId } },
  );
  assert.equal(first.status, 200);

  const stale = await route.POST(
    postRequest(sessionId, { nodeId: 'P1T1-N02', expectedRevision: 0 }, teacherCookie),
    { params: { sessionId } },
  );
  const body = await stale.json();

  assert.equal(stale.status, 409);
  assert.equal(body.currentRevision, 1);
  assert.deepEqual(fixture.database.prepare(`
    SELECT active_node_id AS activeNodeId, active_unit_id AS activeUnitId, revision
    FROM classroom_sessions WHERE session_id = ?
  `).get(sessionId), {
    activeNodeId: 'P1T1-N03',
    activeUnitId: 'P01-ku-03',
    revision: 1,
  });
  assert.equal(commandCount(sessionId), 1);
});

async function lessonRoute() {
  try {
    return await import('../app/api/class-sessions/[sessionId]/lesson/route.ts');
  } catch (error) {
    assert.fail(`start-lesson POST route is not implemented: ${String(error)}`);
  }
}

function loginCookie(username: string): string {
  const result = auth.login({ username, password: '123456' });
  assert.ok(result);
  return `${AUTH_COOKIE_NAME}=${result.token}`;
}

function postRequest(sessionId: string, body: unknown, cookie: string): Request {
  return new Request(`http://localhost/api/class-sessions/${sessionId}/lesson`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
}

function seedSession(sessionId: string): string {
  fixture.database.transaction(() => {
    fixture.database.prepare(`
      INSERT INTO classroom_sessions (
        session_id, class_id, name, teacher_id, status, active_node_id,
        active_unit_id, revision, state_json
      )
      SELECT ?, class_id, ?, teacher_id, 'paused', 'P1T1-N02',
        'P01-ku-02', 0, '{}'
      FROM classroom_sessions WHERE session_id = 'demo-class'
    `).run(sessionId, `Test ${sessionId}`);
    fixture.database.prepare(`
      INSERT INTO classroom_members (session_id, student_id)
      SELECT ?, student_id FROM classroom_members WHERE session_id = 'demo-class'
    `).run(sessionId);
  })();
  return sessionId;
}

function commandCount(sessionId: string): number {
  return Number(fixture.database.prepare(`
    SELECT COUNT(*) FROM classroom_commands WHERE session_id = ?
  `).pluck().get(sessionId));
}
