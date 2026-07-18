import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthenticatedActor } from './auth/actor.ts';
import { AuthService } from './auth/auth-service.ts';
import { AUTH_COOKIE_NAME } from './auth/cookie.ts';
import { migrateDatabase } from './db/migrations.ts';
import { seedDemo } from './db/demo-seed.ts';
import { createTestDatabase } from './db/test-database.ts';
import { closeDatabase, type AppDatabase } from './db/database.ts';
import { ClassroomSessionRepository } from './classroom-session-repository.ts';
import {
  AssessmentClassroomWindowError,
  AssessmentTokenError,
  FormalAssessmentService,
  type AssessmentAnswers,
} from './formal-assessment-service.ts';
import { FORMAL_ASSESSMENT_BODY_MAX_BYTES } from './formal-assessment-limits.ts';

const studentOne: AuthenticatedActor = {
  userId: 'stu-01', studentId: 'stu-01', username: 'student01',
  displayName: '学生一', role: 'student', classId: 'demo-class',
};
const studentTwo: AuthenticatedActor = {
  ...studentOne, userId: 'stu-02', studentId: 'stu-02',
  username: 'student02', displayName: '学生二',
};
const studentThree: AuthenticatedActor = {
  ...studentOne, userId: 'stu-03', studentId: 'stu-03',
  username: 'student03', displayName: '学生三',
};

const passingAnswers: AssessmentAnswers = {
  evidenceClassification: 'nameplate-photo',
  linkReconstruction: ['source-device', 'source-port', 'cable-label', 'peer-port', 'peer-device'],
  defectiveOutputRevision: ['restore-source', 'add-photo-index', 'record-direction'],
  professionalConclusion: {
    confirmedFact: '设备铭牌可识别，源端口照片清晰，已经确认源设备身份和源端口。',
    evidenceGap: '对端端口照片模糊，当前无法确认对端端口编号。',
    risk: '若直接交付，链路关系可能错误并造成后续配置风险。',
    action: '重新拍摄对端端口并核验编号，补齐照片索引后更新成果表。',
  },
};

