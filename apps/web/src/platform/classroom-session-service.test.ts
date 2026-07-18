import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthenticatedActor } from './auth/actor.ts';
import { ClassroomSessionService } from './classroom-session-service.ts';
import { seedDemo } from './db/demo-seed.ts';
import { migrateDatabase } from './db/migrations.ts';
import { createTestDatabase } from './db/test-database.ts';
import { ClassroomSessionRepository } from './classroom-session-repository.ts';
import { ClassroomRosterRepository } from './classroom-roster-repository.ts';
import { getNodeLearningPolicy } from './learning-policy.ts';
import { FormalAssessmentService, type AssessmentAnswers } from './formal-assessment-service.ts';
import { createInitialTeachingCursor } from './teaching-cursor.ts';

const teacher: AuthenticatedActor = {
  userId: 'teacher-01',
  username: 'teacher01',
  displayName: '张老师',
  role: 'teacher',
  classId: 'demo-class',
};

const student: AuthenticatedActor = {
  userId: 'stu-01',
  username: 'student01',
  displayName: '学生一',
  role: 'student',
  classId: 'demo-class',
  studentId: 'stu-01',
};

test('authorizes exact SQLite membership and returns role-scoped projections of one session', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const service = new ClassroomSessionService(
      new ClassroomSessionRepository(fixture.database),
      new ClassroomRosterRepository(fixture.database),
    );

    const teacherSession = service.read(teacher, 'demo-class');
    const studentSession = service.read(student, 'demo-class');

    assert.ok(teacherSession);
    assert.ok(studentSession);
    assert.equal(teacherSession.sessionId, 'demo-class');
    assert.equal(teacherSession.sessionStatus, 'paused');
    assert.equal(teacherSession.activeNodeId, 'P1T1-N02');
    assert.equal(teacherSession.studentRoster.length, 3);
    assert.deepEqual(studentSession.studentRoster, []);
    assert.equal(studentSession.studentProgress?.studentId, 'stu-01');
    assert.throws(
      () => service.read({ ...student, userId: 'stu-missing', studentId: 'stu-missing' }, 'demo-class'),
      { name: 'ClassroomAuthorizationError' },
    );
    assert.equal(service.read(teacher, 'P1T1-N02'), undefined);
  } finally {
    fixture.cleanup();
  }
});

test('allows only the owning teacher to apply a revision-checked lesson intent', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    seedActiveLessonRun(fixture.database);
    const service = new ClassroomSessionService(
      new ClassroomSessionRepository(fixture.database),
      new ClassroomRosterRepository(fixture.database),
    );

    assert.throws(
      () => service.applyTeacherIntent(student, 'demo-class', { type: 'phase_changed', phase: 'lecture' }, 0),
      { name: 'ClassroomAuthorizationError' },
    );
    const result = service.applyTeacherIntent(
      teacher,
      'demo-class',
      { type: 'phase_changed', phase: 'question' },
      0,
      new Date('2026-07-16T02:00:00.000Z'),
    );

    assert.equal(result.session.lessonState?.phase, 'question');
    assert.equal(result.session.sessionStatus, 'active');
    assert.equal(result.session.lessonState?.revision, 1);
    assert.equal(result.command.revision, 1);
    assert.equal(result.session.activeLessonRunId, 'service-test-lesson-run');
  } finally {
    fixture.cleanup();
  }
});

test('starts a formal assessment with a server-owned shared run identity and server timestamp', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    seedActiveLessonRun(fixture.database);
    const repository = new ClassroomSessionRepository(fixture.database);
    const service = new ClassroomSessionService(
      repository,
      new ClassroomRosterRepository(fixture.database),
    );
    const now = new Date('2026-07-16T04:00:00.000Z');
    repository.recordHeartbeat('demo-class', {
      deviceId: 'student-live-01',
      actorRole: 'student',
      studentId: 'stu-01',
      pageState: 'ready',
      lastAppliedRevision: 0,
    }, now);
    service.applyTeacherIntent(
      teacher,
      'demo-class',
      { type: 'phase_changed', phase: 'question' },
      0,
      now,
    );
    const current = service.read(teacher, 'demo-class', 'actor', now);
    assert.ok(current?.formalTest);

    const started = service.patchTeacherState(teacher, 'demo-class', {
      formalTest: {
        ...current.formalTest,
        runId: 'forged-client-run',
        gameId: 'forged-client-game',
        status: 'running',
        startedAt: '1999-01-01T00:00:00.000Z',
      },
    }, 1, now);

    assert.match(started.formalTest?.runId ?? '', /^classroom-run-/);
    assert.notEqual(started.formalTest?.runId, 'forged-client-run');
    assert.equal(started.formalTest?.startedAt, now.toISOString());
    assert.equal(started.formalTest?.gameId, 'P1T1-N02-server-assessment');
    assert.equal(started.formalTest?.status, 'running');
    const stored = repository.readSession('demo-class');
    assert.equal(stored?.state.formalTest?.runId, started.formalTest?.runId);
  } finally {
    fixture.cleanup();
  }
});

