import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthService } from '../../platform/auth/auth-service.ts';
import { AUTH_COOKIE_NAME } from '../../platform/auth/cookie.ts';
import { closeDatabase, type AppDatabase } from '../../platform/db/database.ts';
import { seedDemo } from '../../platform/db/demo-seed.ts';
import { migrateDatabase } from '../../platform/db/migrations.ts';
import { createTestDatabase } from '../../platform/db/test-database.ts';

const activityRoute = await import('../../app/api/learning/activities/[activityId]/attempts/route.ts');

const scopeActivityId = 'P1T1-N01-micro-01';
const lockedActivityId = 'P1T1-N04-micro-01';
const scopeResponse = {
  assignments: {
    'room-01-cabinets': 'in-scope',
    'shared-operator-cabinet': 'out-of-scope',
    'room-02-cabinets': 'out-of-scope',
  },
};

test('activity attempt route enforces 401, 403, and the exact command body', async () => {
  await withFixture(async ({ database, studentCookie, teacherCookie }) => {
    const body = { attemptId: 'activity-auth', response: scopeResponse, expectedVersion: 0 };
    const anonymous = await activityRoute.POST(jsonRequest(scopeActivityId, '', body), context(scopeActivityId));
    const teacher = await activityRoute.POST(jsonRequest(scopeActivityId, teacherCookie, body), context(scopeActivityId));
    const authorityField = await activityRoute.POST(jsonRequest(scopeActivityId, studentCookie, {
      ...body,
      studentId: 'stu-02',
    }), context(scopeActivityId));
    const missingField = await activityRoute.POST(jsonRequest(scopeActivityId, studentCookie, {
      attemptId: 'activity-incomplete',
      response: scopeResponse,
    }), context(scopeActivityId));

    assert.deepEqual([anonymous.status, teacher.status, authorityField.status, missingField.status], [401, 403, 400, 400]);
    assert.equal(database.prepare('SELECT COUNT(*) FROM practice_attempts').pluck().get(), 0);
  });
});

test('activity attempt route derives actor identity and returns 409 for a stale retry', async () => {
  await withFixture(async ({ database, studentCookie }) => {
    const body = { attemptId: 'activity-versioned', response: scopeResponse, expectedVersion: 0 };
    const first = await activityRoute.POST(jsonRequest(scopeActivityId, studentCookie, body, '?studentId=stu-02'), context(scopeActivityId));
    const stale = await activityRoute.POST(jsonRequest(scopeActivityId, studentCookie, body), context(scopeActivityId));

    assert.equal(first.status, 200);
    assert.equal(stale.status, 409);
    assert.deepEqual(database.prepare(`
      SELECT student_id AS studentId, activity_id AS activityId
      FROM practice_attempts WHERE attempt_id = 'activity-versioned'
    `).get(), { studentId: 'stu-01', activityId: scopeActivityId });
    assert.equal(database.prepare(`
      SELECT COUNT(*) FROM practice_attempts WHERE student_id = 'stu-02'
    `).pluck().get(), 0);
  });
});

test('activity attempt route rejects a locked node before persistence', async () => {
  await withFixture(async ({ database, studentCookie }) => {
    const response = await activityRoute.POST(jsonRequest(lockedActivityId, studentCookie, {
      attemptId: 'activity-locked',
      response: { revisions: {} },
      expectedVersion: 0,
    }), context(lockedActivityId));

    assert.equal(response.status, 403);
    assert.equal((await response.json()).routeState, 'locked');
    assert.equal(database.prepare(`
      SELECT COUNT(*) FROM practice_attempts WHERE attempt_id = 'activity-locked'
    `).pluck().get(), 0);
  });
});

async function withFixture(run: (fixture: {
  database: AppDatabase;
  studentCookie: string;
  teacherCookie: string;
}) => Promise<void>): Promise<void> {
  const fixture = createTestDatabase();
  const previousPath = process.env.DGBOOK_SQLITE_PATH;
  const password = process.env.DGBOOK_DEMO_PASSWORD ?? '123456';
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    process.env.DGBOOK_SQLITE_PATH = fixture.databasePath;
    closeDatabase();
    const auth = new AuthService(fixture.database);
    const student = auth.login({ username: 'student01', password });
    const teacher = auth.login({ username: 'teacher01', password });
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

function jsonRequest(activityId: string, cookie: string, body: unknown, query = ''): Request {
  return new Request(`http://localhost/api/learning/activities/${activityId}/attempts${query}`, {
    method: 'POST',
    headers: {
      ...(cookie ? { cookie } : {}),
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function context(activityId: string) {
  return { params: { activityId } };
}