test('refresh resumes the same 15-minute assessment and expiry preserves a read-only draft until explicit restart', () => {
  const fixture = createTestDatabase();
  let now = new Date('2026-07-16T10:00:00.000Z');
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    readyForFormalAssessment(fixture.database, studentOne.userId);
    const service = new FormalAssessmentService(fixture.database, {
      ...deterministicOptions(),
      now: () => now,
      tokenTtlMs: 30 * 60_000,
    });

    const first = service.openOrResume(studentOne, 'P1T1-N02');
    assert.equal(first.state, 'in-progress');
    assert.equal(first.serverNow, now.toISOString());
    assert.equal(Date.parse(first.expiresAt) - Date.parse(first.serverNow), 15 * 60_000);
    assert.deepEqual(first.draft, { answers: {}, revision: 0 });
    assert.ok(first.attemptToken);

    const saved = service.saveDraft(
      studentOne,
      first.attemptToken,
      { evidenceClassification: 'nameplate-photo' },
      0,
      'P1T1-N02',
    );
    assert.equal(saved.revision, 1);
    now = new Date('2026-07-16T10:01:00.000Z');

    const resumed = service.openOrResume(studentOne, 'P1T1-N02');
    assert.equal(resumed.assessmentId, first.assessmentId);
    assert.equal(resumed.expiresAt, first.expiresAt);
    assert.notEqual(resumed.attemptToken, first.attemptToken);
    assert.deepEqual(resumed.draft, saved);
    const savedAfterRefresh = service.saveDraft(
      studentOne,
      first.attemptToken,
      {
        evidenceClassification: 'nameplate-photo',
        linkReconstruction: ['source-device', '', '', '', ''],
      },
      1,
      'P1T1-N02',
    );
    assert.equal(savedAfterRefresh.revision, 2);

    now = new Date('2026-07-16T10:15:00.000Z');
    assert.throws(
      () => service.submitAnswers(studentOne, resumed.attemptToken!, passingAnswers),
      (error) => error instanceof AssessmentTokenError && error.code === 'expired-token',
    );
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM formal_attempts WHERE assessment_id = ?
    `).pluck().get(first.assessmentId), 0);
    assert.deepEqual(fixture.database.prepare(`
      SELECT status, closure_reason AS closureReason
      FROM formal_assessment_instances WHERE assessment_id = ?
    `).get(first.assessmentId), { status: 'closed', closureReason: 'expired' });

    const expired = service.openOrResume(studentOne, 'P1T1-N02');
    assert.equal(expired.assessmentId, first.assessmentId);
    assert.equal(expired.state, 'expired');
    assert.equal(expired.attemptToken, undefined);
    assert.deepEqual(expired.draft, savedAfterRefresh);

    const restarted = service.openOrResume(studentOne, 'P1T1-N02', { restart: true });
    assert.notEqual(restarted.assessmentId, first.assessmentId);
    assert.equal(restarted.state, 'in-progress');
    assert.deepEqual(restarted.draft, { answers: {}, revision: 0 });
    assert.deepEqual(
      service.openOrResume(studentOne, 'P1T1-N02').assessmentId,
      restarted.assessmentId,
    );
    assert.deepEqual(fixture.database.prepare(`
      SELECT answers_json AS answersJson, state_revision AS revision
      FROM formal_assessment_drafts WHERE assessment_id = ? AND student_id = ?
    `).get(first.assessmentId, studentOne.studentId), {
      answersJson: JSON.stringify(savedAfterRefresh.answers),
      revision: savedAfterRefresh.revision,
    });
  } finally {
    fixture.cleanup();
  }
});

test('assessment PATCH accepts only answers plus expectedRevision and returns 409 without overwriting on stale CAS', async () => {
  const fixture = createTestDatabase();
  const previousPath = process.env.DGBOOK_SQLITE_PATH;
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    readyForFormalAssessment(fixture.database, studentOne.userId);
    const session = new AuthService(fixture.database).login({ username: 'student01', password: '123456' });
    assert.ok(session);
    process.env.DGBOOK_SQLITE_PATH = fixture.databasePath;
    closeDatabase();
    const route = await import('../app/api/learning/nodes/[nodeId]/assessment/route.ts');
    const cookie = `${AUTH_COOKIE_NAME}=${session.token}`;
    const issuedResponse = route.GET(assessmentRequest('GET', cookie), assessmentRouteContext());
    const issued = await issuedResponse.json() as { attemptToken: string; assessmentId: string };

    const first = await route.PATCH(assessmentRequest('PATCH', cookie, {
      answers: { evidenceClassification: 'nameplate-photo' },
      expectedRevision: 0,
    }, issued.attemptToken), assessmentRouteContext());
    assert.equal(first.status, 200);
    assert.equal((await first.json()).revision, 1);

    const stale = await route.PATCH(assessmentRequest('PATCH', cookie, {
      answers: { evidenceClassification: 'location-photo' },
      expectedRevision: 0,
    }, issued.attemptToken), assessmentRouteContext());
    assert.equal(stale.status, 409);
    assert.deepEqual(fixture.database.prepare(`
      SELECT answers_json AS answersJson, state_revision AS revision
      FROM formal_assessment_drafts WHERE assessment_id = ? AND student_id = 'stu-01'
    `).get(issued.assessmentId), {
      answersJson: JSON.stringify({ evidenceClassification: 'nameplate-photo' }),
      revision: 1,
    });

    const forged = await route.PATCH(assessmentRequest('PATCH', cookie, {
      answers: { evidenceClassification: 'nameplate-photo' },
      expectedRevision: 1,
      score: 100,
    }, issued.attemptToken), assessmentRouteContext());
    assert.equal(forged.status, 400);
  } finally {
    closeDatabase();
    if (previousPath === undefined) delete process.env.DGBOOK_SQLITE_PATH;
    else process.env.DGBOOK_SQLITE_PATH = previousPath;
    fixture.cleanup();
  }
});

test('assessment PATCH rejects unknown options and oversized drafts with zero writes', async () => {
  const fixture = createTestDatabase();
  const previousPath = process.env.DGBOOK_SQLITE_PATH;
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    readyForFormalAssessment(fixture.database, studentOne.userId);
    const session = new AuthService(fixture.database).login({ username: 'student01', password: '123456' });
    assert.ok(session);
    process.env.DGBOOK_SQLITE_PATH = fixture.databasePath;
    closeDatabase();
    const route = await import('../app/api/learning/nodes/[nodeId]/assessment/route.ts');
    const cookie = `${AUTH_COOKIE_NAME}=${session.token}`;
    const issuedResponse = route.GET(assessmentRequest('GET', cookie), assessmentRouteContext());
    const issued = await issuedResponse.json() as { attemptToken: string; assessmentId: string };

    const unknown = await route.PATCH(assessmentRequest('PATCH', cookie, {
      answers: {
        evidenceClassification: 'forged-option',
        linkReconstruction: ['source-device', '', '', '', ''],
      },
      expectedRevision: 0,
    }, issued.attemptToken), assessmentRouteContext());
    assert.equal(unknown.status, 400);

    const oversized = await route.PATCH(assessmentRequest('PATCH', cookie, {
      answers: {
        professionalConclusion: { confirmedFact: 'x'.repeat(70_000) },
      },
      expectedRevision: 0,
    }, issued.attemptToken), assessmentRouteContext());
    assert.equal(oversized.status, 413);
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM formal_assessment_drafts WHERE assessment_id = ?
    `).pluck().get(issued.assessmentId), 0);

    const oversizedSubmission = await route.POST(assessmentRequest('POST', cookie, {
      answers: {
        ...passingAnswers,
        professionalConclusion: {
          ...passingAnswers.professionalConclusion,
          confirmedFact: 'x'.repeat(70_000),
        },
      },
    }, issued.attemptToken), assessmentRouteContext());
    assert.equal(oversizedSubmission.status, 413);
    assert.match(
      (await oversizedSubmission.json() as { error: string }).error,
      /maximum body size/i,
    );
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM formal_attempts WHERE assessment_id = ?
    `).pluck().get(issued.assessmentId), 0);
    assert.deepEqual(fixture.database.prepare(`
      SELECT instance.status, token.used_at AS usedAt
      FROM formal_assessment_instances AS instance
      INNER JOIN formal_assessment_tokens AS token ON token.assessment_id = instance.assessment_id
      WHERE instance.assessment_id = ?
    `).get(issued.assessmentId), { status: 'running', usedAt: null });
  } finally {
    closeDatabase();
    if (previousPath === undefined) delete process.env.DGBOOK_SQLITE_PATH;
    else process.env.DGBOOK_SQLITE_PATH = previousPath;
    fixture.cleanup();
  }
});

test('assessment PATCH and POST stop oversized streamed bodies before parsing or persistence', async () => {
  const fixture = createTestDatabase();
  const previousPath = process.env.DGBOOK_SQLITE_PATH;
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    readyForFormalAssessment(fixture.database, studentOne.userId);
    const session = new AuthService(fixture.database).login({ username: 'student01', password: '123456' });
    assert.ok(session);
    process.env.DGBOOK_SQLITE_PATH = fixture.databasePath;
    closeDatabase();
    const route = await import('../app/api/learning/nodes/[nodeId]/assessment/route.ts');
    const cookie = `${AUTH_COOKIE_NAME}=${session.token}`;
    const before = assessmentPersistenceCounts(fixture.database);
    const chunkBytes = 16 * 1_024;
    const totalBytes = 4 * 1_024 * 1_024;

    for (const method of ['PATCH', 'POST'] as const) {
      for (const declaredLength of [undefined, '1'] as const) {
        const streamed = oversizedAssessmentStream(totalBytes, chunkBytes);
        const request = new Request(
          'http://localhost/api/learning/nodes/P1T1-N02/assessment',
          {
            method,
            headers: {
              cookie,
              'content-type': 'application/json',
              'x-assessment-token': 'unused-stream-token-0123456789abcdef',
              ...(declaredLength === undefined ? {} : { 'content-length': declaredLength }),
            },
            body: streamed.body,
            duplex: 'half',
          } as RequestInit & { duplex: 'half' },
        );

        const response = await route[method](request, assessmentRouteContext());

        assert.equal(response.status, 413, `${method} content-length=${declaredLength ?? 'absent'}`);
        assert.equal(streamed.cancelled(), true, `${method} must cancel the unread stream`);
        assert.ok(
          streamed.pulledBytes() <= FORMAL_ASSESSMENT_BODY_MAX_BYTES + chunkBytes,
          `${method} pulled ${streamed.pulledBytes()} bytes`,
        );
        assert.ok(streamed.pulledBytes() < totalBytes, `${method} must not drain the body`);
        assert.deepEqual(assessmentPersistenceCounts(fixture.database), before);
      }
    }
  } finally {
    closeDatabase();
    if (previousPath === undefined) delete process.env.DGBOOK_SQLITE_PATH;
    else process.env.DGBOOK_SQLITE_PATH = previousPath;
    fixture.cleanup();
  }
});

test('assessment GET exposes an expired read-only draft and requires an explicit strict restart query', async () => {
  const fixture = createTestDatabase();
  const previousPath = process.env.DGBOOK_SQLITE_PATH;
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    readyForFormalAssessment(fixture.database, studentOne.userId);
    const session = new AuthService(fixture.database).login({ username: 'student01', password: '123456' });
    assert.ok(session);
    process.env.DGBOOK_SQLITE_PATH = fixture.databasePath;
    closeDatabase();
    const route = await import('../app/api/learning/nodes/[nodeId]/assessment/route.ts');
    const cookie = `${AUTH_COOKIE_NAME}=${session.token}`;
    const issuedResponse = route.GET(assessmentRequest('GET', cookie), assessmentRouteContext());
    const issued = await issuedResponse.json() as { attemptToken: string; assessmentId: string };
    await route.PATCH(assessmentRequest('PATCH', cookie, {
      answers: { evidenceClassification: 'nameplate-photo' },
      expectedRevision: 0,
    }, issued.attemptToken), assessmentRouteContext());
    fixture.database.prepare(`
      UPDATE formal_assessment_instances SET expires_at = '2000-01-01T00:00:00.000Z'
      WHERE assessment_id = ?
    `).run(issued.assessmentId);
    fixture.database.prepare(`
      UPDATE formal_assessment_tokens SET expires_at = '2000-01-01T00:00:00.000Z'
      WHERE assessment_id = ? AND used_at IS NULL
    `).run(issued.assessmentId);

    const expiredResponse = route.GET(assessmentRequest('GET', cookie), assessmentRouteContext());
    assert.equal(expiredResponse.status, 200);
    const expired = await expiredResponse.json() as Record<string, unknown>;
    assert.equal(expired.state, 'expired');
    assert.equal(Object.hasOwn(expired, 'attemptToken'), false);
    assert.deepEqual(expired.draft, {
      answers: { evidenceClassification: 'nameplate-photo' },
      revision: 1,
      updatedAt: (expired.draft as { updatedAt: string }).updatedAt,
    });

    assert.equal(route.GET(new Request(
      'http://localhost/api/learning/nodes/P1T1-N02/assessment?restart=1',
      { headers: { cookie } },
    ), assessmentRouteContext()).status, 400);
    const restartedResponse = route.GET(new Request(
      'http://localhost/api/learning/nodes/P1T1-N02/assessment?restart=true',
      { headers: { cookie } },
    ), assessmentRouteContext());
    assert.equal(restartedResponse.status, 200);
    const restarted = await restartedResponse.json() as { assessmentId: string; state: string };
    assert.notEqual(restarted.assessmentId, issued.assessmentId);
    assert.equal(restarted.state, 'in-progress');
  } finally {
    closeDatabase();
    if (previousPath === undefined) delete process.env.DGBOOK_SQLITE_PATH;
    else process.env.DGBOOK_SQLITE_PATH = previousPath;
    fixture.cleanup();
  }
});

test('rejects a legacy state_json formal test when no relational assessment run exists', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    readyForFormalAssessment(fixture.database, studentOne.userId);
    const classroom = new ClassroomSessionRepository(fixture.database).readSession('demo-class');
    assert.ok(classroom);
    classroom.state.formalTest = {
      assessmentId: 'AS-P1T1-N02',
      gameId: 'P1T1-N02-server-assessment',
      nodeId: 'P1T1-N02',
      durationSeconds: 900,
      runId: 'legacy-state-json-run',
      status: 'running',
      startedAt: '2026-07-16T01:00:00.000Z',
    };
    fixture.database.prepare(`
      UPDATE classroom_sessions
      SET status = 'active', state_json = ?
      WHERE session_id = 'demo-class'
    `).run(JSON.stringify(classroom.state));
    const service = new FormalAssessmentService(fixture.database, deterministicOptions());

    assert.throws(
      () => service.openOrResume(studentOne, 'P1T1-N02', { classroomSessionId: 'demo-class' }),
      AssessmentClassroomWindowError,
    );
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM formal_assessment_instances WHERE session_id = 'demo-class'
    `).pluck().get(), 0);
  } finally {
    fixture.cleanup();
  }
});