test('rejects synchronized page and follow mutations while every classroom helper is offline', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const service = new ClassroomSessionService(
      new ClassroomSessionRepository(fixture.database),
      new ClassroomRosterRepository(fixture.database),
    );

    assert.throws(
      () => service.patchTeacherState(teacher, 'demo-class', {
        currentPageId: 'P1-STUDENT-FOLLOW-N01',
        teacherSlideId: 'P1T1-N02-S02',
        teacherSlideIndex: 2,
        studentSyncState: 'requested',
      }, 0, new Date('2026-07-16T04:00:00.000Z')),
      { name: 'ClassroomHelperUnavailableError' },
    );
    assert.throws(
      () => service.applyTeacherIntent(
        teacher,
        'demo-class',
        { type: 'playback_seeked', positionMs: 1_500 },
        0,
        new Date('2026-07-16T04:00:00.000Z'),
      ),
      { name: 'ClassroomHelperUnavailableError' },
    );
    assert.equal(fixture.database.prepare(`
      SELECT revision FROM classroom_sessions WHERE session_id = 'demo-class'
    `).pluck().get(), 0);
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM classroom_commands WHERE session_id = 'demo-class'
    `).pluck().get(), 0);
  } finally {
    fixture.cleanup();
  }
});

test('blocks review at zero real submissions and opens it after one valid submission in the active run', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    seedActiveLessonRun(fixture.database);
    readyForFormalAssessment(fixture.database, 'stu-01');
    const repository = new ClassroomSessionRepository(fixture.database);
    const service = new ClassroomSessionService(
      repository,
      new ClassroomRosterRepository(fixture.database),
    );
    const now = new Date('2026-07-16T04:00:00.000Z');
    repository.recordHeartbeat('demo-class', {
      deviceId: 'student-live-review',
      actorRole: 'student',
      studentId: 'stu-01',
      pageState: 'ready',
      lastAppliedRevision: 0,
    }, now);
    service.applyTeacherIntent(teacher, 'demo-class', { type: 'phase_changed', phase: 'practice' }, 0, now);
    service.applyTeacherIntent(teacher, 'demo-class', { type: 'phase_changed', phase: 'challenge' }, 1, now);
    const before = service.read(teacher, 'demo-class', 'actor', now);
    assert.ok(before?.formalTest);
    const running = service.patchTeacherState(teacher, 'demo-class', {
      formalTest: { ...before.formalTest, status: 'running' },
    }, 2, now);
    assert.ok(running.formalTest?.runId);
    openRelationalAssessmentRun(
      fixture.database,
      running.formalTest.runId,
      '2026-07-16T04:00:00.000Z',
      '2026-07-16T04:15:00.000Z',
    );

    assert.throws(
      () => service.applyTeacherIntent(
        teacher,
        'demo-class',
        { type: 'phase_changed', phase: 'review' },
        3,
        new Date('2026-07-16T04:01:00.000Z'),
      ),
      { name: 'ClassroomReviewUnavailableError' },
    );
    assert.equal(repository.readSession('demo-class')?.revision, 3);

    let sequence = 0;
    const assessment = new FormalAssessmentService(fixture.database, {
      now: () => new Date('2026-07-16T04:01:30.000Z'),
      randomId: () => `review-${++sequence}`,
      randomToken: () => `review-token-${++sequence}-0123456789abcdef`,
    });
    const issued = assessment.issuePaper(student, 'P1T1-N02', {
      classroomSessionId: 'demo-class',
    });
    assessment.submitAnswers(student, issued.attemptToken, wrongAssessmentAnswers());

    const review = service.applyTeacherIntent(
      teacher,
      'demo-class',
      { type: 'phase_changed', phase: 'review' },
      3,
      new Date('2026-07-16T04:02:00.000Z'),
    );
    assert.equal(review.session.lessonState?.phase, 'review');
    assert.equal(review.session.reviewState, 'not_started');
  } finally {
    fixture.cleanup();
  }
});

test('applies projector page changes through one server revision and fails closed at page or helper boundaries', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    seedActiveLessonRun(fixture.database);
    const repository = new ClassroomSessionRepository(fixture.database);
    const service = new ClassroomSessionService(
      repository,
      new ClassroomRosterRepository(fixture.database),
    );
    const now = new Date('2026-07-16T05:00:00.000Z');
    repository.recordHeartbeat('demo-class', {
      deviceId: 'student-projector-control',
      actorRole: 'student',
      studentId: 'stu-01',
      pageState: 'ready',
      lastAppliedRevision: 0,
    }, now);
    const lastPage = service.applyTeacherIntent(
      teacher,
      'demo-class',
      { type: 'page_changed', pageIndex: 11 },
      0,
      now,
    );
    assert.equal(lastPage.session.lessonState?.playback.actionIndex, 11);
    assert.equal(lastPage.session.teacherSlideIndex, 12);
    assert.equal(lastPage.session.teacherSlideId, 'P1T1-N02-S12');
    assert.equal(lastPage.command.revision, 1);

    assert.throws(
      () => service.applyTeacherIntent(
        teacher,
        'demo-class',
        { type: 'page_changed', pageIndex: 12 },
        1,
        now,
      ),
      { name: 'ClassroomIntentError' },
    );
    assert.equal(repository.readSession('demo-class')?.revision, 1);
    assert.throws(
      () => service.applyTeacherIntent(
        teacher,
        'demo-class',
        { type: 'page_changed', pageIndex: 10 },
        1,
        new Date('2026-07-16T05:00:10.000Z'),
      ),
      { name: 'ClassroomHelperUnavailableError' },
    );
    assert.equal(repository.readSession('demo-class')?.revision, 1);
  } finally {
    fixture.cleanup();
  }
});

test('fails closed without a revision or command when a classroom is closed', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    fixture.database.prepare(`
      UPDATE classroom_sessions SET status = 'closed' WHERE session_id = 'demo-class'
    `).run();
    const service = new ClassroomSessionService(
      new ClassroomSessionRepository(fixture.database),
      new ClassroomRosterRepository(fixture.database),
    );

    assert.throws(
      () => service.applyTeacherIntent(
        teacher,
        'demo-class',
        { type: 'phase_changed', phase: 'lecture' },
        0,
      ),
      { name: 'ClassroomIntentError' },
    );
    assert.equal(fixture.database.prepare(`
      SELECT revision FROM classroom_sessions WHERE session_id = 'demo-class'
    `).pluck().get(), 0);
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM classroom_commands WHERE session_id = 'demo-class'
    `).pluck().get(), 0);
  } finally {
    fixture.cleanup();
  }
});

