import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import type { AuthenticatedActor } from './auth/actor.ts';

const { createTestDatabase } = await import('./db/test-database.ts');
const { migrateDatabase } = await import('./db/migrations.ts');
const { seedDemo } = await import('./db/demo-seed.ts');
const { closeDatabase } = await import('./db/database.ts');
const { AuthService } = await import('./auth/auth-service.ts');
const { AUTH_COOKIE_NAME } = await import('./auth/cookie.ts');
const { ClassroomLessonRunRepository } = await import('./classroom-lesson-run-repository.ts');
const { ClassroomParticipationRepository } = await import('./classroom-participation-repository.ts');
const { FormalAssessmentService } = await import('./formal-assessment-service.ts');

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

test('teacher POST drives start, pause, resume, collect, and begin-review with no-store responses', async () => {
  const classroom = prepareClassroom('assessment-route-lifecycle');
  const route = await assessmentRoute();
  assert.equal('GET' in route, false);

  const started = await post(route, classroom.sessionId, {
    command: {
      type: 'start', lessonRunId: classroom.lessonRunId,
      nodeId: 'P1T1-N02', gameId: 'P1T1-N02-server-assessment',
      expectedClassroomRevision: classroom.classroomRevision,
    },
  }, teacherCookie);
  assert.equal(started.response.status, 200);
  assert.equal(started.response.headers.get('cache-control'), 'no-store');
  assert.equal(started.body.status, 'running');
  assert.equal(started.body.eligibleCount, 3);

  const paused = await post(route, classroom.sessionId, {
    command: { type: 'pause', runId: started.body.runId, expectedRevision: 0 },
  }, teacherCookie);
  assert.equal(paused.response.status, 200);
  assert.equal(paused.body.status, 'paused');
  const resumed = await post(route, classroom.sessionId, {
    command: { type: 'resume', runId: started.body.runId, expectedRevision: 1 },
  }, teacherCookie);
  assert.equal(resumed.response.status, 200);
  assert.equal(resumed.body.status, 'running');

  const formal = new FormalAssessmentService(fixture.database);
  const paper = formal.openOrResume(studentActor('stu-01'), 'P1T1-N02', {
    classroomSessionId: classroom.sessionId,
  });
  assert.equal(paper.state, 'in-progress');
  formal.submitAnswers(studentActor('stu-01'), paper.attemptToken, passingAnswers, 'P1T1-N02');
  const collected = await post(route, classroom.sessionId, {
    command: { type: 'collect', runId: started.body.runId, expectedRevision: 2 },
  }, teacherCookie);
  assert.equal(collected.response.status, 200);
  assert.equal(collected.body.status, 'closed');
  assert.deepEqual(collected.body.review, []);
  const reviewing = await post(route, classroom.sessionId, {
    command: { type: 'begin-review', runId: started.body.runId, expectedRevision: 3 },
  }, teacherCookie);
  assert.equal(reviewing.response.status, 200);
  assert.equal(reviewing.body.status, 'reviewing');
  assert.equal(reviewing.body.canBeginReview, false);
});

test('route maps student authorization, unknown session, and stale assessment CAS precisely', async () => {
  const route = await assessmentRoute();
  const forbiddenClassroom = prepareClassroom('assessment-route-forbidden');
  const beforeForbidden = assessmentRunCount(forbiddenClassroom.sessionId);
  const forbidden = await post(route, forbiddenClassroom.sessionId, {
    command: {
      type: 'start', lessonRunId: forbiddenClassroom.lessonRunId,
      nodeId: 'P1T1-N02', gameId: 'P1T1-N02-server-assessment',
      expectedClassroomRevision: forbiddenClassroom.classroomRevision,
    },
  }, studentCookie);
  assert.equal(forbidden.response.status, 403);
  assert.equal(assessmentRunCount(forbiddenClassroom.sessionId), beforeForbidden);

  const unknown = await post(route, 'missing-classroom', {
    command: {
      type: 'start', lessonRunId: 'missing-lesson', nodeId: 'P1T1-N02',
      gameId: 'P1T1-N02-server-assessment', expectedClassroomRevision: 0,
    },
  }, teacherCookie);
  assert.equal(unknown.response.status, 404);

  const staleClassroom = prepareClassroom('assessment-route-stale');
  const started = await post(route, staleClassroom.sessionId, {
    command: {
      type: 'start', lessonRunId: staleClassroom.lessonRunId,
      nodeId: 'P1T1-N02', gameId: 'P1T1-N02-server-assessment',
      expectedClassroomRevision: staleClassroom.classroomRevision,
    },
  }, teacherCookie);
  await post(route, staleClassroom.sessionId, {
    command: { type: 'pause', runId: started.body.runId, expectedRevision: 0 },
  }, teacherCookie);
  const stale = await post(route, staleClassroom.sessionId, {
    command: { type: 'resume', runId: started.body.runId, expectedRevision: 0 },
  }, teacherCookie);
  assert.equal(stale.response.status, 409);
  assert.equal(stale.body.currentRevision, 1);
});