test('binds a classroom paper to the exact relational run and its authoritative expiry', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    readyForFormalAssessment(fixture.database, studentOne.userId);
    openRelationalClassroomAssessmentRun(fixture.database, {
      runId: 'classroom-assessment-live-01',
      expiresAt: '2026-07-16T10:12:00.000Z',
    });
    const service = new FormalAssessmentService(fixture.database, deterministicOptions());

    const issued = service.openOrResume(studentOne, 'P1T1-N02', {
      classroomSessionId: 'demo-class',
    });
    const stored = fixture.database.prepare(`
      SELECT assessment_id AS assessmentId, session_id AS sessionId,
        classroom_run_id AS classroomRunId
      FROM formal_assessment_instances
      WHERE assessment_id = ?
    `).get(issued.assessmentId);

    assert.deepEqual(stored, {
      assessmentId: issued.assessmentId,
      sessionId: 'demo-class',
      classroomRunId: 'classroom-assessment-live-01',
    });
    assert.equal(issued.expiresAt, '2026-07-16T10:12:00.000Z');
    assert.notEqual(issued.assessmentId, 'classroom-assessment-live-01');
  } finally {
    fixture.cleanup();
  }
});

test('classroom assessment GET preserves the bound draft for every terminal run status', async () => {
  const previousPath = process.env.DGBOOK_SQLITE_PATH;
  try {
    for (const terminalStatus of ['closed', 'expired', 'reviewing'] as const) {
      const fixture = createTestDatabase();
      try {
        migrateDatabase(fixture.database);
        seedDemo(fixture.database);
        readyForFormalAssessment(fixture.database, studentOne.userId);
        const runId = `classroom-resume-${terminalStatus}`;
        openRelationalClassroomAssessmentRun(fixture.database, {
          runId,
          expiresAt: '2099-07-16T10:15:00.000Z',
        });
        const session = new AuthService(fixture.database).login({ username: 'student01', password: '123456' });
        assert.ok(session);
        process.env.DGBOOK_SQLITE_PATH = fixture.databasePath;
        closeDatabase();
        const route = await import('../app/api/learning/nodes/[nodeId]/assessment/route.ts');
        const cookie = `${AUTH_COOKIE_NAME}=${session.token}`;
        const issueUrl = 'http://localhost/api/learning/nodes/P1T1-N02/assessment?classroomSessionId=demo-class';
        const issuedResponse = route.GET(new Request(issueUrl, { headers: { cookie } }), assessmentRouteContext());
        assert.equal(issuedResponse.status, 200, terminalStatus);
        const issued = await issuedResponse.json() as { assessmentId: string; attemptToken: string };
        const draftResponse = await route.PATCH(assessmentRequest('PATCH', cookie, {
          answers: { evidenceClassification: 'nameplate-photo' },
          expectedRevision: 0,
        }, issued.attemptToken), assessmentRouteContext());
        assert.equal(draftResponse.status, 200, terminalStatus);

        fixture.database.prepare(`
          UPDATE classroom_assessment_runs SET status = ?
          WHERE run_id = ?
        `).run(terminalStatus, runId);

        const countsBeforeResume = assessmentPersistenceCounts(fixture.database);
        const terminalResponse = route.GET(new Request(issueUrl, { headers: { cookie } }), assessmentRouteContext());
        assert.equal(terminalResponse.status, 200, terminalStatus);
        const terminalPaper = await terminalResponse.json() as Record<string, unknown>;
        assert.equal(terminalPaper.assessmentId, issued.assessmentId, terminalStatus);
        assert.equal(terminalPaper.state, 'expired', terminalStatus);
        assert.equal(Object.hasOwn(terminalPaper, 'attemptToken'), false, terminalStatus);
        assert.deepEqual(
          {
            answers: (terminalPaper.draft as { answers: unknown }).answers,
            revision: (terminalPaper.draft as { revision: number }).revision,
          },
          { answers: { evidenceClassification: 'nameplate-photo' }, revision: 1 },
          terminalStatus,
        );
        assert.deepEqual(assessmentPersistenceCounts(fixture.database), countsBeforeResume, terminalStatus);
        assert.deepEqual(fixture.database.prepare(`
          SELECT status, closure_reason AS closureReason
          FROM formal_assessment_instances WHERE assessment_id = ?
        `).get(issued.assessmentId), { status: 'closed', closureReason: 'expired' }, terminalStatus);
        assert.deepEqual(fixture.database.prepare(`
          SELECT COUNT(*) AS tokenCount,
            SUM(CASE WHEN used_at IS NOT NULL THEN 1 ELSE 0 END) AS consumedCount
          FROM formal_assessment_tokens WHERE assessment_id = ?
        `).get(issued.assessmentId), { tokenCount: 1, consumedCount: 1 }, terminalStatus);
        assert.equal(fixture.database.prepare(`
          SELECT COUNT(*) FROM formal_attempts WHERE assessment_id = ?
        `).pluck().get(issued.assessmentId), 0, terminalStatus);
      } finally {
        closeDatabase();
        fixture.cleanup();
      }
    }
  } finally {
    if (previousPath === undefined) delete process.env.DGBOOK_SQLITE_PATH;
    else process.env.DGBOOK_SQLITE_PATH = previousPath;
  }
});

