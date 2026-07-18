import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthenticatedActor } from './auth/actor.ts';
import {
  ClassroomAssessmentRunConflictError,
  ClassroomAssessmentRunRepository,
  ClassroomAssessmentRunRevisionConflictError,
} from './classroom-assessment-run-repository.ts';
import {
  ClassroomAssessmentAuthorizationError,
  ClassroomAssessmentRunService,
} from './classroom-assessment-run-service.ts';
import { ClassroomLessonRunRepository } from './classroom-lesson-run-repository.ts';
import { ClassroomParticipationRepository } from './classroom-participation-repository.ts';
import { seedDemo } from './db/demo-seed.ts';
import { migrateDatabase } from './db/migrations.ts';
import { createTestDatabase } from './db/test-database.ts';
import type { AssessmentAnswers } from './formal-assessment-contract.ts';
import {
  AssessmentClassroomWindowError,
  FormalAssessmentService,
} from './formal-assessment-service.ts';

const teacher: AuthenticatedActor = {
  userId: 'teacher-01', username: 'teacher01', displayName: 'Teacher',
  role: 'teacher', classId: 'demo-class',
};
const studentOne: AuthenticatedActor = {
  userId: 'stu-01', studentId: 'stu-01', username: 'student01',
  displayName: 'Student 1', role: 'student', classId: 'demo-class',
};
const studentTwo: AuthenticatedActor = {
  ...studentOne, userId: 'stu-02', studentId: 'stu-02', username: 'student02',
};
const studentThree: AuthenticatedActor = {
  ...studentOne, userId: 'stu-03', studentId: 'stu-03', username: 'student03',
};

test('start atomically provisions one shared run and independent instances and tokens for joined students', () => {
  const fixture = classroomFixture();
  try {
    const classroomTopicBefore = topicVersion(fixture.database, 'classroom:demo-class');
    const started = fixture.service.execute(teacher, 'demo-class', {
      type: 'start', lessonRunId: fixture.lessonRunId, nodeId: 'P1T1-N02',
      gameId: 'P1T1-N02-server-assessment', expectedClassroomRevision: fixture.classroomRevision,
      durationSeconds: 600,
    }, new Date('2026-07-18T02:00:00.000Z'));

    assert.equal(started.eligibleCount, 3);
    assert.equal(started.submittedCount, 0);
    assert.equal(started.canBeginReview, false);
    assert.equal(count(fixture.database, 'classroom_assessment_runs'), 1);
    assert.equal(count(
      fixture.database, 'formal_assessment_instances', `classroom_run_id = '${started.runId}'`,
    ), 3);
    assert.equal(count(fixture.database, 'formal_assessment_tokens', `assessment_id IN (
      SELECT assessment_id FROM formal_assessment_instances WHERE classroom_run_id = '${started.runId}'
    )`), 3);
    assert.equal(new Set(fixture.database.prepare(`
      SELECT assessment_id FROM formal_assessment_instances
      WHERE classroom_run_id = ?
    `).pluck().all(started.runId)).size, 3);
    assert.equal(topicVersion(fixture.database, 'classroom:demo-class'), classroomTopicBefore + 1);

    const before = persistenceCounts(fixture.database);
    assert.throws(() => fixture.service.execute({ ...teacher, userId: 'teacher-other' }, 'demo-class', {
      type: 'pause', runId: started.runId, expectedRevision: 0,
    }), ClassroomAssessmentAuthorizationError);
    assert.deepEqual(persistenceCounts(fixture.database), before);
  } finally {
    fixture.cleanup();
  }
});

