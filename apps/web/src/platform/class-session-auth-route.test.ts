import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test, { after } from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'next/server') return nextResolve('next/server.js', context);
    if (specifier === 'next/headers') return nextResolve('next/headers.js', context);
    if (specifier === 'next/navigation') return nextResolve('next/navigation.js', context);
    if (specifier.startsWith('@/')) {
      const sourcePath = resolve(process.cwd(), 'apps/web/src', specifier.slice(2));
      const candidate = [`${sourcePath}.ts`, `${sourcePath}.tsx`, resolve(sourcePath, 'index.ts')].find(existsSync);
      if (candidate) return nextResolve(pathToFileURL(candidate).href, context);
    }
    if (specifier.startsWith('.') && context.parentURL?.includes('/apps/web/src/') && !specifier.endsWith('.ts') && !specifier.endsWith('.tsx')) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const { createTestDatabase } = await import('./db/test-database.ts');
const { migrateDatabase } = await import('./db/migrations.ts');
const { seedDemo } = await import('./db/demo-seed.ts');
const { closeDatabase } = await import('./db/database.ts');
const { AuthService } = await import('./auth/auth-service.ts');
const { AUTH_COOKIE_NAME } = await import('./auth/cookie.ts');
const { ClassroomParticipationRepository } = await import('./classroom-participation-repository.ts');
const classRoute = await import('../app/api/class-sessions/[sessionId]/route.ts');

const fixture = createTestDatabase();
migrateDatabase(fixture.database);
seedDemo(fixture.database);
seedClassroomSessions(fixture.database, [
  'P1T1-N02-auth-student',
  'P1T1-N02-auth-teacher',
  'P1T1-N02-auth-forged-patch',
  'P1T1-N02-auth-student-not-joined',
  'P1T1-N02-auth-student-action',
  'P1T1-N02-auth-forged-action',
]);
process.env.DGBOOK_SQLITE_PATH = fixture.databasePath;
const auth = new AuthService(fixture.database);
const teacherCookie = loginCookie('teacher01');
const studentCookie = loginCookie('student01');

after(() => {
  closeDatabase();
  delete process.env.DGBOOK_SQLITE_PATH;
  fixture.cleanup();
});

test('spoofed query and role headers cannot authenticate an anonymous request', async () => {
  const response = await classRoute.GET(
    request('P1T1-N02-auth-anonymous?role=teacher&student=stu-02', undefined, {
      'x-dgbook-class-role': 'teacher',
    }),
    { params: { sessionId: 'P1T1-N02-auth-anonymous' } },
  );
  assert.equal(response.status, 401);
});

test('student cookie remains self-scoped despite teacher and other-student spoofing', async () => {
  const sessionId = 'P1T1-N02-auth-student';
  const response = await classRoute.GET(
    request(`${sessionId}?role=teacher&student=stu-02`, undefined, {
      cookie: studentCookie,
      'x-dgbook-class-role': 'teacher',
    }),
    { params: { sessionId } },
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body.session.studentRoster, []);
  assert.equal(body.session.studentProgress.studentId, 'stu-01');

  const intentResponse = await classRoute.PATCH(
    request(`${sessionId}?role=teacher`, {
      intent: { type: 'phase_changed', phase: 'lecture' },
      expectedRevision: 0,
    }, {
      cookie: studentCookie,
      'x-dgbook-class-role': 'teacher',
    }),
    { params: { sessionId } },
  );
  assert.equal(intentResponse.status, 403);
});

test('teacher cookie receives the teacher projection and may request a sanitized projector view', async () => {
  const sessionId = 'P1T1-N02-auth-teacher';
  const teacherResponse = await classRoute.GET(
    request(sessionId, undefined, { cookie: teacherCookie }),
    { params: { sessionId } },
  );
  const teacher = (await teacherResponse.json()).session;
  assert.equal(teacherResponse.status, 200);
  assert.equal(teacher.studentRoster.length, 3);

  const projectorResponse = await classRoute.GET(
    request(`${sessionId}?view=projector`, undefined, { cookie: teacherCookie }),
    { params: { sessionId } },
  );
  const projector = (await projectorResponse.json()).session;
  assert.equal(projectorResponse.status, 200);
  const serialized = JSON.stringify(projector);
  for (const forbidden of [
    'studentRoster', 'studentProgress', 'studentId', 'participants', 'formalTest',
    'devicePresence', 'commandAcks', 'anonymous-', 'stu-01', 'stu-02', 'stu-03',
  ]) {
    assert.equal(serialized.includes(forbidden), false, `projector leaked ${forbidden}`);
  }
});