test('paused classroom assessment GET keeps the running instance and token unchanged', async () => {
  const fixture = createTestDatabase();
  const previousPath = process.env.DGBOOK_SQLITE_PATH;
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    readyForFormalAssessment(fixture.database, studentOne.userId);
    const runId = 'classroom-resume-paused';
    openRelationalClassroomAssessmentRun(fixture.database, {
      runId,
      expiresAt: '2099-07-16T10:15:00.000Z',
    });
    const session = new AuthService(fixture.database).login({ username: 'student01', password: '123456' });
    assert.ok(session);
    process.env.DGBOOK_SQLITE_PATH = fixture.databasePath;
    closeDatabase();
    const route = await import('../app/api/learning/nodes/[nodeId]/assessment/route.ts');
    const cookie = `${AUTH_COOKIE_NAME}=${session.token}`;
    const issueUrl = 'http://localhost/api/learning/nodes/P1T1-N02/assessment?classroomSessionId=demo-class';
    const issuedResponse = route.GET(new Request(issueUrl, { headers: { cookie } }), assessmentRouteContext());
    assert.equal(issuedResponse.status, 200);
    const issued = await issuedResponse.json() as { assessmentId: string; attemptToken: string };
    const draftResponse = await route.PATCH(assessmentRequest('PATCH', cookie, {
      answers: { evidenceClassification: 'nameplate-photo' },
      expectedRevision: 0,
    }, issued.attemptToken), assessmentRouteContext());
    assert.equal(draftResponse.status, 200);
    fixture.database.prepare(`
      UPDATE classroom_assessment_runs SET status = 'paused' WHERE run_id = ?
    `).run(runId);

    const countsBeforeResume = assessmentPersistenceCounts(fixture.database);
    const pausedResponse = route.GET(new Request(issueUrl, { headers: { cookie } }), assessmentRouteContext());
    assert.equal(pausedResponse.status, 200);
    const paused = await pausedResponse.json();
    assert.equal(paused.assessmentId, issued.assessmentId);
    assert.equal(paused.state, 'paused');
    assert.equal(paused.attemptToken, undefined);
    assert.deepEqual(paused.draft.answers, { evidenceClassification: 'nameplate-photo' });
    assert.equal(paused.draft.revision, 1);
    assert.deepEqual(assessmentPersistenceCounts(fixture.database), countsBeforeResume);
    assert.deepEqual(fixture.database.prepare(`
      SELECT status, closure_reason AS closureReason
      FROM formal_assessment_instances WHERE assessment_id = ?
    `).get(issued.assessmentId), { status: 'running', closureReason: null });
    assert.deepEqual(fixture.database.prepare(`
      SELECT COUNT(*) AS tokenCount,
        SUM(CASE WHEN used_at IS NOT NULL THEN 1 ELSE 0 END) AS consumedCount
      FROM formal_assessment_tokens WHERE assessment_id = ?
    `).get(issued.assessmentId), { tokenCount: 1, consumedCount: 0 });
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM formal_attempts WHERE assessment_id = ?
    `).pluck().get(issued.assessmentId), 0);
  } finally {
    closeDatabase();
    if (previousPath === undefined) delete process.env.DGBOOK_SQLITE_PATH;
    else process.env.DGBOOK_SQLITE_PATH = previousPath;
    fixture.cleanup();
  }
});

test('rejects a classroom-bound submission after its shared run has left the active window', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    readyForFormalAssessment(fixture.database, studentOne.userId);
    openRelationalClassroomAssessmentRun(fixture.database, {
      runId: 'classroom-run-closed-before-submit',
      expiresAt: '2026-07-16T10:15:00.000Z',
    });
    const service = new FormalAssessmentService(fixture.database, deterministicOptions());
    const issued = service.openOrResume(studentOne, 'P1T1-N02', {
      classroomSessionId: 'demo-class',
    });

    fixture.database.prepare(`
      UPDATE classroom_assessment_runs
      SET status = 'closed', closed_at = '2026-07-16T10:01:00.000Z',
        closed_reason = 'teacher-collected'
      WHERE run_id = 'classroom-run-closed-before-submit'
    `).run();

    assert.throws(
      () => service.submitAnswers(studentOne, issued.attemptToken!, passingAnswers),
      AssessmentClassroomWindowError,
    );
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM formal_attempts WHERE assessment_id = ?
    `).pluck().get(issued.assessmentId), 0);
  } finally {
    fixture.cleanup();
  }
});

