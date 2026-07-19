import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthService } from './auth/auth-service.ts';
import type { AuthenticatedActor } from './auth/actor.ts';
import { AUTH_COOKIE_NAME } from './auth/cookie.ts';
import { ClassroomAssessmentRunRepository } from './classroom-assessment-run-repository.ts';
import { closeDatabase, type AppDatabase } from './db/database.ts';
import { migrateDatabase } from './db/migrations.ts';
import { seedDemo } from './db/demo-seed.ts';
import { createTestDatabase } from './db/test-database.ts';
import {
  AssessmentTokenError,
  FormalAssessmentService,
  type AssessmentAnswers,
} from './formal-assessment-service.ts';

const student: AuthenticatedActor = {
  userId: 'stu-01', studentId: 'stu-01', username: 'student01',
  displayName: '学生一', role: 'student', classId: 'demo-class',
};
const peer: AuthenticatedActor = {
  ...student,
  userId: 'stu-02', studentId: 'stu-02', username: 'student02', displayName: '学生二',
};

const passingAnswers: AssessmentAnswers = {
  evidenceClassification: 'nameplate-photo',
  linkReconstruction: ['source-device', 'source-port', 'cable-label', 'peer-port', 'peer-device'],
  defectiveOutputRevision: ['restore-source', 'add-photo-index', 'record-direction'],
  professionalConclusion: {
    confirmedFact: '设备铭牌可识别并确认设备身份，源端口照片清晰且已经确认源端。',
    evidenceGap: '对端端口照片模糊，仍有证据缺口并待复核对端端口编号。',
    risk: '如果直接交付会产生误判风险，并导致链路关系错误。',
    action: '下一步重新拍摄对端端口并复核编号，补齐照片索引后更新成果。',
  },
};

test('stale draft CAS returns the authoritative draft without overwriting it', async () => {
  const fixture = createTestDatabase();
  const previousPath = process.env.DGBOOK_SQLITE_PATH;
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    readyForFormalAssessment(fixture.database);
    const session = new AuthService(fixture.database).login({
      username: 'student01', password: '123456',
    });
    assert.ok(session);
    process.env.DGBOOK_SQLITE_PATH = fixture.databasePath;
    closeDatabase();
    const route = await import('../app/api/learning/nodes/[nodeId]/assessment/route.ts');
    const cookie = `${AUTH_COOKIE_NAME}=${session.token}`;
    const issued = await route.GET(request('GET', cookie), routeContext()).json();
    const first = await route.PATCH(request('PATCH', cookie, {
      answers: { evidenceClassification: 'nameplate-photo' }, expectedRevision: 0,
    }, issued.attemptToken), routeContext());
    assert.equal(first.status, 200);

    const stale = await route.PATCH(request('PATCH', cookie, {
      answers: { evidenceClassification: 'location-photo' }, expectedRevision: 0,
    }, issued.attemptToken), routeContext());
    assert.equal(stale.status, 409);
    const body = await stale.json();
    assert.equal(body.draftState, 'revision-conflict');
    assert.deepEqual(body.authoritativeDraft, {
      answers: { evidenceClassification: 'nameplate-photo' },
      revision: 1,
      updatedAt: body.authoritativeDraft.updatedAt,
    });
  } finally {
    closeDatabase();
    if (previousPath === undefined) delete process.env.DGBOOK_SQLITE_PATH;
    else process.env.DGBOOK_SQLITE_PATH = previousPath;
    fixture.cleanup();
  }
});

