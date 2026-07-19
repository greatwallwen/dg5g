import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthenticatedActor } from './auth/actor.ts';
import { ClassroomParticipationRepository } from './classroom-participation-repository.ts';
import {
  provisionClassroomAssessmentParticipants,
  startActiveLessonRun,
} from './classroom-lesson-run-test-fixture.ts';
import { ClassroomLessonRunRepository } from './classroom-lesson-run-repository.ts';
import { ClassroomSessionRepository } from './classroom-session-repository.ts';
import { seedDemo } from './db/demo-seed.ts';
import { migrateDatabase } from './db/migrations.ts';
import { createTestDatabase } from './db/test-database.ts';
import { LearningRepository } from './learning-repository.ts';
import {
  FormalAssessmentService,
  type AssessmentAnswers,
  type AssessmentPaper,
} from './formal-assessment-service.ts';
import {
  AuthoritativeSnapshotAuthorizationError,
  AuthoritativeSnapshotReader,
  type AuthoritativeSnapshot,
} from './authoritative-snapshot.ts';

const now = new Date('2026-07-16T01:20:00.000Z');

test('one authoritative transaction yields identical common facts and audience-safe cuts', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const reader = new AuthoritativeSnapshotReader(fixture.database);
    const student = reader.read(studentActor('stu-01'), 'student', { now });
    const teacher = reader.read(teacherActor(), 'teacher', { now });
    const projector = reader.read(teacherActor(), 'projector', { now });
    const studentGraph = reader.read(studentActor('stu-01'), 'graph', { now });
    const teacherGraph = reader.read(teacherActor(), 'graph', { now });

    const expectedVersion = fixture.database.prepare(`
      SELECT version FROM snapshot_versions WHERE topic = 'global'
    `).pluck().get();
    assert.equal(student.snapshotVersion, expectedVersion);
    assert.deepEqual(commonOf(student), commonOf(teacher));
    assert.deepEqual(commonOf(student), commonOf(projector));
    assert.deepEqual(commonOf(student), commonOf(studentGraph));
    assert.deepEqual(commonOf(student), commonOf(teacherGraph));
    assert.deepEqual(student.membership, { classSize: 3, joinedCount: 0, followingCount: 0 });
    assert.equal(student.classroom.sessionId, 'demo-class');
    assert.equal(student.classroom.activeNodeId, 'P1T1-N02');
    assert.deepEqual(student.helper, {
      status: 'offline',
      observedAt: now.toISOString(),
      onlineStudentDeviceCount: 0,
      commandDelivery: { applied: 0, pending: 0, failed: 0 },
      canPush: false,
    });

    assert.equal(student.audience, 'student');
    assert.equal(student.participation, null);
    assert.equal(student.me.studentId, 'stu-01');
    assert.equal(student.me.learning.studentId, 'stu-01');
    assert.equal(student.me.learning.version, student.me.studentVersion);
    assert.equal(
      student.me.learning.nodes.find(({ nodeId }) => nodeId === 'P1T1-N02')?.bestFormalScore,
      undefined,
    );
    assert.equal(student.me.nodes.find(({ nodeId }) => nodeId === 'P1T1-N02')?.nodeTestHighestScore, undefined);
    assert.equal('students' in student, false);
    assert.equal('participation' in teacher, false);
    assert.equal('participation' in projector, false);
    assert.equal('participation' in studentGraph, false);
    assert.equal('participation' in teacherGraph, false);

    assert.equal(teacher.audience, 'teacher');
    assert.deepEqual(teacher.students.map(({ studentId }) => studentId), ['stu-01', 'stu-02', 'stu-03']);
    assert.equal(teacher.students[0]?.nodes.length, 12);
    assert.equal(teacher.students.some((detail) => 'learning' in detail), false);

    assert.equal(studentGraph.audience, 'graph');
    assert.equal(studentGraph.mode, 'student');
    assert.equal(studentGraph.me.studentId, 'stu-01');
    assert.equal(teacherGraph.audience, 'graph');
    assert.equal(teacherGraph.mode, 'teacher');
    assert.equal(teacherGraph.nodeHeatmap.length, 12);
    assert.deepEqual(
      teacherGraph.tasks.map(({ taskId, taskCompositeScore, origin }) => ({
        taskId,
        taskCompositeScore,
        origin,
      })),
      [
        { taskId: 'P01', taskCompositeScore: 94, origin: 'demo' },
        { taskId: 'P02', taskCompositeScore: 92, origin: 'demo' },
        { taskId: 'P03', taskCompositeScore: 91, origin: 'demo' },
      ],
    );

    assert.equal(projector.audience, 'projector');
    assertProjectorContainsNoPersonalData(projector);
  } finally {
    fixture.cleanup();
  }
});