test('one classroom student submission closes only that instance while the shared run and peers remain open', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    readyForFormalAssessment(fixture.database, studentOne.userId);
    readyForFormalAssessment(fixture.database, studentTwo.userId);
    readyForFormalAssessment(fixture.database, studentThree.userId);
    openRelationalClassroomAssessmentRun(fixture.database, {
      runId: 'classroom-three-student-run',
      expiresAt: '2026-07-16T10:15:00.000Z',
    });
    const service = new FormalAssessmentService(fixture.database, deterministicOptions());
    const first = service.openOrResume(studentOne, 'P1T1-N02', { classroomSessionId: 'demo-class' });
    const second = service.openOrResume(studentTwo, 'P1T1-N02', { classroomSessionId: 'demo-class' });
    const third = service.openOrResume(studentThree, 'P1T1-N02', { classroomSessionId: 'demo-class' });

    service.submitAnswers(studentOne, first.attemptToken!, passingAnswers);
    assert.equal(fixture.database.prepare(`
      SELECT status FROM classroom_assessment_runs WHERE run_id = 'classroom-three-student-run'
    `).pluck().get(), 'running');
    const readStatus = fixture.database.prepare(`
      SELECT status FROM formal_assessment_instances WHERE assessment_id = ?
    `).pluck();
    assert.equal(readStatus.get(first.assessmentId), 'closed');
    assert.equal(readStatus.get(second.assessmentId), 'running');
    assert.equal(readStatus.get(third.assessmentId), 'running');
    assert.equal(service.submitAnswers(studentTwo, second.attemptToken!, passingAnswers).passed, true);
    assert.equal(service.submitAnswers(studentThree, third.attemptToken!, passingAnswers).passed, true);
  } finally {
    fixture.cleanup();
  }
});