test('an official pause transaction fences the pre-pause token from draft and submit writes', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    readyForFormalAssessment(fixture.database);
    openClassroomRun(fixture.database, 'pause-fence-run');
    const service = new FormalAssessmentService(fixture.database, deterministicOptions());
    const issued = service.openOrResume(student, 'P1T1-N02', { classroomSessionId: 'demo-class' });
    assert.equal(issued.state, 'in-progress');
    service.saveDraft(student, issued.attemptToken, { evidenceClassification: 'nameplate-photo' }, 0);

    const runs = new ClassroomAssessmentRunRepository(fixture.database);
    runs.pauseRun(
      'pause-fence-run', 0, new Date('2026-07-16T10:01:00.000Z'),
    );
    runs.resumeRun('pause-fence-run', 1, new Date('2026-07-16T10:02:00.000Z'));
    const isUsedToken = (error: unknown) => (
      error instanceof AssessmentTokenError && error.code === 'used-token'
    );
    assert.throws(
      () => service.saveDraft(
        student, issued.attemptToken, { evidenceClassification: 'location-photo' }, 1,
      ),
      isUsedToken,
    );
    assert.throws(
      () => service.submitAnswers(student, issued.attemptToken, passingAnswers),
      isUsedToken,
    );
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM formal_attempts WHERE assessment_id = ?
    `).pluck().get(issued.assessmentId), 0);
    assert.deepEqual(fixture.database.prepare(`
      SELECT answers_json AS answersJson, state_revision AS revision
      FROM formal_assessment_drafts WHERE assessment_id = ? AND student_id = ?
    `).get(issued.assessmentId, student.userId), {
      answersJson: JSON.stringify({ evidenceClassification: 'nameplate-photo' }),
      revision: 1,
    });
  } finally {
    fixture.cleanup();
  }
});

test('a lost submitted response resumes the same classroom assessment as a terminal result', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    readyForFormalAssessment(fixture.database);
    readyForFormalAssessment(fixture.database, peer.userId);
    openClassroomRun(fixture.database, 'lost-response-run');
    const service = new FormalAssessmentService(fixture.database, deterministicOptions());
    const issued = service.openOrResume(student, 'P1T1-N02', { classroomSessionId: 'demo-class' });
    service.openOrResume(peer, 'P1T1-N02', { classroomSessionId: 'demo-class' });
    assert.equal(issued.state, 'in-progress');
    const submitted = service.submitAnswers(student, issued.attemptToken, passingAnswers);
    const runs = new ClassroomAssessmentRunRepository(fixture.database);
    runs.pauseRun('lost-response-run', 0, new Date('2026-07-16T10:01:00.000Z'));
    runs.resumeRun('lost-response-run', 1, new Date('2026-07-16T10:02:00.000Z'));
    const counts = persistenceCounts(fixture.database);

    for (let retry = 0; retry < 2; retry += 1) {
      const resumed = service.openOrResume(
        student, 'P1T1-N02', { classroomSessionId: 'demo-class' },
      );
      assert.equal(resumed.state, 'submitted');
      if (resumed.state !== 'submitted') assert.fail('Expected a submitted terminal assessment.');
      assert.equal(resumed.assessmentId, issued.assessmentId);
      assert.equal(resumed.result.assessmentId, issued.assessmentId);
      assert.equal(resumed.result.attemptId, submitted.attemptId);
      assert.equal(Object.hasOwn(resumed, 'attemptToken'), false);
      assert.deepEqual(persistenceCounts(fixture.database), counts);
    }
  } finally {
    fixture.cleanup();
  }
});

function deterministicOptions() {
  let sequence = 0;
  return {
    now: () => new Date('2026-07-16T10:00:00.000Z'),
    randomId: () => `follower-${++sequence}`,
    randomToken: () => `follower-token-${++sequence}-0123456789abcdef`,
  };
}

function readyForFormalAssessment(database: AppDatabase, studentId = student.userId): void {
  const insert = database.prepare(`
    INSERT INTO practice_attempts (
      attempt_id, student_id, activity_id, node_id, passed, origin, attempted_at
    ) VALUES (?, ?, ?, ?, 1, 'user', '1999-12-31T23:59:00.000Z')
  `);
  for (const [activityId, nodeId] of [
    ['P1T1-N01-micro-01', 'P1T1-N01'],
    ['P1T1-N02-foundation-01', 'P1T1-N02'],
    ['P1T1-N02-application-01', 'P1T1-N02'],
    ['P1T1-N02-transfer-01', 'P1T1-N02'],
  ]) insert.run(`follower-ready-${studentId}-${activityId}`, studentId, activityId, nodeId);
}

function openClassroomRun(database: AppDatabase, runId: string): void {
  const lessonRunId = `${runId}-lesson`;
  database.prepare(`
    INSERT INTO classroom_lesson_runs (
      lesson_run_id, session_id, lesson_id, task_id, node_id, status,
      teaching_cursor_json, started_at
    ) VALUES (?, 'demo-class', 'P01-L02', 'P01', 'P1T1-N02', 'active', '{}',
      '2026-07-16T09:55:00.000Z')
  `).run(lessonRunId);
  database.prepare(`
    UPDATE classroom_sessions SET status = 'active', active_lesson_run_id = ?
    WHERE session_id = 'demo-class'
  `).run(lessonRunId);
  database.prepare(`
    INSERT INTO classroom_assessment_runs (
      run_id, lesson_run_id, session_id, node_id, game_id,
      status, started_at, expires_at
    ) VALUES (?, ?, 'demo-class', 'P1T1-N02', 'P1T1-N02-server-assessment',
      'running', '2026-07-16T10:00:00.000Z', '2099-07-16T10:15:00.000Z')
  `).run(runId, lessonRunId);
  for (const studentId of [student.userId, peer.userId]) {
    const assessmentId = `${runId}-provisioned-${studentId}`;
    database.prepare(`
      INSERT INTO formal_assessment_instances (
        assessment_id, session_id, classroom_run_id, node_id, game_id,
        question_version, status, opened_at, expires_at, created_at
      ) VALUES (?, 'demo-class', ?, 'P1T1-N02', 'P1T1-N02-server-assessment',
        'p01-n02-v1', 'running', '2026-07-16T10:00:00.000Z',
        '2099-07-16T10:15:00.000Z', '2026-07-16T10:00:00.000Z')
    `).run(assessmentId, runId);
    database.prepare(`
      INSERT INTO formal_assessment_tokens (
        token_hash, assessment_id, student_id, node_id, question_version,
        issued_at, expires_at
      ) VALUES (?, ?, ?, 'P1T1-N02', 'p01-n02-v1',
        '2026-07-16T10:00:00.000Z', '2099-07-16T10:15:00.000Z')
    `).run(`follower-provision-${runId}-${studentId}`, assessmentId, studentId);
  }
}

function request(method: string, cookie: string, body?: unknown, token?: string): Request {
  return new Request('http://localhost/api/learning/nodes/P1T1-N02/assessment', {
    method,
    headers: {
      cookie,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token === undefined ? {} : { 'x-assessment-token': token }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function routeContext() {
  return { params: { nodeId: 'P1T1-N02' } };
}

function persistenceCounts(database: AppDatabase) {
  const count = (table: string) => database.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get();
  return {
    instances: count('formal_assessment_instances'),
    tokens: count('formal_assessment_tokens'),
    attempts: count('formal_attempts'),
    drafts: count('formal_assessment_drafts'),
  };
}
