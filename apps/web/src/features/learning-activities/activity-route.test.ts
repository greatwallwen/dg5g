import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthService } from '../../platform/auth/auth-service.ts';
import { AUTH_COOKIE_NAME } from '../../platform/auth/cookie.ts';
import { closeDatabase, type AppDatabase } from '../../platform/db/database.ts';
import { seedDemo } from '../../platform/db/demo-seed.ts';
import { migrateDatabase } from '../../platform/db/migrations.ts';
import { createTestDatabase } from '../../platform/db/test-database.ts';
import { seedUserTaskAdvancementFacts } from '../../platform/professional-output-policy-test-support.ts';

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
    const body = { attemptId: 'activity-auth', response: scopeResponse, delivery: { channel: 'self-study' } };
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

test('activity attempt route derives actor identity and replays the complete original envelope', async () => {
  await withFixture(async ({ database, studentCookie }) => {
    const body = { attemptId: 'activity-versioned', response: scopeResponse, delivery: { channel: 'self-study' } };
    const first = await activityRoute.POST(jsonRequest(scopeActivityId, studentCookie, body, '?studentId=stu-02'), context(scopeActivityId));
    const replay = await activityRoute.POST(jsonRequest(scopeActivityId, studentCookie, body), context(scopeActivityId));

    assert.equal(first.status, 200);
    assert.equal(replay.status, 200);
    assert.deepEqual(await replay.json(), await first.json());
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
      delivery: { channel: 'self-study' },
    }), context(lockedActivityId));

    assert.equal(response.status, 403);
    assert.equal((await response.json()).routeState, 'locked');
    assert.equal(database.prepare(`
      SELECT COUNT(*) FROM practice_attempts WHERE attempt_id = 'activity-locked'
    `).pluck().get(), 0);
  });
});

test('activity attempt route conflicts when an immutable attempt id is reused with changed facts', async () => {
  await withFixture(async ({ database, studentCookie }) => {
    const original = {
      attemptId: 'activity-conflict',
      response: scopeResponse,
      delivery: { channel: 'self-study' },
    };
    const first = await activityRoute.POST(jsonRequest(scopeActivityId, studentCookie, original), context(scopeActivityId));
    const changedResponse = await activityRoute.POST(jsonRequest(scopeActivityId, studentCookie, {
      ...original,
      response: { assignments: {} },
    }), context(scopeActivityId));
    const changedDelivery = await activityRoute.POST(jsonRequest(scopeActivityId, studentCookie, {
      ...original,
      delivery: { channel: 'classroom', sessionId: 'demo-class', classroomRunId: 'run-missing' },
    }), context(scopeActivityId));

    assert.equal(first.status, 200);
    assert.equal(changedResponse.status, 409);
    assert.equal(changedDelivery.status, 409);
    assert.equal(database.prepare(`
      SELECT COUNT(*) FROM practice_attempts WHERE attempt_id = 'activity-conflict'
    `).pluck().get(), 1);
  });
});

test('activity progress GET returns only the cookie actor immutable history', async () => {
  await withFixture(async ({ studentCookie }) => {
    for (const [attemptId, response] of [
      ['progress-wrong', { assignments: {} }],
      ['progress-correct', scopeResponse],
    ] as const) {
      const posted = await activityRoute.POST(jsonRequest(scopeActivityId, studentCookie, {
        attemptId,
        response,
        delivery: { channel: 'self-study' },
      }), context(scopeActivityId));
      assert.equal(posted.status, 200);
    }

    const response = await activityRoute.GET(
      new Request(`http://localhost/api/learning/activities/${scopeActivityId}/attempts`, {
        headers: { cookie: studentCookie },
      }),
      context(scopeActivityId),
    );
    assert.equal(response.status, 200);
    const progress = await response.json();
    assert.equal(progress.canonicalActivityId, scopeActivityId);
    assert.equal(progress.passed, true);
    assert.equal(progress.attemptCount, 2);
    assert.equal(progress.lastAttempt?.attemptId, 'progress-correct');
    assert.equal(progress.lastAttempt?.attemptNumber, 2);
    assert.equal(progress.lastAttempt?.passed, true);
    assert.deepEqual(progress.lastAttempt?.delivery, { channel: 'self-study' });
  });
});