function deterministicOptions() {
  let sequence = 0;
  return {
    now: () => new Date('2026-07-16T10:00:00.000Z'),
    randomId: () => `assessment-sequence-${++sequence}`,
    randomToken: () => `token-sequence-${++sequence}-0123456789abcdef`,
  };
}

function readyForFormalAssessment(database: AppDatabase, studentId: string): void {
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
  ]) insert.run(`lifecycle-ready-${studentId}-${activityId}`, studentId, activityId, nodeId);
}

function assessmentRequest(method: string, cookie: string, body?: unknown, token?: string): Request {
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

function assessmentRouteContext() {
  return { params: { nodeId: 'P1T1-N02' } };
}

function oversizedAssessmentStream(totalBytes: number, chunkBytes: number) {
  let pulledBytes = 0;
  let wasCancelled = false;
  const invalidPrefix = new TextEncoder().encode('{ definitely-not-json ');
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulledBytes >= totalBytes) {
        controller.close();
        return;
      }
      const size = Math.min(chunkBytes, totalBytes - pulledBytes);
      const chunk = new Uint8Array(size).fill(120);
      if (pulledBytes === 0) chunk.set(invalidPrefix.subarray(0, size));
      pulledBytes += size;
      controller.enqueue(chunk);
    },
    cancel() {
      wasCancelled = true;
    },
  });
  return {
    body,
    cancelled: () => wasCancelled,
    pulledBytes: () => pulledBytes,
  };
}

