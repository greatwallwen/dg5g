import assert from 'node:assert/strict';
import test from 'node:test';
import type { AppDatabase } from './db/database.ts';

const { createTestDatabase } = await import('./db/test-database.ts');
const { migrateDatabase } = await import('./db/migrations.ts');
const { seedDemo } = await import('./db/demo-seed.ts');
const { closeDatabase } = await import('./db/database.ts');
const { AuthService } = await import('./auth/auth-service.ts');
const { AUTH_COOKIE_NAME } = await import('./auth/cookie.ts');
const participationRoute = await import('../app/api/class-sessions/[sessionId]/participation/route.ts');

test('participation API is student-cookie scoped and GET never joins implicitly', async () => {
  await withFixture(async ({ database, studentCookie, teacherCookie }) => {
    const anonymous = await participationRoute.GET(request('GET'), context());
    const teacher = await participationRoute.GET(request('GET', teacherCookie), context());
    const student = await participationRoute.GET(request('GET', studentCookie), context());

    assert.equal(anonymous.status, 401);
    assert.equal(teacher.status, 403);
    assert.equal(student.status, 200);
    assert.deepEqual(await student.json(), {
      participation: null,
      joinedCount: 0,
      followingCount: 0,
    });
    assert.equal(database.prepare(`SELECT COUNT(*) FROM classroom_participation`).pluck().get(), 0);
  });
});

test('join, independent mode, and leave persist for the Cookie actor only', async () => {
  await withFixture(async ({ database, studentCookie }) => {
    database.prepare(`UPDATE classroom_sessions SET status = 'active' WHERE session_id = 'demo-class'`).run();

    const join = await participationRoute.PUT(request('PUT', studentCookie, undefined, '?studentId=stu-02'), context());
    assert.equal(join.status, 200);
    const joined = (await join.json()).participation;
    assert.equal(joined.sessionId, 'demo-class');
    assert.equal(joined.studentId, 'stu-01');
    assert.equal(joined.state, 'joined');
    assert.equal(joined.mode, 'follow');
    assert.match(joined.joinedAt, /^\d{4}-\d\d-/);

    const self = await participationRoute.PATCH(request('PATCH', studentCookie, { mode: 'self' }), context());
    assert.equal(self.status, 200);
    assert.equal((await self.json()).participation.mode, 'self');

    closeDatabase();
    const refreshed = await participationRoute.GET(request('GET', studentCookie), context());
    const refreshedBody = await refreshed.json();
    assert.equal(refreshedBody.participation.studentId, 'stu-01');
    assert.equal(refreshedBody.participation.mode, 'self');
    assert.equal(refreshedBody.joinedCount, 1);
    assert.equal(refreshedBody.followingCount, 0);

    const repeatedJoin = await participationRoute.PUT(request('PUT', studentCookie), context());
    assert.equal((await repeatedJoin.json()).participation.mode, 'self');
    assert.equal(database.prepare(`SELECT COUNT(*) FROM classroom_participation WHERE student_id = 'stu-02'`).pluck().get(), 0);

    const leave = await participationRoute.DELETE(request('DELETE', studentCookie), context());
    assert.equal((await leave.json()).participation.state, 'left');
    const repeatedLeave = await participationRoute.DELETE(request('DELETE', studentCookie), context());
    assert.equal((await repeatedLeave.json()).participation.state, 'left');
    assert.equal((await (await participationRoute.GET(request('GET', studentCookie), context())).json()).joinedCount, 0);
  });
});

test('participation API rejects inactive, unknown, non-member, and authority-bearing bodies', async () => {
  await withFixture(async ({ database, studentCookie }) => {
    assert.equal((await participationRoute.PUT(request('PUT', studentCookie), context())).status, 409);
    assert.equal((await participationRoute.GET(request('GET', studentCookie), { params: { sessionId: 'missing' } })).status, 404);

    database.prepare(`UPDATE classroom_sessions SET status = 'active' WHERE session_id = 'demo-class'`).run();
    database.prepare(`
      INSERT INTO classroom_sessions (
        session_id, class_id, name, teacher_id, status, active_node_id, active_unit_id, state_json
      )
      SELECT 'same-class-without-student', class_id, 'Other lesson', teacher_id,
        'active', active_node_id, active_unit_id, state_json
      FROM classroom_sessions WHERE session_id = 'demo-class'
    `).run();
    assert.equal((await participationRoute.GET(
      request('GET', studentCookie),
      context('same-class-without-student'),
    )).status, 403);

    const forgedJoin = await participationRoute.PUT(request('PUT', studentCookie, { studentId: 'stu-02' }), context());
    const forgedMode = await participationRoute.PATCH(request('PATCH', studentCookie, { mode: 'self', studentId: 'stu-02' }), context());
    assert.equal(forgedJoin.status, 400);
    assert.equal(forgedMode.status, 400);
    assert.equal(database.prepare(`SELECT COUNT(*) FROM classroom_participation`).pluck().get(), 0);
  });
});

async function withFixture(run: (fixture: {
  database: AppDatabase;
  studentCookie: string;
  teacherCookie: string;
}) => Promise<void>): Promise<void> {
  const fixture = createTestDatabase();
  const previousPath = process.env.DGBOOK_SQLITE_PATH;
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    process.env.DGBOOK_SQLITE_PATH = fixture.databasePath;
    closeDatabase();
    const auth = new AuthService(fixture.database);
    const student = auth.login({ username: 'student01', password: '123456' });
    const teacher = auth.login({ username: 'teacher01', password: '123456' });
    assert.ok(student);
    assert.ok(teacher);
    await run({
      database: fixture.database,
      studentCookie: `${AUTH_COOKIE_NAME}=${student.token}`,
      teacherCookie: `${AUTH_COOKIE_NAME}=${teacher.token}`,
    });
  } finally {
    closeDatabase();
    if (previousPath === undefined) delete process.env.DGBOOK_SQLITE_PATH;
    else process.env.DGBOOK_SQLITE_PATH = previousPath;
    fixture.cleanup();
  }
}

function request(method: string, cookie?: string, body?: unknown, query = ''): Request {
  return new Request(`http://localhost/api/class-sessions/demo-class/participation${query}`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function context(sessionId = 'demo-class') {
  return { params: { sessionId } };
}
