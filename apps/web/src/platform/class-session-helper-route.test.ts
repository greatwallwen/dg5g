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

const classRoute = await import('../app/api/class-sessions/[sessionId]/route.ts');
const helperRoute = await import('../app/api/class-sessions/[sessionId]/helper/route.ts');
const helperToken = 'dgbook-helper-demo-2026';
const { createTestDatabase } = await import('./db/test-database.ts');
const { migrateDatabase } = await import('./db/migrations.ts');
const { seedDemo } = await import('./db/demo-seed.ts');
const { closeDatabase } = await import('./db/database.ts');
const { AuthService } = await import('./auth/auth-service.ts');
const { AUTH_COOKIE_NAME } = await import('./auth/cookie.ts');
const { ClassroomParticipationRepository } = await import('./classroom-participation-repository.ts');
const { startActiveLessonRun } = await import('./classroom-lesson-run-test-fixture.ts');
const lessonRoute = await import('../app/api/class-sessions/[sessionId]/lesson/route.ts');

const authFixture = createTestDatabase();
migrateDatabase(authFixture.database);
seedDemo(authFixture.database);
seedClassroomSessions(authFixture.database, [
  'P1T1-N02-helper-integration',
  'P1T1-N02-helper-projection',
  'P1T1-N02-private-student-work',
  'P1T1-N02-spoofed-student',
]);
const helperLessonRun = startActiveLessonRun(
  authFixture.database,
  'P1T1-N02-helper-integration',
);
process.env.DGBOOK_SQLITE_PATH = authFixture.databasePath;
const authService = new AuthService(authFixture.database);
const teacherCookie = actorCookie('teacher01');
const studentCookies = {
  'stu-01': actorCookie('student01'),
  'stu-02': actorCookie('student02'),
};

after(() => {
  closeDatabase();
  delete process.env.DGBOOK_SQLITE_PATH;
  authFixture.cleanup();
});

test('helper route rejects requests without its helper token', async () => {
  const response = await helperRoute.GET(
    new Request('http://localhost/api/class-sessions/P1T1-N02-helper-auth/helper'),
    { params: { sessionId: 'P1T1-N02-helper-auth' } },
  );

  assert.equal(response.status, 403);
});

test('teacher intent produces a server revision while helper simulators cannot acknowledge it', async () => {
  const sessionId = 'P1T1-N02-helper-integration';
  for (const studentId of ['stu-01', 'stu-02', 'stu-03']) {
    const heartbeatResponse = await helperRoute.PATCH(
      helperRequest(sessionId, {
        kind: 'heartbeat',
        actorRole: 'student',
        deviceId: `device-${studentId}`,
        studentId,
        pageState: 'ready',
        lastAppliedRevision: 0,
      }),
      { params: { sessionId } },
    );
    assert.equal(heartbeatResponse.status, 200);
  }

  const intentResponse = await lessonRoute.PATCH(
    authenticatedRequest(`http://localhost/api/class-sessions/${sessionId}/lesson`, teacherCookie, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lessonRunId: helperLessonRun.lessonRunId,
        intent: { type: 'phase_changed', phase: 'question' },
        expectedRevision: helperLessonRun.revision,
      }),
    }),
    { params: { sessionId } },
  );
  const intentBody = await intentResponse.json();
  assert.equal(intentResponse.status, 200);
  assert.equal(intentBody.session.lessonState.revision, helperLessonRun.revision + 1);

  const helperStateResponse = await helperRoute.GET(
    helperRequest(sessionId),
    { params: { sessionId } },
  );
  const helperState = await helperStateResponse.json();
  assert.equal(helperState.command.revision, helperLessonRun.revision + 1);

  for (const state of ['delivered', 'applied'] as const) {
    const ackResponse = await helperRoute.PATCH(
      helperRequest(sessionId, {
        kind: 'ack',
        commandId: helperState.command.commandId,
        deviceId: 'device-stu-01',
        studentId: 'stu-01',
        state,
      }),
      { params: { sessionId } },
    );
    assert.equal(ackResponse.status, 409);
  }

  const teacherResponse = await classRoute.GET(
    authenticatedRequest(`http://localhost/api/class-sessions/${sessionId}`, teacherCookie),
    { params: { sessionId } },
  );
  const teacher = (await teacherResponse.json()).session;
  assert.equal(teacher.devicePresence.length, 3);
  assert.deepEqual(teacher.commandAcks, []);
});