test('assessment pause freezes remainder and resume reissues timing tokens without replacing identity or draft', () => {
  const fixture = classroomFixture();
  try {
    const started = start(fixture, new Date('2026-07-18T02:00:00.000Z'));
    const identities = assessmentIds(fixture.database, started.runId);
    const saved = fixture.formal.saveDraft(
      studentOne, fixture.tokens[0]!, { evidenceClassification: 'nameplate-photo' }, 0, 'P1T1-N02',
    );
    const topicBeforePause = topicVersion(fixture.database, 'classroom:demo-class');

    const paused = fixture.service.execute(teacher, 'demo-class', {
      type: 'pause', runId: started.runId, expectedRevision: 0,
    }, new Date('2026-07-18T02:01:40.000Z'));
    assert.equal(paused.status, 'paused');
    assert.equal(paused.remainingSecondsWhenPaused, 500);
    assert.equal(count(fixture.database, 'formal_assessment_tokens', 'used_at IS NULL'), 0);
    assert.equal(topicVersion(fixture.database, 'classroom:demo-class'), topicBeforePause + 1);
    assert.throws(
      () => fixture.formal.saveDraft(
        studentOne, fixture.tokens[0]!, { evidenceClassification: 'nameplate-photo' }, 1, 'P1T1-N02',
      ),
      AssessmentClassroomWindowError,
    );
    assert.throws(
      () => fixture.formal.submitAnswers(studentOne, fixture.tokens[0]!, passingAnswers, 'P1T1-N02'),
      AssessmentClassroomWindowError,
    );
    const pausedPaper = fixture.formal.openOrResume(
      studentOne, 'P1T1-N02', { classroomSessionId: 'demo-class' },
    );
    assert.equal(pausedPaper.state, 'paused');
    assert.equal(pausedPaper.assessmentId, identities[0]);
    assert.deepEqual(pausedPaper.draft, saved);

    const topicBeforeResume = topicVersion(fixture.database, 'classroom:demo-class');
    const resumed = fixture.service.execute(teacher, 'demo-class', {
      type: 'resume', runId: started.runId, expectedRevision: 1,
    }, new Date('2026-07-18T03:00:00.000Z'));
    assert.equal(resumed.expiresAt, '2026-07-18T03:08:20.000Z');
    assert.deepEqual(assessmentIds(fixture.database, started.runId), identities);
    assert.equal(count(fixture.database, 'formal_assessment_tokens', 'used_at IS NULL'), 3);
    assert.equal(count(fixture.database, 'formal_assessment_drafts'), 1);
    assert.equal(topicVersion(fixture.database, 'classroom:demo-class'), topicBeforeResume + 1);
    const resumedPaper = fixture.formal.openOrResume(
      studentOne, 'P1T1-N02', { classroomSessionId: 'demo-class' },
    );
    assert.equal(resumedPaper.assessmentId, identities[0]);
    assert.equal(resumedPaper.state, 'in-progress');
    assert.notEqual(resumedPaper.attemptToken, fixture.tokens[0]);
    assert.deepEqual(resumedPaper.draft, saved);
    assert.throws(() => fixture.service.execute(teacher, 'demo-class', {
      type: 'resume', runId: started.runId, expectedRevision: 1,
    }), ClassroomAssessmentRunRevisionConflictError);
  } finally {
    fixture.cleanup();
  }
});

test('first submit leaves shared run open; review is gated until collection and exposes aggregates only', () => {
  const fixture = classroomFixture();
  try {
    const started = start(fixture, new Date('2026-07-18T02:00:00.000Z'));
    const classroomBeforeSubmit = topicVersion(fixture.database, 'classroom:demo-class');
    fixture.formal.submitAnswers(studentOne, fixture.tokens[0]!, passingAnswers, 'P1T1-N02');
    assert.equal(fixture.repository.readRun(started.runId)?.status, 'running');
    assert.equal(topicVersion(fixture.database, 'classroom:demo-class'), classroomBeforeSubmit + 1);
    assert.deepEqual(fixture.repository.readSubmissionCounts(started.runId), { eligible: 3, submitted: 1 });
    assert.throws(() => fixture.service.execute(teacher, 'demo-class', {
      type: 'begin-review', runId: started.runId, expectedRevision: 0,
    }, new Date('2026-07-18T02:01:30.000Z')), ClassroomAssessmentRunConflictError);

    const attempt = fixture.database.prepare(`
      SELECT attempt_id AS attemptId, diagnostics_json AS diagnosticsJson
      FROM formal_attempts WHERE assessment_id = ?
    `).get(assessmentIds(fixture.database, started.runId)[0]) as {
      attemptId: string; diagnosticsJson: string;
    };
    const diagnostics = JSON.parse(attempt.diagnosticsJson) as { dimensions: Record<string, unknown> };
    diagnostics.dimensions.injectedStudentIdentity = { score: 0, maxScore: 25 };
    fixture.database.prepare(`UPDATE formal_attempts SET diagnostics_json = ? WHERE attempt_id = ?`)
      .run(JSON.stringify(diagnostics), attempt.attemptId);

    const topicBeforeCollect = topicVersion(fixture.database, 'classroom:demo-class');
    const collected = fixture.service.execute(teacher, 'demo-class', {
      type: 'collect', runId: started.runId, expectedRevision: 0,
    }, new Date('2026-07-18T02:02:00.000Z'));
    assert.equal(collected.status, 'closed');
    assert.equal(collected.closeReason, 'teacher-collected');
    assert.equal(collected.canBeginReview, true);
    assert.deepEqual(collected.review, []);
    assert.equal(topicVersion(fixture.database, 'classroom:demo-class'), topicBeforeCollect + 1);
    assert.ok(collected.review.every((item) => (
      Object.keys(item).sort().join(',') === 'dimension,incorrectCount,percent'
    )));
    assert.equal(JSON.stringify(collected.review).includes('stu-01'), false);
    assert.equal(JSON.stringify(collected.review).includes('injectedStudentIdentity'), false);
    const topicBeforeReview = topicVersion(fixture.database, 'classroom:demo-class');
    const reviewed = fixture.service.execute(teacher, 'demo-class', {
      type: 'begin-review', runId: started.runId, expectedRevision: 1,
    });
    assert.equal(reviewed.status, 'reviewing');
    assert.equal(reviewed.revision, 2);
    assert.equal(reviewed.canBeginReview, false);
    assert.deepEqual(reviewed.review, []);
    assert.equal(topicVersion(fixture.database, 'classroom:demo-class'), topicBeforeReview + 1);
  } finally {
    fixture.cleanup();
  }
});