function assessmentPersistenceCounts(database: AppDatabase) {
  const count = (table: string) => database.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get();
  return {
    instances: count('formal_assessment_instances'),
    tokens: count('formal_assessment_tokens'),
    attempts: count('formal_attempts'),
    drafts: count('formal_assessment_drafts'),
  };
}

function openRelationalClassroomAssessmentRun(
  database: AppDatabase,
  input: { runId: string; expiresAt: string },
): void {
  const lessonRunId = `${input.runId}-lesson`;
  database.prepare(`
    INSERT INTO classroom_lesson_runs (
      lesson_run_id, session_id, lesson_id, task_id, node_id, status,
      teaching_cursor_json, started_at
    ) VALUES (?, 'demo-class', 'P01-L02', 'P01', 'P1T1-N02', 'active', '{}',
      '2026-07-16T09:55:00.000Z')
  `).run(lessonRunId);
  database.prepare(`
    UPDATE classroom_sessions
    SET status = 'active', active_lesson_run_id = ?
    WHERE session_id = 'demo-class'
  `).run(lessonRunId);
  database.prepare(`
    INSERT INTO classroom_assessment_runs (
      run_id, lesson_run_id, session_id, node_id, game_id,
      status, started_at, expires_at
    ) VALUES (?, ?, 'demo-class', 'P1T1-N02', 'P1T1-N02-server-assessment',
      'running', '2026-07-16T10:00:00.000Z', ?)
  `).run(input.runId, lessonRunId, input.expiresAt);
}
