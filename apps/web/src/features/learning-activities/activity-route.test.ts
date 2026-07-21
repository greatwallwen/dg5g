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
  reasons: {
    'shared-operator-cabinet': '柜门标识属于其他运营商，不能混入本次任务台账。',
    'room-02-cabinets': '02号机房不在任务单的01号机房范围内，本次先排除。',
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
    assert.equal(database.prepare(`
      SELECT COUNT(*) FROM practice_attempts WHERE origin = 'user'
    `).pluck().get(), 0);
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
      SELECT COUNT(*) FROM practice_attempts
      WHERE student_id = 'stu-02' AND origin = 'user'
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

test('P02 and P03 activity APIs return targeted failure then persist a corrected retry', async () => {
  await withFixture(async ({ database, completeStudentCookie }) => {
    const cases = [
      {
        activityId: 'P1T2-N01-micro-01',
        attemptId: 'api-p02-retry',
        valid: '采用站点坐标统一底图，标出三个扇区方向、道路热点 H1/H2、邻区边界和本次采样范围。',
      },
      {
        activityId: 'P1T3-N01-micro-01',
        attemptId: 'api-p03-retry',
        valid: '事实：18:00-19:00在A座18层会议室使用视频会议时5次中4次卡顿；仍缺终端型号和5G模式，需要追问并按同地点同业务条件复测。',
      },
    ] as const;

    for (const [index, activity] of cases.entries()) {
      if (index === 1) insertPassedP02Activities(database);
      const failedResponse = await activityRoute.POST(jsonRequest(activity.activityId, completeStudentCookie, {
        attemptId: activity.attemptId,
        response: { fields: { response: '凭感觉判断' } },
        expectedVersion: 0,
      }), context(activity.activityId));
      assert.equal(failedResponse.status, 200);
      const failed = await failedResponse.json();
      assert.equal(failed.passed, false);
      assert.equal(failed.version, 1);
      assert.ok(failed.feedback.length > 0);
      assert.ok(failed.correctionPath.length > 0);

      const passedResponse = await activityRoute.POST(jsonRequest(activity.activityId, completeStudentCookie, {
        attemptId: activity.attemptId,
        response: { fields: { response: activity.valid } },
        expectedVersion: 1,
      }), context(activity.activityId));
      assert.equal(passedResponse.status, 200);
      const passed = await passedResponse.json();
      assert.equal(passed.passed, true);
      assert.equal(passed.version, 2);
      assert.deepEqual(database.prepare(`
        SELECT student_id AS studentId, activity_id AS activityId, passed, origin
        FROM practice_attempts WHERE attempt_id = ?
      `).get(activity.attemptId), {
        studentId: 'stu-03',
        activityId: activity.activityId,
        passed: 1,
        origin: 'user',
      });
    }
  });
});

async function withFixture(run: (fixture: {
  database: AppDatabase;
  studentCookie: string;
  completeStudentCookie: string;
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
    const completeStudent = auth.login({ username: 'student03', password });
    const teacher = auth.login({ username: 'teacher01', password });
    assert.ok(student);
    assert.ok(completeStudent);
    assert.ok(teacher);
    await run({
      database: fixture.database,
      studentCookie: `${AUTH_COOKIE_NAME}=${student.token}`,
      completeStudentCookie: `${AUTH_COOKIE_NAME}=${completeStudent.token}`,
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

function insertPassedP02Activities(database: AppDatabase): void {
  const insert = database.prepare(`
    INSERT OR IGNORE INTO practice_attempts (
      attempt_id, student_id, activity_id, node_id, passed, origin
    ) VALUES (?, 'stu-03', ?, ?, 1, 'user')
  `);
  for (const [activityId, nodeId] of [
    ['P1T2-N01-micro-01', 'P1T2-N01'],
    ['P1T2-N02-foundation-01', 'P1T2-N02'],
    ['P1T2-N02-application-01', 'P1T2-N02'],
    ['P1T2-N02-transfer-01', 'P1T2-N02'],
    ['P1T2-N03-micro-01', 'P1T2-N03'],
    ['P1T2-N04-micro-01', 'P1T2-N04'],
  ]) insert.run(`api-unlock-${activityId}`, activityId, nodeId);
}