test('a stale command after wall-clock expiry returns CAS conflict but keeps one committed expiry cut', () => {
  const fixture = classroomFixture();
  try {
    const started = start(fixture, new Date('2026-07-18T02:00:00.000Z'));
    const topicBefore = topicVersion(fixture.database, 'classroom:demo-class');
    assert.throws(() => fixture.service.execute(teacher, 'demo-class', {
      type: 'pause', runId: started.runId, expectedRevision: 0,
    }, new Date('2026-07-18T02:10:00.000Z')), ClassroomAssessmentRunRevisionConflictError);
    assert.deepEqual(fixture.repository.readRun(started.runId), {
      ...fixture.repository.readRun(started.runId),
      status: 'expired',
      closedReason: 'time-expired',
      revision: 1,
    });
    assert.equal(topicVersion(fixture.database, 'classroom:demo-class'), topicBefore + 1);
    assert.throws(() => fixture.service.execute(teacher, 'demo-class', {
      type: 'collect', runId: started.runId, expectedRevision: 0,
    }, new Date('2026-07-18T02:11:00.000Z')), ClassroomAssessmentRunRevisionConflictError);
    assert.equal(fixture.repository.readRun(started.runId)?.revision, 1);
    assert.equal(topicVersion(fixture.database, 'classroom:demo-class'), topicBefore + 1);
  } finally {
    fixture.cleanup();
  }
});

test('terminal submitted run blocks restart until review begins and reviewing is collected', () => {
  const fixture = classroomFixture();
  try {
    const first = start(fixture, new Date('2026-07-18T02:00:00.000Z'));
    fixture.formal.submitAnswers(studentOne, fixture.tokens[0]!, passingAnswers, 'P1T1-N02');
    const collected = fixture.service.execute(teacher, 'demo-class', {
      type: 'collect', runId: first.runId, expectedRevision: 0,
    }, new Date('2026-07-18T02:02:00.000Z'));
    assert.throws(
      () => start(fixture, new Date('2026-07-18T02:03:00.000Z')),
      ClassroomAssessmentRunConflictError,
    );
    const reviewing = fixture.service.execute(teacher, 'demo-class', {
      type: 'begin-review', runId: first.runId, expectedRevision: collected.revision,
    }, new Date('2026-07-18T02:04:00.000Z'));
    assert.equal(reviewing.status, 'reviewing');
    const reviewedAndCollected = fixture.service.execute(teacher, 'demo-class', {
      type: 'collect', runId: first.runId, expectedRevision: reviewing.revision,
    }, new Date('2026-07-18T02:05:00.000Z'));
    assert.ok(fixture.repository.readRun(first.runId)?.reviewStartedAt);
    const second = start(fixture, new Date('2026-07-18T02:06:00.000Z'));
    assert.notEqual(second.runId, first.runId);
    const beforeReopen = persistenceCounts(fixture.database);
    assert.throws(() => fixture.service.execute(teacher, 'demo-class', {
      type: 'begin-review', runId: first.runId, expectedRevision: reviewedAndCollected.revision,
    }, new Date('2026-07-18T02:07:00.000Z')), ClassroomAssessmentRunConflictError);
    assert.deepEqual(persistenceCounts(fixture.database), beforeReopen);
    assert.ok(fixture.repository.readRun(first.runId)?.reviewStartedAt);
    assert.equal(fixture.repository.readRun(second.runId)?.status, 'running');
  } finally {
    fixture.cleanup();
  }
});