test('score and submission fields keep their distinct authoritative meanings', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const snapshot = new AuthoritativeSnapshotReader(fixture.database)
      .read(teacherActor(), 'teacher', { now });

    assert.deepEqual(snapshot.submissions.classroomActivity, {
      submittedCount: 0,
      submissionPercent: 0,
    });
    assert.deepEqual(snapshot.submissions.activeAssessment, {
      status: 'idle',
      eligibleCount: 3,
      submittedCount: 0,
      playingCount: 0,
      passedCount: 0,
      submissionPercent: 0,
      canBeginReview: false,
    });
    assert.deepEqual(snapshot.submissions.professionalOutputs, {
      submittedAwaitingReviewCount: 0,
      returnedCount: 1,
      verifiedCount: 3,
    });
    assert.deepEqual(snapshot.classScores, {
      activeTaskCompositeAverageScore: 94,
      projectCompositeAverageScore: 92,
      distribution: [
        { range: '90-100', count: 0 },
        { range: 'pass-89', count: 0 },
        { range: '60-below-pass', count: 0 },
        { range: 'below-60', count: 0 },
      ],
      demoData: true,
    });
    assert.equal(snapshot.students[0]?.nodes.every(({ origin }) => origin === undefined), true);
    assert.equal(snapshot.students[1]?.nodes.find(({ nodeId }) => nodeId === 'P1T1-N04')?.origin, undefined);
    assert.equal(snapshot.students[2]?.tasks.every(({ origin }) => origin === 'demo'), true);
  } finally {
    fixture.cleanup();
  }
});

test('one classroom cut exposes server time and the exact active lesson cursor', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const lesson = startActiveLessonRun(fixture.database, 'demo-class', {
      lessonId: 'P01-L2',
      now: new Date('2026-07-16T01:10:00.000Z'),
    });

    const snapshot = new AuthoritativeSnapshotReader(fixture.database)
      .read(teacherActor(), 'teacher', { now });

    assert.equal(snapshot.serverNow, now.toISOString());
    assert.deepEqual(snapshot.classroom.activeLesson, {
      runId: lesson.lessonRunId,
      lessonId: 'P01-L2',
      status: 'active',
      revision: lesson.revision,
      cursor: lesson.teachingCursor,
      pageCount: 6,
    });
    assert.equal(snapshot.classroom.revision, lesson.revision);
    assert.equal(snapshot.classroom.activeLesson.cursor.revision, lesson.revision);
  } finally {
    fixture.cleanup();
  }
});

test('one classroom cut rejects a classroom revision that diverges from its lesson cursor', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    startActiveLessonRun(fixture.database, 'demo-class');
    fixture.database.prepare(`
      UPDATE classroom_sessions SET revision = revision + 1
      WHERE session_id = 'demo-class'
    `).run();

    assert.throws(
      () => new AuthoritativeSnapshotReader(fixture.database)
        .read(teacherActor(), 'teacher', { now }),
      /Invalid active lesson run|revisions are incoherent/,
    );
  } finally {
    fixture.cleanup();
  }
});

test('one classroom cut rejects an assessment bound to the active lesson with mismatched node facts', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const lesson = startActiveLessonRun(fixture.database, 'demo-class');
    fixture.database.prepare(`
      INSERT INTO classroom_assessment_runs (
        run_id, lesson_run_id, session_id, node_id, game_id,
        status, started_at, expires_at
      ) VALUES (
        'assessment-incoherent', ?, 'demo-class', 'P1T1-N03',
        'P1T1-N02-server-assessment', 'running', ?, ?
      )
    `).run(
      lesson.lessonRunId,
      '2026-07-16T01:10:00.000Z',
      '2026-07-16T01:25:00.000Z',
    );

    assert.throws(
      () => new AuthoritativeSnapshotReader(fixture.database)
        .read(teacherActor(), 'teacher', { now }),
      /assessment run is incoherent with the active lesson cut/,
    );
  } finally {
    fixture.cleanup();
  }
});