test('route rejects malformed or extra fields with zero assessment writes', async () => {
  const route = await assessmentRoute();
  const classroom = prepareClassroom('assessment-route-invalid');
  const invalidBodies = [
    null,
    {},
    { command: { type: 'start' } },
    { command: { type: 'pause', runId: 'x', expectedRevision: '0' } },
    { command: { type: 'collect', runId: 'x', expectedRevision: 0, extra: true } },
    {
      command: {
        type: 'start', lessonRunId: classroom.lessonRunId, nodeId: 'P1T1-N02',
        gameId: 'P1T1-N02-server-assessment', expectedClassroomRevision: classroom.classroomRevision,
      },
      extra: true,
    },
    {
      command: {
        type: 'start', lessonRunId: classroom.lessonRunId, nodeId: 'P1T1-N02',
        gameId: 'P1T1-N02-server-assessment', expectedClassroomRevision: classroom.classroomRevision,
        durationSeconds: 3601,
      },
    },
  ];
  for (const body of invalidBodies) {
    const response = await post(route, classroom.sessionId, body, teacherCookie);
    assert.equal(response.response.status, 400, JSON.stringify(body));
  }
  assert.equal(assessmentRunCount(classroom.sessionId), 0);
});

test('generic classroom PATCH refuses assessment lifecycle authority', async () => {
  const classroom = prepareClassroom('assessment-route-generic-patch');
  const genericRoute = await import('../app/api/class-sessions/[sessionId]/route.ts');
  const beforeState = fixture.database.prepare(`
    SELECT state_json FROM classroom_sessions WHERE session_id = ?
  `).pluck().get(classroom.sessionId);
  const response = await genericRoute.PATCH(new Request(
    `http://localhost/api/class-sessions/${classroom.sessionId}`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: teacherCookie },
      body: JSON.stringify({
        expectedRevision: classroom.classroomRevision,
        patch: {
          formalTest: {
            status: 'running',
            runId: 'client-invented-run',
            nodeId: 'P1T1-N02',
            gameId: 'P1T1-N02-server-assessment',
          },
        },
      }),
    },
  ), { params: { sessionId: classroom.sessionId } });
  assert.equal(response.status, 400);
  assert.equal(assessmentRunCount(classroom.sessionId), 0);
  assert.equal(fixture.database.prepare(`
    SELECT state_json FROM classroom_sessions WHERE session_id = ?
  `).pluck().get(classroom.sessionId), beforeState);
});

async function assessmentRoute() {
  try {
    return await import('../app/api/class-sessions/[sessionId]/assessment/route.ts');
  } catch (error) {
    assert.fail(`assessment command route is not implemented: ${String(error)}`);
  }
}

async function post(route: Awaited<ReturnType<typeof assessmentRoute>>, sessionId: string, body: unknown, cookie: string) {
  const response = await route.POST(new Request(
    `http://localhost/api/class-sessions/${sessionId}/assessment`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
    },
  ), { params: { sessionId } });
  return { response, body: await response.json() };
}

function prepareClassroom(sessionId: string) {
  fixture.database.transaction(() => {
    fixture.database.prepare(`
      INSERT INTO classroom_sessions (
        session_id, class_id, name, teacher_id, status, active_node_id,
        active_unit_id, revision, state_json
      ) SELECT ?, class_id, ?, teacher_id, 'paused', 'P1T1-N02',
        'P01-ku-02', 0, '{}'
      FROM classroom_sessions WHERE session_id = 'demo-class'
    `).run(sessionId, sessionId);
    fixture.database.prepare(`
      INSERT INTO classroom_members (session_id, student_id)
      SELECT ?, student_id FROM classroom_members WHERE session_id = 'demo-class'
    `).run(sessionId);
  })();
  const lessons = new ClassroomLessonRunRepository(fixture.database);
  const prepared = lessons.startLessonRun({ sessionId, lessonId: 'P01-L1', expectedRevision: 0 }).run;
  const active = lessons.transitionLessonRun({
    sessionId, lessonRunId: prepared.lessonRunId, expectedRevision: 1, nextStatus: 'active',
  }).run;
  const cursor = lessons.updateTeachingCursor({
    sessionId, lessonRunId: active.lessonRunId, expectedRevision: 2,
    next: {
      ...active.teachingCursor, nodeId: 'P1T1-N02', unitId: 'P01-ku-02',
      pageId: 'P01-L1-P02', pageIndex: 1, phase: 'assessment',
      actionId: 'P1T1-N02-S02', actionIndex: 1, playbackStatus: 'paused',
    },
  }).run;
  const participation = new ClassroomParticipationRepository(fixture.database);
  for (const studentId of ['stu-01', 'stu-02', 'stu-03']) participation.join(sessionId, studentId);
  return { sessionId, lessonRunId: cursor.lessonRunId, classroomRevision: cursor.revision };
}

function loginCookie(username: string): string {
  const result = auth.login({ username, password: '123456' });
  assert.ok(result);
  return `${AUTH_COOKIE_NAME}=${result.token}`;
}

function assessmentRunCount(sessionId: string): number {
  return Number(fixture.database.prepare(`
    SELECT COUNT(*) FROM classroom_assessment_runs WHERE session_id = ?
  `).pluck().get(sessionId));
}

function studentActor(studentId: string): AuthenticatedActor {
  return {
    userId: studentId, studentId, username: studentId,
    displayName: studentId, role: 'student', classId: 'demo-class',
  };
}

const passingAnswers = {
  evidenceClassification: 'nameplate-photo',
  linkReconstruction: ['source-device', 'source-port', 'cable-label', 'peer-port', 'peer-device'],
  defectiveOutputRevision: ['restore-source', 'add-photo-index', 'record-direction'],
  professionalConclusion: {
    confirmedFact: 'The equipment nameplate and source port are confirmed.',
    evidenceGap: 'The peer port photograph remains unclear and requires review.',
    risk: 'An unsupported link conclusion creates a delivery risk.',
    action: 'Retake the peer-port photograph and update the evidence table.',
  },
};