test('last eligible submission atomically closes the shared run and advances classroom plus learning topics', () => {
  const fixture = classroomFixture();
  try {
    const started = start(fixture, new Date('2026-07-18T02:00:00.000Z'));
    fixture.formal.submitAnswers(studentOne, fixture.tokens[0]!, passingAnswers, 'P1T1-N02');
    fixture.formal.submitAnswers(studentTwo, fixture.tokens[1]!, passingAnswers, 'P1T1-N02');
    assert.equal(fixture.repository.readRun(started.runId)?.status, 'running');
    const classroomBefore = topicVersion(fixture.database, 'classroom:demo-class');
    const learningBefore = topicVersion(fixture.database, 'learning:stu-03');

    fixture.formal.submitAnswers(studentThree, fixture.tokens[2]!, passingAnswers, 'P1T1-N02');

    const closed = fixture.repository.readRun(started.runId);
    assert.equal(closed?.status, 'closed');
    assert.equal(closed?.closedReason, 'all-submitted');
    assert.equal(closed?.revision, 1);
    assert.equal(topicVersion(fixture.database, 'classroom:demo-class'), classroomBefore + 1);
    assert.equal(topicVersion(fixture.database, 'learning:stu-03'), learningBefore + 1);
    const preReview = fixture.service.read(
      teacher, 'demo-class', started.runId, new Date('2026-07-18T02:02:00.000Z'),
    );
    assert.equal(preReview.canBeginReview, true);
    assert.deepEqual(preReview.review, []);
    const reviewing = fixture.service.execute(teacher, 'demo-class', {
      type: 'begin-review', runId: started.runId, expectedRevision: closed!.revision,
    }, new Date('2026-07-18T02:02:01.000Z'));
    assert.equal(reviewing.status, 'reviewing');
    assert.equal(reviewing.canBeginReview, false);
    assert.deepEqual(
      reviewing.review.map(({ dimension }) => dimension).sort(),
      ['defectiveOutputRevision', 'evidenceClassification', 'linkReconstruction', 'professionalConclusion'],
    );
    assert.ok(reviewing.review.every((entry) => (
      Object.keys(entry).sort().join(',') === 'dimension,incorrectCount,percent'
    )));
  } finally {
    fixture.cleanup();
  }
});

test('expiry persists once and collect CAS failures roll back every assessment fact', () => {
  const fixture = classroomFixture();
  try {
    const started = start(fixture, new Date('2026-07-18T02:00:00.000Z'));
    const topicBeforeExpiry = topicVersion(fixture.database, 'classroom:demo-class');
    const expired = fixture.service.read(
      teacher, 'demo-class', started.runId, new Date('2026-07-18T02:10:00.000Z'),
    );
    assert.equal(expired.status, 'expired');
    assert.equal(expired.revision, 1);
    assert.equal(topicVersion(fixture.database, 'classroom:demo-class'), topicBeforeExpiry + 1);
    assert.equal(fixture.service.read(
      teacher, 'demo-class', started.runId, new Date('2026-07-18T02:20:00.000Z'),
    ).revision, 1);
    assert.equal(count(fixture.database, 'formal_assessment_instances', "closure_reason = 'expired'"), 3);
    const before = persistenceCounts(fixture.database);
    assert.throws(() => fixture.service.execute(teacher, 'demo-class', {
      type: 'collect', runId: started.runId, expectedRevision: 0,
    }), ClassroomAssessmentRunRevisionConflictError);
    assert.deepEqual(persistenceCounts(fixture.database), before);
  } finally {
    fixture.cleanup();
  }
});

test('start eligibility excludes joined inactive and non-student users', () => {
  const fixture = classroomFixture();
  try {
    fixture.database.prepare(`UPDATE users SET is_active = 0 WHERE id = 'stu-03'`).run();
    fixture.database.prepare(`UPDATE users SET role = 'teacher' WHERE id = 'stu-02'`).run();
    const started = start(fixture, new Date('2026-07-18T02:00:00.000Z'));
    assert.equal(started.eligibleCount, 1);
    assert.deepEqual(fixture.database.prepare(`
      SELECT token.student_id
      FROM formal_assessment_tokens AS token
      INNER JOIN formal_assessment_instances AS instance
        ON instance.assessment_id = token.assessment_id
      WHERE instance.classroom_run_id = ?
    `).pluck().all(started.runId), ['stu-01']);
  } finally {
    fixture.cleanup();
  }
});