test('a completed assessment from an earlier lesson node does not poison the new active node cut', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const lesson = openRelationalAssessmentRun(
      fixture.database,
      'assessment-finished-old-node',
      '2026-07-16T01:10:00.000Z',
      '2026-07-16T01:19:00.000Z',
    );
    fixture.database.prepare(`
      UPDATE classroom_assessment_runs
      SET status = 'closed', closed_at = ?, closed_reason = 'teacher-collected',
        revision = revision + 1
      WHERE run_id = 'assessment-finished-old-node'
    `).run('2026-07-16T01:18:00.000Z');
    new ClassroomLessonRunRepository(fixture.database).updateTeachingCursor({
      sessionId: 'demo-class',
      lessonRunId: lesson.lessonRunId,
      expectedRevision: lesson.revision,
      next: {
        ...lesson.teachingCursor,
        nodeId: 'P1T1-N03',
        unitId: 'P01-ku-03',
        pageId: 'P01-L2-P03',
        pageIndex: 2,
        phase: 'lecture',
        actionId: 'P1T1-N03-S03',
        actionIndex: 2,
      },
    }, new Date('2026-07-16T01:19:00.000Z'));

    const snapshot = new AuthoritativeSnapshotReader(fixture.database)
      .read(teacherActor(), 'teacher', { now });

    assert.equal(snapshot.classroom.activeNodeId, 'P1T1-N03');
    assert.deepEqual(snapshot.submissions.activeAssessment, {
      status: 'idle',
      eligibleCount: 3,
      submittedCount: 0,
      playingCount: 0,
      passedCount: 0,
      submissionPercent: 0,
      canBeginReview: false,
    });
  } finally {
    fixture.cleanup();
  }
});

test('classroom activity metrics count only the exact active lesson run', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const lessonRuns = new ClassroomLessonRunRepository(fixture.database);
    const oldRun = startActiveLessonRun(fixture.database, 'demo-class');
    lessonRuns.transitionLessonRun({
      sessionId: 'demo-class',
      lessonRunId: oldRun.lessonRunId,
      expectedRevision: oldRun.revision,
      nextStatus: 'closed',
    });
    const activeRun = startActiveLessonRun(fixture.database, 'demo-class');
    fixture.database.prepare(`
      INSERT INTO practice_attempts (
        attempt_id, student_id, activity_id, node_id, passed, origin,
        delivery_channel, classroom_session_id, classroom_run_id, attempt_number
      ) VALUES (
        'snapshot-practice-old', 'stu-01', 'P1T1-N02-foundation-01', 'P1T1-N02',
        1, 'user', 'classroom', 'demo-class', ?, 1
      )
    `).run(oldRun.lessonRunId);

    const reader = new AuthoritativeSnapshotReader(fixture.database);
    assert.equal(reader.read(teacherActor(), 'teacher', { now })
      .submissions.classroomActivity.submittedCount, 0);

    fixture.database.prepare(`
      INSERT INTO practice_attempts (
        attempt_id, student_id, activity_id, node_id, passed, origin,
        delivery_channel, classroom_session_id, classroom_run_id, attempt_number
      ) VALUES (
        'snapshot-practice-active', 'stu-01', 'P1T1-N02-foundation-01', 'P1T1-N02',
        1, 'user', 'classroom', 'demo-class', ?, 2
      )
    `).run(activeRun.lessonRunId);
    assert.equal(reader.read(teacherActor(), 'teacher', { now })
      .submissions.classroomActivity.submittedCount, 1);
  } finally {
    fixture.cleanup();
  }
});