test('classroom activity submission requires joined membership and the active lesson cursor', async () => {
  await withFixture(async ({ database, studentCookie }) => {
    const body = {
      attemptId: 'classroom-authority',
      response: scopeResponse,
      delivery: { channel: 'classroom', sessionId: 'demo-class', classroomRunId: 'lesson-run-001' },
    };
    activateClassroomActivity(database, scopeActivityId);
    const notJoined = await activityRoute.POST(jsonRequest(scopeActivityId, studentCookie, body), context(scopeActivityId));
    assert.equal(notJoined.status, 403);

    database.prepare(`
      INSERT INTO classroom_participation (session_id, student_id, state, mode, joined_at)
      VALUES ('demo-class', 'stu-01', 'joined', 'follow', CURRENT_TIMESTAMP)
    `).run();
    database.prepare(`
      UPDATE classroom_lesson_runs
      SET teaching_cursor_json = json_object('canonicalActivityId', 'wrong-activity')
      WHERE lesson_run_id = 'lesson-run-001'
    `).run();
    const wrongCursor = await activityRoute.POST(jsonRequest(scopeActivityId, studentCookie, body), context(scopeActivityId));
    assert.equal(wrongCursor.status, 409);

    database.prepare(`
      UPDATE classroom_lesson_runs
      SET teaching_cursor_json = json_object('canonicalActivityId', ?)
      WHERE lesson_run_id = 'lesson-run-001'
    `).run(scopeActivityId);
    const accepted = await activityRoute.POST(jsonRequest(scopeActivityId, studentCookie, body), context(scopeActivityId));
    assert.equal(accepted.status, 200);
    assert.deepEqual((await accepted.json()).delivery, body.delivery);
  });
});

test('P02 and P03 activity APIs return targeted failure then persist a corrected retry', async () => {
  await withFixture(async ({ database, completeStudentCookie }) => {
    seedUserTaskAdvancementFacts(database, 'stu-03', 'P01');
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
      if (index === 1) seedUserTaskAdvancementFacts(database, 'stu-03', 'P02');
      const failedResponse = await activityRoute.POST(jsonRequest(activity.activityId, completeStudentCookie, {
        attemptId: `${activity.attemptId}-failed`,
        response: { fields: { response: '凭感觉判断' } },
        delivery: { channel: 'self-study' },
      }), context(activity.activityId));
      assert.equal(failedResponse.status, 200);
      const failed = await failedResponse.json();
      assert.equal(failed.passed, false);
      assert.equal(failed.attemptNumber, 1);
      assert.ok(failed.feedback.length > 0);
      assert.ok(failed.correctionPath.length > 0);

      const passedResponse = await activityRoute.POST(jsonRequest(activity.activityId, completeStudentCookie, {
        attemptId: `${activity.attemptId}-passed`,
        response: { fields: { response: activity.valid } },
        delivery: { channel: 'self-study' },
      }), context(activity.activityId));
      assert.equal(passedResponse.status, 200);
      const passed = await passedResponse.json();
      assert.equal(passed.passed, true);
      assert.equal(passed.attemptNumber, 2);
      assert.deepEqual(database.prepare(`
        SELECT student_id AS studentId, activity_id AS activityId, passed, origin
        FROM practice_attempts WHERE attempt_id = ?
      `).get(`${activity.attemptId}-passed`), {
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

function activateClassroomActivity(database: AppDatabase, canonicalActivityId: string): void {
  database.prepare(`
    INSERT INTO classroom_lesson_runs (
      lesson_run_id, session_id, lesson_id, task_id, node_id, status,
      teaching_cursor_json, started_at
    ) VALUES ('lesson-run-001', 'demo-class', 'lesson-p01', 'P01', 'P1T1-N01',
      'active', json_object('canonicalActivityId', ?), CURRENT_TIMESTAMP)
  `).run(canonicalActivityId);
  database.prepare(`
    UPDATE classroom_sessions
    SET status = 'active', active_node_id = 'P1T1-N01', active_lesson_run_id = 'lesson-run-001'
    WHERE session_id = 'demo-class'
  `).run();
}