test('authenticated requests to an unknown classroom session fail closed', async () => {
  const response = await classRoute.GET(
    request('not-a-p1-session', undefined, { cookie: teacherCookie }),
    { params: { sessionId: 'not-a-p1-session' } },
  );
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.deepEqual(body, { error: 'Class session is not open' });
});

test('student generic patches cannot forge authoritative progress or shared classroom state', async () => {
  const sessionId = 'P1T1-N02-auth-forged-patch';
  const beforeResponse = await classRoute.GET(
    request(sessionId, undefined, { cookie: teacherCookie }),
    { params: { sessionId } },
  );
  const before = (await beforeResponse.json()).session;
  const beforeStudent = before.studentRoster.find((student: { studentId: string }) => student.studentId === 'stu-01');

  const forgedResponse = await classRoute.PATCH(
    request(sessionId, {
      patch: {
        activityState: 'submitted',
        studentMode: 'self',
        studentRoster: [{ studentId: 'stu-01', name: 'Forged roster' }],
        formalTest: { status: 'completed', participants: [] },
        studentProgress: {
          studentId: 'stu-02',
          name: 'Forged name',
          risk: 'on_track',
          evidenceCount: 999,
          bestGameScore: 100,
          latestGameScore: 100,
          attemptCount: 999,
          teacherVerified: true,
        },
      },
    }, { cookie: studentCookie }),
    { params: { sessionId } },
  );

  assert.equal(forgedResponse.status, 400);
  const afterTeacherResponse = await classRoute.GET(
    request(sessionId, undefined, { cookie: teacherCookie }),
    { params: { sessionId } },
  );
  const afterTeacher = (await afterTeacherResponse.json()).session;
  const afterStudent = afterTeacher.studentRoster.find((student: { studentId: string }) => student.studentId === 'stu-01');
  assert.deepEqual(afterStudent, beforeStudent);
  assert.equal(afterTeacher.activityState, before.activityState);
  assert.equal(afterTeacher.studentMode, before.studentMode);
  assert.deepEqual(afterTeacher.formalTest, before.formalTest);
});

test('student classroom actions fail until the authenticated learner explicitly joins', async () => {
  const sessionId = 'P1T1-N02-auth-student-not-joined';
  activateSession(sessionId);
  const beforeEvents = classroomSubmissionCount(sessionId, 'stu-01');

  const response = await classRoute.PATCH(
    request(sessionId, {
      action: {
        type: 'activity_submitted',
        answers: ['device position evidence'],
        mode: 'self',
        currentSlideIndex: 1,
      },
    }, { cookie: studentCookie }),
    { params: { sessionId } },
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /has not joined classroom session/);
  assert.equal(classroomSubmissionCount(sessionId, 'stu-01'), beforeEvents);
  assert.equal(fixture.database.prepare(`
    SELECT COUNT(*) FROM classroom_participation
    WHERE session_id = ? AND student_id = ?
  `).pluck().get(sessionId, 'stu-01'), 0);
});