test('rejects an unpublished node or mismatched unit before teacher CAS', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const service = new ClassroomSessionService(
      new ClassroomSessionRepository(fixture.database),
      new ClassroomRosterRepository(fixture.database),
    );

    for (const patch of [
      { activeNodeId: 'P9T9-N99', activeUnitId: 'P99-ku-99' },
      { activeNodeId: 'P1T1-N03', activeUnitId: 'P01-ku-99' },
    ]) {
      assert.throws(
        () => service.patchTeacherState(teacher, 'demo-class', patch, 0),
        { name: 'ClassroomIntentError' },
      );
    }
    assert.equal(fixture.database.prepare(`
      SELECT revision FROM classroom_sessions WHERE session_id = 'demo-class'
    `).pluck().get(), 0);
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM classroom_commands WHERE session_id = 'demo-class'
    `).pluck().get(), 0);
  } finally {
    fixture.cleanup();
  }
});

test('startLesson prepares one authoritative run and lifecycle start activates it', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const service = new ClassroomSessionService(
      new ClassroomSessionRepository(fixture.database),
      new ClassroomRosterRepository(fixture.database),
    );
    const prepared = service.startLesson(
      teacher,
      'demo-class',
      { lessonId: 'P01-L1', expectedRevision: 0 },
      new Date('2026-07-16T03:02:00.000Z'),
    );
    assert.equal(prepared.session.sessionStatus, 'preparing');
    assert.equal(prepared.session.lessonRunStatus, 'preparing');
    assert.ok(prepared.session.activeLessonRunId);
    assert.equal(prepared.session.teachingCursor?.lessonId, 'P01-L1');
    assert.equal(prepared.session.lessonState?.revision, 1);

    const active = service.executeLessonLifecycle(
      teacher,
      'demo-class',
      prepared.session.activeLessonRunId!,
      { type: 'start', expectedRevision: 1 },
      new Date('2026-07-16T03:03:00.000Z'),
    );
    assert.equal(active.session.sessionStatus, 'active');
    assert.equal(active.session.lessonRunStatus, 'active');
    assert.equal(active.session.lessonState?.revision, 2);
  } finally {
    fixture.cleanup();
  }
});

test('startLesson rejects unknown and unpublished nodes without mutating SQLite', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const repository = new ClassroomSessionRepository(fixture.database);
    const roster = new ClassroomRosterRepository(fixture.database);
    const published = getNodeLearningPolicy('P1T1-N02');
    assert.ok(published);
    const unknownService = new ClassroomSessionService(repository, roster);
    const unpublishedService = new ClassroomSessionService(
      repository,
      roster,
      (nodeId) => nodeId === published.nodeId
        ? { ...published, publicationStatus: 'not-open' }
        : getNodeLearningPolicy(nodeId),
    );

    assert.throws(
      () => unknownService.startLesson(
        teacher,
        'demo-class',
        { nodeId: 'P9T9-N99', expectedRevision: 0 },
      ),
      { name: 'ClassroomIntentError' },
    );
    assert.throws(
      () => unpublishedService.startLesson(
        teacher,
        'demo-class',
        { lessonId: 'P01-L2', expectedRevision: 0 },
      ),
      { name: 'ClassroomIntentError' },
    );
    assert.equal(fixture.database.prepare(`
      SELECT revision FROM classroom_sessions WHERE session_id = 'demo-class'
    `).pluck().get(), 0);
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM classroom_commands WHERE session_id = 'demo-class'
    `).pluck().get(), 0);
  } finally {
    fixture.cleanup();
  }
});