test('historical demo attempts never enter active assessment submission statistics', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const classroom = new ClassroomSessionRepository(fixture.database).readSession('demo-class');
    assert.ok(classroom);
    classroom.state.formalTest = {
      assessmentId: 'demo-assessment-stu-03-p01',
      runId: 'classroom-run-historical-proof',
      gameId: 'p01-n02-formal',
      nodeId: 'P1T1-N02',
      status: 'running',
      durationSeconds: 300,
      startedAt: '2026-07-16T00:30:00.000Z',
    };
    fixture.database.prepare(`
      UPDATE classroom_sessions SET status = 'active', state_json = ?
      WHERE session_id = 'demo-class'
    `).run(JSON.stringify(classroom.state));
    const snapshot = new AuthoritativeSnapshotReader(fixture.database).read(
      teacherActor(),
      'teacher',
      { now },
    );
    assert.deepEqual(snapshot.submissions.activeAssessment, {
      status: 'idle',
      eligibleCount: 3,
      submittedCount: 0,
      playingCount: 0,
      passedCount: 0,
      submissionPercent: 0,
      canBeginReview: false,
    });
  } finally {
    fixture.cleanup();
  }
});

test('active assessment facts come from the relational run bound to the active lesson', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    for (const studentId of ['stu-01', 'stu-02', 'stu-03']) {
      readyForFormalAssessment(fixture.database, studentId);
    }
    const lesson = openRelationalAssessmentRun(
      fixture.database,
      'classroom-run-relational-cut',
      '2026-07-16T01:10:00.000Z',
      '2026-07-16T01:25:00.000Z',
      ['stu-01', 'stu-02', 'stu-03'],
    );
    let sequence = 0;
    const assessment = new FormalAssessmentService(fixture.database, {
      now: () => new Date('2026-07-16T01:15:00.000Z'),
      randomId: () => `relational-${++sequence}`,
      randomToken: () => `relational-token-${++sequence}-0123456789abcdef`,
    });
    const papers = (['stu-01', 'stu-02', 'stu-03'] as const).map((studentId) => (
      assessment.issuePaper(studentActor(studentId), 'P1T1-N02', {
        classroomSessionId: 'demo-class',
      })
    ));
    assessment.submitAnswers(
      studentActor('stu-01'),
      papers[0]!.attemptToken,
      wrongAssessmentAnswers(papers[0]!.paper),
    );
    fixture.database.prepare(`
      UPDATE formal_assessment_instances
      SET status = 'closed', closed_at = ?, closure_reason = 'cancelled'
      WHERE assessment_id = ?
    `).run('2026-07-16T01:16:00.000Z', papers[1]!.assessmentId);

    const snapshot = new AuthoritativeSnapshotReader(fixture.database)
      .read(teacherActor(), 'teacher', { now });

    assert.deepEqual(snapshot.submissions.activeAssessment, {
      status: 'running',
      runId: 'classroom-run-relational-cut',
      lessonRunId: lesson.lessonRunId,
      nodeId: 'P1T1-N02',
      gameId: 'P1T1-N02-server-assessment',
      revision: 0,
      startedAt: '2026-07-16T01:10:00.000Z',
      expiresAt: '2026-07-16T01:25:00.000Z',
      eligibleCount: 3,
      submittedCount: 1,
      playingCount: 1,
      passedCount: 0,
      submissionPercent: 33.3,
      passRatePercent: 0,
      canBeginReview: false,
    });

    fixture.database.prepare(`
      UPDATE classroom_assessment_runs
      SET status = 'paused', remaining_seconds_when_paused = 240,
        revision = revision + 1
      WHERE run_id = 'classroom-run-relational-cut'
    `).run();
    const paused = new AuthoritativeSnapshotReader(fixture.database)
      .read(teacherActor(), 'teacher', { now });
    assert.deepEqual(paused.submissions.activeAssessment, {
      status: 'paused',
      runId: 'classroom-run-relational-cut',
      lessonRunId: lesson.lessonRunId,
      nodeId: 'P1T1-N02',
      gameId: 'P1T1-N02-server-assessment',
      revision: 1,
      startedAt: '2026-07-16T01:10:00.000Z',
      expiresAt: '2026-07-16T01:25:00.000Z',
      remainingSecondsWhenPaused: 240,
      eligibleCount: 3,
      submittedCount: 1,
      playingCount: 1,
      passedCount: 0,
      submissionPercent: 33.3,
      passRatePercent: 0,
      canBeginReview: false,
    });
  } finally {
    fixture.cleanup();
  }
});