function classroomFixture() {
  const fixture = createTestDatabase();
  migrateDatabase(fixture.database);
  seedDemo(fixture.database);
  const lessons = new ClassroomLessonRunRepository(fixture.database);
  const prepared = lessons.startLessonRun({ sessionId: 'demo-class', lessonId: 'P01-L1', expectedRevision: 0 }).run;
  const active = lessons.transitionLessonRun({
    sessionId: 'demo-class', lessonRunId: prepared.lessonRunId,
    expectedRevision: prepared.revision, nextStatus: 'active',
  }).run;
  const cursor = lessons.updateTeachingCursor({
    sessionId: 'demo-class', lessonRunId: active.lessonRunId, expectedRevision: active.revision,
    next: {
      ...active.teachingCursor, nodeId: 'P1T1-N02', unitId: 'P01-ku-02',
      pageId: 'P01-L1-P02', pageIndex: 1, phase: 'assessment',
      actionId: 'P1T1-N02-S02', actionIndex: 1, playbackStatus: 'paused',
    },
  }).run;
  const participation = new ClassroomParticipationRepository(fixture.database);
  for (const studentId of ['stu-01', 'stu-02', 'stu-03']) participation.join('demo-class', studentId);
  let id = 0;
  let token = 0;
  const tokens: string[] = [];
  const formal = new FormalAssessmentService(fixture.database, {
    now: () => new Date('2026-07-18T02:01:00.000Z'),
    randomId: () => `classroom-instance-${++id}`,
    randomToken: () => {
      const value = `classroom-token-${String(++token).padStart(2, '0')}-abcdefghijklmnopqrstuvwxyz`;
      tokens.push(value);
      return value;
    },
  });
  let runId = 0;
  const repository = new ClassroomAssessmentRunRepository(fixture.database, {
    randomId: () => `shared-${String(++runId).padStart(2, '0')}`,
  });
  const service = new ClassroomAssessmentRunService(fixture.database, {
    repository,
    randomId: () => `classroom-instance-${++id}`,
    randomToken: () => {
      const value = `classroom-token-${String(++token).padStart(2, '0')}-abcdefghijklmnopqrstuvwxyz`;
      tokens.push(value);
      return value;
    },
  });
  return { ...fixture, lessonRunId: cursor.lessonRunId, classroomRevision: cursor.revision, repository, formal, service, tokens };
}

function start(fixture: ReturnType<typeof classroomFixture>, now: Date) {
  return fixture.service.execute(teacher, 'demo-class', {
    type: 'start', lessonRunId: fixture.lessonRunId, nodeId: 'P1T1-N02',
    gameId: 'P1T1-N02-server-assessment', expectedClassroomRevision: fixture.classroomRevision,
    durationSeconds: 600,
  }, now);
}

function assessmentIds(database: ReturnType<typeof createTestDatabase>['database'], runId: string): string[] {
  return database.prepare(`
    SELECT assessment_id FROM formal_assessment_instances
    WHERE classroom_run_id = ? ORDER BY assessment_id
  `).pluck().all(runId) as string[];
}

function count(database: ReturnType<typeof createTestDatabase>['database'], table: string, where = '1 = 1'): number {
  return Number(database.prepare(`SELECT COUNT(*) FROM ${table} WHERE ${where}`).pluck().get());
}

function persistenceCounts(database: ReturnType<typeof createTestDatabase>['database']) {
  return {
    runs: count(database, 'classroom_assessment_runs'),
    instances: count(database, 'formal_assessment_instances'),
    tokens: count(database, 'formal_assessment_tokens'),
    openTokens: count(database, 'formal_assessment_tokens', 'used_at IS NULL'),
    attempts: count(database, 'formal_attempts'),
    drafts: count(database, 'formal_assessment_drafts'),
    classroomTopic: topicVersion(database, 'classroom:demo-class'),
    globalTopic: topicVersion(database, 'global'),
  };
}

function topicVersion(
  database: ReturnType<typeof createTestDatabase>['database'],
  topic: string,
): number {
  return Number(database.prepare(`
    SELECT version FROM snapshot_versions WHERE topic = ?
  `).pluck().get(topic) ?? 0);
}

const passingAnswers: AssessmentAnswers = {
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
