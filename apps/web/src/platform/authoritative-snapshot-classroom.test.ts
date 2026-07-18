import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthenticatedActor } from './auth/actor.ts';
import { startActiveLessonRun } from './classroom-lesson-run-test-fixture.ts';
import { seedDemo } from './db/demo-seed.ts';
import { migrateDatabase } from './db/migrations.ts';
import { createTestDatabase } from './db/test-database.ts';
import {
  FormalAssessmentService,
  type AssessmentAnswers,
  type AssessmentPaper,
} from './formal-assessment-service.ts';
import {
  AuthoritativeSnapshotReader,
  type AuthoritativeSnapshot,
} from './authoritative-snapshot.ts';

const now = new Date('2026-07-16T01:20:00.000Z');

test('snapshot read persists a due assessment expiry exactly once before cutting facts', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    for (const studentId of ['stu-01', 'stu-02', 'stu-03']) {
      readyForFormalAssessment(fixture.database, studentId);
    }
    openRelationalAssessmentRun(
      fixture.database,
      'classroom-run-due',
      '2026-07-16T01:10:00.000Z',
      '2026-07-16T01:19:00.000Z',
    );
    let sequence = 0;
    const assessment = new FormalAssessmentService(fixture.database, {
      now: () => new Date('2026-07-16T01:15:00.000Z'),
      randomId: () => `due-${++sequence}`,
      randomToken: () => `due-token-${++sequence}-0123456789abcdef`,
    });
    for (const studentId of ['stu-01', 'stu-02', 'stu-03'] as const) {
      assessment.issuePaper(studentActor(studentId), 'P1T1-N02', {
        classroomSessionId: 'demo-class',
      });
    }
    const topicBefore = classroomTopicVersion(fixture.database);
    const reader = new AuthoritativeSnapshotReader(fixture.database);

    const first = reader.read(teacherActor(), 'teacher', { now });

    assert.deepEqual(first.submissions.activeAssessment, {
      status: 'expired',
      runId: 'classroom-run-due',
      lessonRunId: first.classroom.activeLesson?.runId,
      nodeId: 'P1T1-N02',
      gameId: 'P1T1-N02-server-assessment',
      revision: 1,
      startedAt: '2026-07-16T01:10:00.000Z',
      expiresAt: '2026-07-16T01:19:00.000Z',
      closeReason: 'time-expired',
      eligibleCount: 3,
      submittedCount: 0,
      playingCount: 0,
      passedCount: 0,
      submissionPercent: 0,
      canBeginReview: false,
    });
    assert.deepEqual(fixture.database.prepare(`
      SELECT DISTINCT status, closure_reason AS closureReason, closed_at AS closedAt
      FROM formal_assessment_instances WHERE classroom_run_id = 'classroom-run-due'
    `).all(), [{ status: 'closed', closureReason: 'expired', closedAt: now.toISOString() }]);
    assert.deepEqual(fixture.database.prepare(`
      SELECT DISTINCT used_at AS usedAt FROM formal_assessment_tokens
      WHERE assessment_id IN (
        SELECT assessment_id FROM formal_assessment_instances
        WHERE classroom_run_id = 'classroom-run-due'
      )
    `).all(), [{ usedAt: now.toISOString() }]);
    assert.equal(classroomTopicVersion(fixture.database), topicBefore + 1);

    const second = reader.read(teacherActor(), 'teacher', {
      now: new Date('2026-07-16T01:21:00.000Z'),
    });
    assert.deepEqual(second.submissions.activeAssessment, first.submissions.activeAssessment);
    assert.equal(classroomTopicVersion(fixture.database), topicBefore + 1);
  } finally {
    fixture.cleanup();
  }
});