test('running assessment excludes unbound attempts even when their old assessment id and time appear current', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const lesson = openRelationalAssessmentRun(
      fixture.database,
      'classroom-run-current',
      '2026-07-16T01:10:00.000Z',
      '2026-07-16T01:25:00.000Z',
    );
    fixture.database.exec(`
      INSERT INTO formal_assessment_instances (
        assessment_id, session_id, classroom_run_id, node_id, game_id,
        question_version, status, opened_at, closed_at, expires_at
      ) VALUES
        (
          'assessment-history', 'demo-class', NULL, 'P1T1-N02',
          'P1T1-N02-server-assessment', 'question-v0', 'closed',
          '2026-07-16T01:10:00.000Z', '2026-07-16T01:18:00.000Z',
          '2026-07-16T01:25:00.000Z'
        ),
        (
          'assessment-current', 'demo-class', 'classroom-run-current', 'P1T1-N02',
          'P1T1-N02-server-assessment', 'question-v1', 'running',
          '2026-07-16T01:10:00.000Z', NULL, '2026-07-16T01:25:00.000Z'
        );
    `);
    const learning = new LearningRepository(fixture.database);
    learning.recordFormalAttempt({
      attemptId: 'current-window-zero',
      studentId: 'stu-01',
      nodeId: 'P1T1-N02',
      assessmentId: 'assessment-current',
      gameId: 'P1T1-N02-server-assessment',
      score: 0,
      completedAt: '2026-07-16T01:15:00.000Z',
    }, learning.readTopicVersion('learning:stu-01'));
    learning.recordFormalAttempt({
      attemptId: 'current-window-history-assessment',
      studentId: 'stu-02',
      nodeId: 'P1T1-N02',
      assessmentId: 'assessment-history',
      gameId: 'P1T1-N02-server-assessment',
      score: 100,
      completedAt: '2026-07-16T01:16:00.000Z',
    }, learning.readTopicVersion('learning:stu-02'));
    learning.recordFormalAttempt({
      attemptId: 'current-assessment-other-game',
      studentId: 'stu-02',
      nodeId: 'P1T1-N02',
      assessmentId: 'assessment-current',
      gameId: 'other-formal-game',
      score: 100,
      completedAt: '2026-07-16T01:17:00.000Z',
    }, learning.readTopicVersion('learning:stu-02'));
    learning.recordFormalAttempt({
      attemptId: 'current-window-after-observation',
      studentId: 'stu-03',
      nodeId: 'P1T1-N02',
      assessmentId: 'assessment-current',
      gameId: 'P1T1-N02-server-assessment',
      score: 100,
      completedAt: '2026-07-16T01:21:00.000Z',
    }, learning.readTopicVersion('learning:stu-03'));

    const snapshot = new AuthoritativeSnapshotReader(fixture.database)
      .read(teacherActor(), 'teacher', { now });

    assert.deepEqual(snapshot.submissions.activeAssessment, {
      status: 'running',
      runId: 'classroom-run-current',
      lessonRunId: lesson.lessonRunId,
      nodeId: 'P1T1-N02',
      gameId: 'P1T1-N02-server-assessment',
      revision: 0,
      startedAt: '2026-07-16T01:10:00.000Z',
      expiresAt: '2026-07-16T01:25:00.000Z',
      eligibleCount: 1,
      submittedCount: 0,
      playingCount: 1,
      passedCount: 0,
      submissionPercent: 0,
      canBeginReview: false,
    });
  } finally {
    fixture.cleanup();
  }
});