test('student actions are narrow, actor scoped, and persisted without shared answer fields', async () => {
  const sessionId = 'P1T1-N02-auth-student-action';
  joinStudent(sessionId, 'stu-01');
  const response = await classRoute.PATCH(
    request(sessionId, {
      action: {
        type: 'activity_submitted',
        answers: ['AAU 设备铭牌', '光纤端口标识'],
        mode: 'self',
        currentSlideIndex: 3,
      },
    }, { cookie: studentCookie }),
    { params: { sessionId } },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.session.studentProgress.studentId, 'stu-01');
  assert.equal(body.session.studentProgress.mode, 'self');
  assert.equal(
    body.session.studentProgress.currentSlideIndex,
    1,
    'the obsolete client slide index is not echoed as durable classroom state',
  );
  assert.equal(body.session.studentProgress.evidenceCount, 2);
  assert.equal(body.session.studentProgress.submissionState, 'submitted');
  assert.deepEqual(body.session.studentRoster, []);
  assert.equal(body.session.submissionAnswers, undefined);

  const teacherResponse = await classRoute.GET(
    request(sessionId, undefined, { cookie: teacherCookie }),
    { params: { sessionId } },
  );
  const teacher = (await teacherResponse.json()).session;
  assert.equal(teacher.submissionAnswers?.includes('AAU 设备铭牌') ?? false, false);
  assert.equal(teacher.studentRoster.find((student: { studentId: string }) => student.studentId === 'stu-01').evidenceCount, 2);

  const stored = fixture.database.prepare(`
    SELECT student_id AS studentId, event_type AS eventType, payload_json AS payloadJson
    FROM learning_events
    WHERE student_id = ? AND event_type = 'classroom_activity_submitted'
    ORDER BY occurred_at DESC, event_id DESC
    LIMIT 1
  `).get('stu-01') as { studentId: string; eventType: string; payloadJson: string } | undefined;
  assert.equal(stored?.studentId, 'stu-01');
  assert.equal(stored?.eventType, 'classroom_activity_submitted');
  assert.deepEqual(JSON.parse(stored?.payloadJson ?? '{}'), {
    sessionId,
    answers: ['AAU 设备铭牌', '光纤端口标识'],
    completed: true,
  });
});

test('student action parser rejects extra authority fields instead of silently accepting them', async () => {
  const sessionId = 'P1T1-N02-auth-forged-action';
  const response = await classRoute.PATCH(
    request(sessionId, {
      action: {
        type: 'navigation_changed',
        mode: 'self',
        currentSlideIndex: 2,
        bestGameScore: 100,
      },
    }, { cookie: studentCookie }),
    { params: { sessionId } },
  );

  assert.equal(response.status, 400);
});

function loginCookie(username: string): string {
  const result = auth.login({ username, password: '123456' });
  assert.ok(result);
  return `${AUTH_COOKIE_NAME}=${result.token}`;
}

function request(path: string, body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost/api/class-sessions/${path}`, {
    method: body === undefined ? 'GET' : 'PATCH',
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function seedClassroomSessions(
  database: typeof fixture.database,
  sessionIds: string[],
): void {
  const insertSession = database.prepare(`
    INSERT INTO classroom_sessions (
      session_id, class_id, name, teacher_id, status, active_node_id,
      active_unit_id, revision, state_json
    )
    SELECT ?, class_id, ?, teacher_id, status, active_node_id,
      active_unit_id, 0, '{}'
    FROM classroom_sessions
    WHERE session_id = 'demo-class'
  `);
  const insertMembers = database.prepare(`
    INSERT INTO classroom_members (session_id, student_id)
    SELECT ?, student_id
    FROM classroom_members
    WHERE session_id = 'demo-class'
  `);
  database.transaction(() => {
    for (const sessionId of sessionIds) {
      insertSession.run(sessionId, `Test ${sessionId}`);
      insertMembers.run(sessionId);
    }
  })();
}

function activateSession(sessionId: string): void {
  fixture.database.prepare(`
    UPDATE classroom_sessions SET status = 'active' WHERE session_id = ?
  `).run(sessionId);
}

function joinStudent(sessionId: string, studentId: string): void {
  activateSession(sessionId);
  new ClassroomParticipationRepository(fixture.database).join(sessionId, studentId);
}

function classroomSubmissionCount(sessionId: string, studentId: string): number {
  return Number(fixture.database.prepare(`
    SELECT COUNT(*)
    FROM learning_events
    WHERE student_id = ?
      AND event_type = 'classroom_activity_submitted'
      AND json_extract(payload_json, '$.sessionId') = ?
  `).pluck().get(studentId, sessionId) ?? 0);
}