test('startLesson rejects a student and a stale teacher revision without overwriting the live lesson', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const service = new ClassroomSessionService(
      new ClassroomSessionRepository(fixture.database),
      new ClassroomRosterRepository(fixture.database),
    );

    assert.throws(
      () => service.startLesson(
        student,
        'demo-class',
        { nodeId: 'P1T1-N02', expectedRevision: 0 },
      ),
      { name: 'ClassroomAuthorizationError' },
    );
    const first = service.startLesson(
      teacher,
      'demo-class',
      { nodeId: 'P1T1-N03', expectedRevision: 0 },
    );
    assert.equal(first.session.lessonState?.revision, 1);
    assert.throws(
      () => service.startLesson(
        teacher,
        'demo-class',
        { nodeId: 'P1T1-N02', expectedRevision: 0 },
      ),
      (error: unknown) => (
        error instanceof Error
        && error.name === 'ClassroomLessonRunRevisionConflictError'
        && 'currentRevision' in error
        && error.currentRevision === 1
      ),
    );
    assert.deepEqual(fixture.database.prepare(`
      SELECT active_node_id AS activeNodeId, active_unit_id AS activeUnitId, revision
      FROM classroom_sessions WHERE session_id = 'demo-class'
    `).get(), {
      activeNodeId: 'P1T1-N02',
      activeUnitId: 'P01-ku-02',
      revision: 1,
    });
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM classroom_commands WHERE session_id = 'demo-class'
    `).pluck().get(), 1);
  } finally {
    fixture.cleanup();
  }
});

test('startLesson returns the new-node roster projection while preserving each participation mode', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const service = new ClassroomSessionService(
      new ClassroomSessionRepository(fixture.database),
      new ClassroomRosterRepository(fixture.database),
    );
    const before = service.read(teacher, 'demo-class');
    assert.ok(before);
    const modes = before.studentRoster.map(({ studentId, mode }) => ({ studentId, mode }));

    const result = service.startLesson(
      teacher,
      'demo-class',
      { nodeId: 'P1T1-N03', expectedRevision: 0 },
    );
    const fresh = service.read(teacher, 'demo-class');

    assert.ok(fresh);
    assert.deepEqual(result.session.studentRoster, fresh.studentRoster);
    assert.deepEqual(
      result.session.studentRoster.map(({ studentId, mode }) => ({ studentId, mode })),
      modes,
    );
    assert.equal(result.session.studentRoster.every(({ activeNodeId }) => activeNodeId === 'P1T1-N02'), true);
  } finally {
    fixture.cleanup();
  }
});

function readyForFormalAssessment(database: ReturnType<typeof createTestDatabase>['database'], studentId: string): void {
  const insert = database.prepare(`
    INSERT INTO practice_attempts (
      attempt_id, student_id, activity_id, node_id, passed, origin, attempted_at
    ) VALUES (?, ?, ?, ?, 1, 'user', '2026-07-16T03:30:00.000Z')
  `);
  for (const [activityId, nodeId] of [
    ['P1T1-N01-micro-01', 'P1T1-N01'],
    ['P1T1-N02-foundation-01', 'P1T1-N02'],
    ['P1T1-N02-application-01', 'P1T1-N02'],
    ['P1T1-N02-transfer-01', 'P1T1-N02'],
  ] as const) insert.run(`ready-${studentId}-${activityId}`, studentId, activityId, nodeId);
}

function wrongAssessmentAnswers(): AssessmentAnswers {
  return {
    evidenceClassification: 'environment-note',
    linkReconstruction: ['peer-device', 'peer-port', 'cable-label', 'source-port', 'source-device'],
    defectiveOutputRevision: ['erase-gap'],
    professionalConclusion: {
      confirmedFact: '未说明', evidenceGap: '未说明', risk: '未说明', action: '未说明',
    },
  };
}

function seedActiveLessonRun(database: ReturnType<typeof createTestDatabase>['database']): string {
  const lessonRunId = 'service-test-lesson-run';
  const base = createInitialTeachingCursor({
    lessonRunId,
    lessonId: 'P01-L1',
    revision: 0,
    now: new Date('2026-07-16T01:00:00.000Z'),
  });
  const cursor = {
    ...base,
    nodeId: 'P1T1-N02',
    unitId: 'P01-ku-02',
    actionId: 'P1T1-N02-S01',
  };
  database.prepare(`
    INSERT INTO classroom_lesson_runs (
      lesson_run_id, session_id, lesson_id, task_id, node_id, status,
      teaching_cursor_json, revision, started_at, created_at
    ) VALUES (?, 'demo-class', 'P01-L1', 'P01', 'P1T1-N02', 'active', ?, 0,
      '2026-07-16T01:00:00.000Z', '2026-07-16T01:00:00.000Z')
  `).run(lessonRunId, JSON.stringify(cursor));
  database.prepare(`
    UPDATE classroom_sessions
    SET status = 'active', active_lesson_run_id = ?
    WHERE session_id = 'demo-class'
  `).run(lessonRunId);
  return lessonRunId;
}

function openRelationalAssessmentRun(
  database: ReturnType<typeof createTestDatabase>['database'],
  runId: string,
  startedAt: string,
  expiresAt: string,
): void {
  const lessonRunId = database.prepare(`
    SELECT active_lesson_run_id FROM classroom_sessions WHERE session_id = 'demo-class'
  `).pluck().get() as string;
  assert.ok(lessonRunId);
  database.prepare(`
    INSERT INTO classroom_assessment_runs (
      run_id, lesson_run_id, session_id, node_id, game_id,
      status, started_at, expires_at
    ) VALUES (?, ?, 'demo-class', 'P1T1-N02', 'P1T1-N02-server-assessment',
      'running', ?, ?)
  `).run(runId, lessonRunId, startedAt, expiresAt);
}