test('classroom lifecycle, participation, and helper availability remain separate synchronized axes', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    fixture.database.prepare(`
      UPDATE classroom_sessions SET status = 'active' WHERE session_id = 'demo-class'
    `).run();
    const participation = new ClassroomParticipationRepository(fixture.database);
    participation.join('demo-class', 'stu-01', new Date('2026-07-16T01:19:55.000Z'));
    participation.setMode('demo-class', 'stu-01', 'self', new Date('2026-07-16T01:19:56.000Z'));
    new ClassroomSessionRepository(fixture.database).recordHeartbeat('demo-class', {
      deviceId: 'private-student-device',
      actorRole: 'student',
      studentId: 'stu-01',
      clientKind: 'browser',
      visibilityState: 'visible',
      pageState: 'ready',
      lastAppliedRevision: 0,
    }, new Date('2026-07-16T01:19:59.000Z'));
    new ClassroomSessionRepository(fixture.database).recordHeartbeat('demo-class', {
      deviceId: 'private-student-simulator',
      actorRole: 'student',
      studentId: 'stu-01',
      clientKind: 'helper-simulator',
      visibilityState: 'visible',
      pageState: 'ready',
      lastAppliedRevision: 0,
    }, new Date('2026-07-16T01:19:59.000Z'));

    const reader = new AuthoritativeSnapshotReader(fixture.database);
    const student = reader.read(studentActor('stu-01'), 'student', { now });
    const teacher = reader.read(teacherActor(), 'teacher', { now });
    const projector = reader.read(teacherActor(), 'projector', { now });

    assert.deepEqual(commonOf(student), commonOf(teacher));
    assert.deepEqual(commonOf(student), commonOf(projector));
    assert.equal(student.classroom.status, 'active');
    assert.equal(student.participation?.state, 'joined');
    assert.equal(student.participation?.mode, 'self');
    assert.deepEqual(student.membership, { classSize: 3, joinedCount: 1, followingCount: 0 });
    assert.equal(student.helper.status, 'online');
    assert.equal(student.helper.onlineStudentDeviceCount, 1);
    assert.equal(student.helper.canPush, true);
    assert.equal(JSON.stringify(projector).includes('private-student-device'), false);
  } finally {
    fixture.cleanup();
  }
});

test('teacher snapshot naturally expands from three to twenty-four active members', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const insertUser = fixture.database.prepare(`
      INSERT INTO users (id, username, display_name, role, password_hash, is_active)
      VALUES (?, ?, ?, 'student', 'test-hash', 1)
    `);
    const insertMember = fixture.database.prepare(`
      INSERT INTO classroom_members (session_id, student_id) VALUES ('demo-class', ?)
    `);
    fixture.database.transaction(() => {
      for (let index = 4; index <= 24; index += 1) {
        const id = `stu-${String(index).padStart(2, '0')}`;
        insertUser.run(id, `student${String(index).padStart(2, '0')}`, `学生${index}`);
        insertMember.run(id);
      }
    }).immediate();

    const snapshot = new AuthoritativeSnapshotReader(fixture.database)
      .read(teacherActor(), 'teacher', { now });

    assert.equal(snapshot.membership.classSize, 24);
    assert.equal(snapshot.students.length, 24);
    assert.equal(snapshot.submissions.activeAssessment.eligibleCount, 24);
  } finally {
    fixture.cleanup();
  }
});

test('audience authorization fails closed before returning a snapshot', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const reader = new AuthoritativeSnapshotReader(fixture.database);

    assert.throws(
      () => reader.read(studentActor('stu-01'), 'teacher', { now }),
      AuthoritativeSnapshotAuthorizationError,
    );
    assert.throws(
      () => reader.read(studentActor('stu-01'), 'projector', { now }),
      AuthoritativeSnapshotAuthorizationError,
    );
    assert.throws(
      () => reader.read({ ...teacherActor(), classId: 'other-class' }, 'teacher', { now }),
      AuthoritativeSnapshotAuthorizationError,
    );
    assert.throws(
      () => reader.read({ ...studentActor('stu-01'), studentId: 'stu-02' }, 'student', { now }),
      AuthoritativeSnapshotAuthorizationError,
    );
  } finally {
    fixture.cleanup();
  }
});

function commonOf(snapshot: AuthoritativeSnapshot): Record<string, unknown> {
  const copy = { ...snapshot } as Record<string, unknown>;
  delete copy.audience;
  delete copy.participation;
  delete copy.me;
  delete copy.students;
  delete copy.weakPoints;
  delete copy.mode;
  delete copy.nodeHeatmap;
  delete copy.tasks;
  return copy;
}

