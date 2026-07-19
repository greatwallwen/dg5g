import assert from 'node:assert/strict';
import test from 'node:test';
import type { AppDatabase } from './db/database.ts';

const { createTestDatabase } = await import('./db/test-database.ts');
const { migrateDatabase } = await import('./db/migrations.ts');
const { seedDemo } = await import('./db/demo-seed.ts');
const { closeDatabase } = await import('./db/database.ts');
const { AuthService } = await import('./auth/auth-service.ts');
const { AUTH_COOKIE_NAME } = await import('./auth/cookie.ts');
const cursorRoute = await import('../app/api/self-study/cursors/[nodeId]/route.ts');

test('cursor API requires a student Cookie and returns the actor own seeded cursor', async () => {
  await withFixture(async ({ studentCookie, teacherCookie }) => {
    assert.equal((await cursorRoute.GET(request('GET'), context())).status, 401);
    assert.equal((await cursorRoute.GET(request('GET', teacherCookie), context())).status, 403);

    const response = await cursorRoute.GET(request('GET', studentCookie), context());
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.cursor.studentId, 'stu-01');
    assert.equal(body.cursor.nodeId, 'P1T1-N01');
    assert.equal(body.cursor.unitId, 'P01-ku-01');
  });
});

test('cursor PUT persists a complete per-node cursor and ignores query identity spoofing', async () => {
  await withFixture(async ({ database, studentCookie }) => {
    const response = await cursorRoute.PUT(request('PUT', studentCookie, {
      unitId: 'P01-ku-01',
      actionId: 'problem',
      actionIndex: 0,
      positionMs: 4_200,
    }, '?studentId=stu-02'), context());
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).cursor, {
      studentId: 'stu-01',
      nodeId: 'P1T1-N01',
      unitId: 'P01-ku-01',
      actionId: 'problem',
      actionIndex: 0,
      positionMs: 4_200,
    });

    closeDatabase();
    const refreshed = await cursorRoute.GET(request('GET', studentCookie), context());
    assert.equal((await refreshed.json()).cursor.positionMs, 4_200);
    assert.equal(database.prepare(`
      SELECT position_ms FROM self_study_cursors
      WHERE student_id = 'stu-02' AND node_id = 'P1T1-N01'
    `).pluck().get(), undefined);
  });
});

test('cursor PUT rejects a delayed older mutation instead of overwriting the latest section', async () => {
  await withFixture(async ({ studentCookie }) => {
    const base = Date.now();
    const future = await cursorRoute.PUT(request('PUT', studentCookie, {
      unitId: 'P01-ku-01', actionId: 'output', actionIndex: 5, positionMs: 0,
      mutationAt: new Date(base + 24 * 60 * 60 * 1_000).toISOString(),
    }), context());
    assert.equal(future.status, 400);
    const newest = await cursorRoute.PUT(request('PUT', studentCookie, {
      unitId: 'P01-ku-01', actionId: 'output', actionIndex: 5, positionMs: 0,
      mutationAt: new Date(base + 1_000).toISOString(),
    }), context());
    assert.equal(newest.status, 200);

    const delayed = await cursorRoute.PUT(request('PUT', studentCookie, {
      unitId: 'P01-ku-01', actionId: 'problem', actionIndex: 0, positionMs: 0,
      mutationAt: new Date(base).toISOString(),
    }), context());
    assert.equal(delayed.status, 200);
    assert.equal((await delayed.json()).cursor.actionId, 'output');

    const current = await cursorRoute.GET(request('GET', studentCookie), context());
    assert.equal((await current.json()).cursor.actionId, 'output');
  });
});

test('an authorised node without a saved cursor returns an empty 200 projection', async () => {
  await withFixture(async ({ database, studentCookie }) => {
    database.prepare(`
      DELETE FROM self_study_cursors
      WHERE student_id = 'stu-01' AND node_id = 'P1T1-N01'
    `).run();

    const response = await cursorRoute.GET(request('GET', studentCookie), context());
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { cursor: null });
  });
});

test('cursor route rejects authority fields, foreign content, and malformed positions without mutation', async () => {
  await withFixture(async ({ database, studentCookie }) => {
    const before = database.prepare(`
      SELECT unit_id AS unitId, action_id AS actionId, action_index AS actionIndex, position_ms AS positionMs
      FROM self_study_cursors WHERE student_id = 'stu-01' AND node_id = 'P1T1-N01'
    `).get();
    const invalidBodies = [
      { studentId: 'stu-02', actionIndex: 0, positionMs: 0 },
      { unitId: 'P02-ku-02', actionIndex: 0, positionMs: 0 },
      { actionId: 'P1T2-N02-lesson-case', actionIndex: 0, positionMs: 0 },
      { actionIndex: -1, positionMs: 0 },
      { actionIndex: 0.5, positionMs: 0 },
      { actionIndex: 0, positionMs: -1 },
      { actionIndex: 0, positionMs: 0, mutationAt: 'not-a-date' },
    ];
    for (const body of invalidBodies) {
      const response = await cursorRoute.PUT(request('PUT', studentCookie, body), context());
      assert.equal(response.status, 400);
    }
    assert.deepEqual(database.prepare(`
      SELECT unit_id AS unitId, action_id AS actionId, action_index AS actionIndex, position_ms AS positionMs
      FROM self_study_cursors WHERE student_id = 'stu-01' AND node_id = 'P1T1-N01'
    `).get(), before);
  });
});

test('cursor GET and PUT share the learning node publication and prerequisite gate', async () => {
  await withFixture(async ({ studentCookie }) => {
    const cases = [
      ['P1T1-N04', 403, 'locked'],
      ['P4T2-N04', 409, 'not-open'],
      ['does-not-exist', 404, 'not-found'],
    ] as const;
    for (const [nodeId, status, routeState] of cases) {
      const getResponse = await cursorRoute.GET(request('GET', studentCookie, undefined, '', nodeId), context(nodeId));
      const putResponse = await cursorRoute.PUT(request('PUT', studentCookie, {
        actionIndex: 0,
        positionMs: 0,
      }, '', nodeId), context(nodeId));
      assert.equal(getResponse.status, status);
      assert.equal(putResponse.status, status);
      assert.equal((await getResponse.json()).routeState, routeState);
      assert.equal((await putResponse.json()).routeState, routeState);
    }
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

function request(method: string, cookie?: string, body?: unknown, query = '', nodeId = 'P1T1-N01'): Request {
  return new Request(`http://localhost/api/self-study/cursors/${nodeId}${query}`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function context(nodeId = 'P1T1-N01') {
  return { params: { nodeId } };
}