test('review projection stays anonymous and cannot restart after review was collected', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    readyForFormalAssessment(fixture.database, 'stu-01');
    const lesson = openRelationalAssessmentRun(
      fixture.database,
      'classroom-run-shared-01',
      '2026-07-16T01:10:00.000Z',
      '2026-07-16T01:25:00.000Z',
    );
    let sequence = 0;
    const assessment = new FormalAssessmentService(fixture.database, {
      now: () => new Date('2026-07-16T01:15:00.000Z'),
      randomId: () => `live-${++sequence}`,
      randomToken: () => `live-token-${++sequence}-0123456789abcdef`,
    });
    const selfIssued = assessment.issuePaper(studentActor('stu-01'), 'P1T1-N02');
    assessment.submitAnswers(studentActor('stu-01'), selfIssued.attemptToken, passingAssessmentAnswers());
    const issued = assessment.issuePaper(studentActor('stu-01'), 'P1T1-N02', {
      classroomSessionId: 'demo-class',
    });
    assessment.submitAnswers(
      studentActor('stu-01'),
      issued.attemptToken,
      wrongAssessmentAnswers(issued.paper),
    );
    const reader = new AuthoritativeSnapshotReader(fixture.database);

    const closed = reader.read(teacherActor(), 'teacher', { now });

    assert.notEqual(issued.assessmentId, 'classroom-run-shared-01');
    assert.equal(closed.submissions.activeAssessment.lessonRunId, lesson.lessonRunId);
    assert.equal(closed.submissions.activeAssessment.canBeginReview, true);
    fixture.database.prepare(`
      UPDATE classroom_assessment_runs
      SET status = 'reviewing', review_started_at = ?, revision = revision + 1
      WHERE run_id = 'classroom-run-shared-01'
    `).run('2026-07-16T01:19:00.000Z');

    const review = reader.read(teacherActor(), 'projector', { now });

    assert.equal(review.submissions.activeAssessment.reviewStartedAt, '2026-07-16T01:19:00.000Z');
    assert.equal(review.submissions.activeAssessment.canBeginReview, false);
    assert.deepEqual(review.submissions.activeAssessment.errorDistribution, [
      { dimension: 'evidenceClassification', incorrectCount: 1, percent: 100 },
      { dimension: 'linkReconstruction', incorrectCount: 1, percent: 100 },
      { dimension: 'defectiveOutputRevision', incorrectCount: 1, percent: 100 },
      { dimension: 'professionalConclusion', incorrectCount: 1, percent: 100 },
    ]);
    assertProjectorContainsNoPersonalData(review);
    const serialized = JSON.stringify(review.submissions.activeAssessment);
    for (const forbidden of [
      'stu-01', 'student01', 'answers', 'feedback', 'evidenceText',
      issued.assessmentId, selfIssued.assessmentId, 'live-token-',
    ]) {
      assert.equal(serialized.includes(forbidden), false);
    }

    fixture.database.prepare(`
      UPDATE classroom_assessment_runs
      SET status = 'closed', closed_at = ?, closed_reason = 'teacher-collected',
        revision = revision + 1
      WHERE run_id = 'classroom-run-shared-01'
    `).run(now.toISOString());
    const collected = reader.read(teacherActor(), 'teacher', { now });
    assert.equal(collected.submissions.activeAssessment.reviewStartedAt, '2026-07-16T01:19:00.000Z');
    assert.equal(collected.submissions.activeAssessment.canBeginReview, false);
  } finally {
    fixture.cleanup();
  }
});

function classroomTopicVersion(database: ReturnType<typeof createTestDatabase>['database']): number {
  return Number(database.prepare(`
    SELECT version FROM snapshot_versions WHERE topic = 'classroom:demo-class'
  `).pluck().get());
}

function teacherActor(): AuthenticatedActor {
  return {
    userId: 'teacher-01', username: 'teacher01', displayName: '李老师',
    role: 'teacher', classId: 'demo-class',
  };
}

function studentActor(studentId: 'stu-01' | 'stu-02' | 'stu-03'): AuthenticatedActor {
  const ordinal = Number(studentId.slice(-2));
  return {
    userId: studentId,
    studentId,
    username: `student${String(ordinal).padStart(2, '0')}`,
    displayName: `学生${ordinal}`,
    role: 'student',
    classId: 'demo-class',
  };
}

function readyForFormalAssessment(
  database: ReturnType<typeof createTestDatabase>['database'],
  studentId: string,
): void {
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

function passingAssessmentAnswers(): AssessmentAnswers {
  return {
    evidenceClassification: 'nameplate-photo',
    linkReconstruction: ['source-device', 'source-port', 'cable-label', 'peer-port', 'peer-device'],
    defectiveOutputRevision: ['restore-source', 'add-photo-index', 'record-direction'],
    professionalConclusion: {
      confirmedFact: '设备铭牌与源端口证据清晰，设备身份和源端连接已经确认。',
      evidenceGap: '对端端口照片仍需复核，当前不扩展未经证实的结论。',
      risk: '证据不足时直接交付可能造成链路关系误判。',
      action: '补拍对端端口并核验编号，完成证据索引后更新成果表。',
    },
  } as AssessmentAnswers;
}

function openRelationalAssessmentRun(
  database: ReturnType<typeof createTestDatabase>['database'],
  runId: string,
  startedAt: string,
  expiresAt: string,
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
  return lessonRun;
}

function assertProjectorContainsNoPersonalData(
  snapshot: AuthoritativeSnapshot & { audience: 'projector' },
): void {
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
  for (const [key, child] of Object.entries(value)) {
    check(key);
    visit(child, check);
  }
}