function assertProjectorContainsNoPersonalData(snapshot: AuthoritativeSnapshot & { audience: 'projector' }): void {
  const serialized = JSON.stringify(snapshot);
  for (const forbidden of ['stu-01', 'stu-02', 'stu-03', '学生一', '学生二', '学生三']) {
    assert.equal(serialized.includes(forbidden), false, `projector leaked ${forbidden}`);
  }
  const forbiddenKeys = new Set([
    'studentId', 'students', 'participants', 'roster', 'devices', 'acks',
    'displayName', 'username', 'deviceId', 'outputId', 'feedback', 'answers', 'evidenceText',
    'assessmentId', 'attemptToken', 'instanceId', 'questionVersion', 'diagnostics',
    'draft', 'token', 'personalScore',
  ]);
  visit(snapshot, (key) => assert.equal(forbiddenKeys.has(key), false, `projector leaked key ${key}`));
}

function visit(value: unknown, check: (key: string) => void): void {
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    check(key);
    visit(nested, check);
  }
}

function teacherActor(): AuthenticatedActor {
  return {
    userId: 'teacher-01',
    username: 'teacher01',
    displayName: '张老师',
    role: 'teacher',
    classId: 'demo-class',
  };
}

function studentActor(studentId: 'stu-01' | 'stu-02' | 'stu-03'): AuthenticatedActor {
  return {
    userId: studentId,
    username: studentId.replace('stu-', 'student'),
    displayName: studentId,
    role: 'student',
    classId: 'demo-class',
    studentId,
  };
}

function readyForFormalAssessment(database: ReturnType<typeof createTestDatabase>['database'], studentId: string): void {
  const insert = database.prepare(`
    INSERT INTO practice_attempts (
      attempt_id, student_id, activity_id, node_id, passed, origin, attempted_at
    ) VALUES (?, ?, ?, ?, 1, 'user', '2026-07-16T01:00:00.000Z')
  `);
  for (const [activityId, nodeId] of [
    ['P1T1-N01-micro-01', 'P1T1-N01'],
    ['P1T1-N02-foundation-01', 'P1T1-N02'],
    ['P1T1-N02-application-01', 'P1T1-N02'],
    ['P1T1-N02-transfer-01', 'P1T1-N02'],
  ] as const) insert.run(`ready-${studentId}-${activityId}`, studentId, activityId, nodeId);
}

function wrongAssessmentAnswers(paper: AssessmentPaper): AssessmentAnswers {
  const evidence = paper.questions.find(({ id }) => id === 'evidenceClassification')?.options ?? [];
  const links = paper.questions.find(({ id }) => id === 'linkReconstruction')?.options ?? [];
  const revisions = paper.questions.find(({ id }) => id === 'defectiveOutputRevision')?.options ?? [];
  return {
    evidenceClassification: evidence[0]?.id ?? '',
    linkReconstruction: links.map(({ id }) => id).reverse(),
    defectiveOutputRevision: [revisions.at(-1)?.id ?? ''],
    professionalConclusion: {
      confirmedFact: '未说明',
      evidenceGap: '未说明',
      risk: '未说明',
      action: '未说明',
    },
  };
}

function openRelationalAssessmentRun(
  database: ReturnType<typeof createTestDatabase>['database'],
  runId: string,
  startedAt: string,
  expiresAt: string,
  studentIds: readonly string[] = [],
): ReturnType<typeof startActiveLessonRun> {
  const lessonRun = startActiveLessonRun(database, 'demo-class', {
    now: new Date(startedAt),
  });
  database.prepare(`
    INSERT INTO classroom_assessment_runs (
      run_id, lesson_run_id, session_id, node_id, game_id,
      status, started_at, expires_at
    ) VALUES (?, ?, 'demo-class', 'P1T1-N02', 'P1T1-N02-server-assessment',
      'running', ?, ?)
  `).run(runId, lessonRun.lessonRunId, startedAt, expiresAt);
  provisionClassroomAssessmentParticipants(database, {
    runId,
    studentIds,
    openedAt: startedAt,
    expiresAt,
  });
  return lessonRun;
}