test('student and projector projections do not expose the class roster or private device state', async () => {
  const sessionId = 'P1T1-N02-helper-projection';
  await helperRoute.PATCH(
    helperRequest(sessionId, {
      kind: 'heartbeat',
      actorRole: 'student',
      deviceId: 'device-projection-stu-01',
      studentId: 'stu-01',
      pageState: 'ready',
      lastAppliedRevision: 0,
    }),
    { params: { sessionId } },
  );

  const studentResponse = await classRoute.GET(
    authenticatedRequest(`http://localhost/api/class-sessions/${sessionId}`, studentCookies['stu-01']),
    { params: { sessionId } },
  );
  const student = (await studentResponse.json()).session;
  assert.deepEqual(student.studentRoster, []);
  assert.equal(student.studentProgress.studentId, 'stu-01');
  assert.equal(student.devicePresence.length, 1);

  const projectorResponse = await classRoute.GET(
    authenticatedRequest(`http://localhost/api/class-sessions/${sessionId}?view=projector`, teacherCookie),
    { params: { sessionId } },
  );
  const projector = (await projectorResponse.json()).session;
  assert.equal('studentRoster' in projector, false);
  assert.equal('formalTest' in projector, false);
  assert.equal('devicePresence' in projector, false);
  assert.equal('commandAcks' in projector, false);
  assert.equal(JSON.stringify(projector).includes('stu-01'), false);
});

test('legacy generic activity submission is rejected without completion side effects or private-data exposure', async () => {
  const sessionId = 'P1T1-N02-private-student-work';
  joinStudent(sessionId, 'stu-01');
  const submissionResponse = await classRoute.PATCH(
    authenticatedRequest(`http://localhost/api/class-sessions/${sessionId}`, studentCookies['stu-01'], {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: {
          type: 'activity_submitted',
          answers: ['stu-01 private answer', 'stu-01 private notes'],
          mode: 'self',
          currentSlideIndex: 2,
        },
      }),
    }),
    { params: { sessionId } },
  );
  assert.equal(submissionResponse.status, 400);
  assert.equal(authFixture.database.prepare(`
    SELECT COUNT(*) FROM learning_events
    WHERE student_id = 'stu-01' AND event_type = 'classroom_activity_submitted'
  `).pluck().get(), 0);
  assert.equal(authFixture.database.prepare(`
    SELECT COUNT(*) FROM practice_attempts
    WHERE student_id = 'stu-01' AND classroom_session_id = ?
  `).pluck().get(sessionId), 0);
  assert.equal(
    new ClassroomParticipationRepository(authFixture.database).read(sessionId, 'stu-01')?.mode,
    'follow',
  );

  const response = await classRoute.GET(
    authenticatedRequest(`http://localhost/api/class-sessions/${sessionId}`, studentCookies['stu-02']),
    { params: { sessionId } },
  );
  const student = (await response.json()).session;

  assert.equal(student.submissionAnswers, undefined);
  assert.equal(student.selfStudyAnswers, undefined);
  assert.ok(student.formalTest.participants.every((participant: { studentId: string }) => participant.studentId === 'stu-02'));
});

test('a spoofed unknown student query cannot change the authenticated learner', async () => {
  const sessionId = 'P1T1-N02-spoofed-student';
  const response = await classRoute.GET(
    authenticatedRequest(
      `http://localhost/api/class-sessions/${sessionId}?role=teacher&student=stu-missing`,
      studentCookies['stu-01'],
    ),
    { params: { sessionId } },
  );

  assert.equal(response.status, 200);
  const student = (await response.json()).session;
  assert.equal(student.studentProgress.studentId, 'stu-01');
  assert.deepEqual(student.studentRoster, []);
});

function helperRequest(sessionId: string, body?: unknown) {
  return new Request(`http://localhost/api/class-sessions/${sessionId}/helper`, {
    method: body ? 'PATCH' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-dgbook-helper-token': helperToken,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function actorCookie(username: string): string {
  const login = authService.login({ username, password: '123456' });
  assert.ok(login);
  return `${AUTH_COOKIE_NAME}=${login.token}`;
}

function authenticatedRequest(url: string, cookie: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  headers.set('cookie', cookie);
  return new Request(url, { ...init, headers });
}

function seedClassroomSessions(
  database: typeof authFixture.database,
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

function joinStudent(sessionId: string, studentId: string): void {
  authFixture.database.prepare(`
    UPDATE classroom_sessions SET status = 'active' WHERE session_id = ?
  `).run(sessionId);
  new ClassroomParticipationRepository(authFixture.database).join(sessionId, studentId);
}
