import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ClassroomAssessmentRunConflictError,
  ClassroomAssessmentRunRepository,
  ClassroomAssessmentRunRevisionConflictError,
} from './classroom-assessment-run-repository.ts';
import { ClassroomLessonRunRepository } from './classroom-lesson-run-repository.ts';
import { seedDemo } from './db/demo-seed.ts';
import { migrateDatabase } from './db/migrations.ts';
import { createTestDatabase } from './db/test-database.ts';

test('starts one assessment run only for the active matching assessment cursor with CAS', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const lessons = new ClassroomLessonRunRepository(fixture.database);
    const prepared = lessons.startLessonRun({
      sessionId: 'demo-class', lessonId: 'P01-L1', expectedRevision: 0,
    }, new Date('2026-07-18T01:00:00.000Z')).run;
    const active = lessons.transitionLessonRun({
      sessionId: 'demo-class', lessonRunId: prepared.lessonRunId,
      expectedRevision: prepared.revision, nextStatus: 'active',
    }, new Date('2026-07-18T01:00:01.000Z')).run;
    const assessmentCursor = lessons.updateTeachingCursor({
      sessionId: 'demo-class', lessonRunId: active.lessonRunId,
      expectedRevision: active.revision,
      next: {
        ...active.teachingCursor,
        nodeId: 'P1T1-N02', unitId: 'P01-ku-02',
        pageId: 'P01-L1-P02', pageIndex: 1, phase: 'assessment',
        actionId: 'P1T1-N02-S02', actionIndex: 1, playbackStatus: 'paused',
      },
    }, new Date('2026-07-18T01:00:02.000Z')).run;
    const repository = new ClassroomAssessmentRunRepository(fixture.database, {
      randomId: () => 'run-01',
    });

    const started = repository.startRun({
      sessionId: 'demo-class', lessonRunId: assessmentCursor.lessonRunId,
      nodeId: 'P1T1-N02', gameId: 'P1T1-N02-server-assessment',
      expectedClassroomRevision: assessmentCursor.revision, durationSeconds: 600,
    }, new Date('2026-07-18T01:00:03.000Z'));

    assert.equal(started.status, 'running');
    assert.equal(started.revision, 0);
    assert.equal(started.expiresAt, '2026-07-18T01:10:03.000Z');
    assert.throws(() => repository.startRun({
      sessionId: 'demo-class', lessonRunId: assessmentCursor.lessonRunId,
      nodeId: 'P1T1-N02', gameId: 'P1T1-N02-server-assessment',
      expectedClassroomRevision: assessmentCursor.revision, durationSeconds: 600,
    }), ClassroomAssessmentRunConflictError);
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM classroom_assessment_runs
      WHERE lesson_run_id = ? AND status IN ('running', 'paused', 'reviewing')
    `).pluck().get(assessmentCursor.lessonRunId), 1);
  } finally {
    fixture.cleanup();
  }
});

test('pause freezes remaining time and invalidates every open token', () => {
  const fixture = openRunFixture();
  try {
    const paused = fixture.repository.pauseRun(
      fixture.runId, 0, new Date('2026-07-18T01:01:40.000Z'),
    );
    assert.equal(paused.status, 'paused');
    assert.equal(paused.remainingSecondsWhenPaused, 500);
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM formal_assessment_tokens WHERE used_at IS NULL
    `).pluck().get(), 0);
  } finally {
    fixture.cleanup();
  }
});

test('resume recalculates instance expiry while preserving instance identity and drafts', () => {
  const fixture = openRunFixture();
  try {
    const ids = fixture.database.prepare(`
      SELECT assessment_id FROM formal_assessment_instances ORDER BY assessment_id
    `).pluck().all();
    fixture.repository.pauseRun(fixture.runId, 0, new Date('2026-07-18T01:01:40.000Z'));
    const resumed = fixture.repository.resumeRun(
      fixture.runId, 1, new Date('2026-07-18T02:00:00.000Z'),
    );
    assert.equal(resumed.status, 'running');
    assert.equal(resumed.expiresAt, '2026-07-18T02:08:20.000Z');
    assert.deepEqual(fixture.database.prepare(`
      SELECT assessment_id FROM formal_assessment_instances ORDER BY assessment_id
    `).pluck().all(), ids);
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM formal_assessment_instances WHERE expires_at = ?
    `).pluck().get(resumed.expiresAt), 2);
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM formal_assessment_drafts
    `).pluck().get(), 1);
  } finally {
    fixture.cleanup();
  }
});

test('collect closes only open instances and consumes their tokens with one CAS', () => {
  const fixture = openRunFixture();
  try {
    const collected = fixture.repository.collectRun(
      fixture.runId, 0, new Date('2026-07-18T01:02:00.000Z'),
    );
    assert.equal(collected.status, 'closed');
    assert.equal(collected.closedReason, 'teacher-collected');
    assert.equal(collected.revision, 1);
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM formal_assessment_instances
      WHERE status = 'closed' AND closure_reason = 'cancelled'
    `).pluck().get(), 2);
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM formal_assessment_tokens WHERE used_at IS NULL
    `).pluck().get(), 0);
    assert.throws(
      () => fixture.repository.collectRun(fixture.runId, 0),
      ClassroomAssessmentRunRevisionConflictError,
    );
  } finally {
    fixture.cleanup();
  }
});

test('expiry persists idempotently and does not advance revision twice', () => {
  const fixture = openRunFixture();
  try {
    const expired = fixture.repository.expireIfDue(
      fixture.runId, new Date('2026-07-18T01:10:00.000Z'),
    );
    const again = fixture.repository.expireIfDue(
      fixture.runId, new Date('2026-07-18T02:10:00.000Z'),
    );
    assert.equal(expired.status, 'expired');
    assert.equal(expired.closedReason, 'time-expired');
    assert.equal(expired.revision, 1);
    assert.equal(again.revision, 1);
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM formal_assessment_instances WHERE closure_reason = 'expired'
    `).pluck().get(), 2);
  } finally {
    fixture.cleanup();
  }
});

test('review rejects zero and partial submissions, then opens after every eligible instance submits', () => {
  const fixture = openRunFixture();
  try {
    assert.throws(
      () => fixture.repository.beginReview(fixture.runId, 0),
      ClassroomAssessmentRunConflictError,
    );
    markSubmitted(fixture.database, 'repo-assessment-01', 'stu-01');
    assert.throws(
      () => fixture.repository.beginReview(fixture.runId, 0),
      ClassroomAssessmentRunConflictError,
    );
    markSubmitted(fixture.database, 'repo-assessment-02', 'stu-02');
    const reviewing = fixture.repository.beginReview(
      fixture.runId, 0, new Date('2026-07-18T01:03:00.000Z'),
    );
    assert.equal(reviewing.status, 'reviewing');
    assert.equal(reviewing.revision, 1);
    assert.deepEqual(fixture.repository.readSubmissionCounts(fixture.runId), {
      eligible: 2,
      submitted: 2,
    });
  } finally {
    fixture.cleanup();
  }
});

function openRunFixture() {
  const fixture = createTestDatabase();
  migrateDatabase(fixture.database);
  seedDemo(fixture.database);
  const lessons = new ClassroomLessonRunRepository(fixture.database);
  const prepared = lessons.startLessonRun({
    sessionId: 'demo-class', lessonId: 'P01-L1', expectedRevision: 0,
  }).run;
  const active = lessons.transitionLessonRun({
    sessionId: 'demo-class', lessonRunId: prepared.lessonRunId,
    expectedRevision: 1, nextStatus: 'active',
  }).run;
  const cursor = lessons.updateTeachingCursor({
    sessionId: 'demo-class', lessonRunId: active.lessonRunId, expectedRevision: 2,
    next: {
      ...active.teachingCursor, nodeId: 'P1T1-N02', unitId: 'P01-ku-02',
      pageId: 'P01-L1-P02', pageIndex: 1, phase: 'assessment',
      actionId: 'P1T1-N02-S02', actionIndex: 1, playbackStatus: 'paused',
    },
  }).run;
  const repository = new ClassroomAssessmentRunRepository(fixture.database, {
    randomId: () => 'repo-shared',
  });
  const run = repository.startRun({
    sessionId: 'demo-class', lessonRunId: cursor.lessonRunId,
    nodeId: 'P1T1-N02', gameId: 'P1T1-N02-server-assessment',
    expectedClassroomRevision: cursor.revision, durationSeconds: 600,
  }, new Date('2026-07-18T01:00:00.000Z'));
  for (const [index, studentId] of ['stu-01', 'stu-02'].entries()) {
    const assessmentId = `repo-assessment-0${index + 1}`;
    fixture.database.prepare(`
      INSERT INTO formal_assessment_instances (
        assessment_id, session_id, classroom_run_id, node_id, game_id,
        question_version, status, opened_at, expires_at, created_at
      ) VALUES (?, 'demo-class', ?, 'P1T1-N02', 'P1T1-N02-server-assessment',
        'p01-n02-v1', 'running', ?, ?, ?)
    `).run(assessmentId, run.runId, run.startedAt, run.expiresAt, run.startedAt);
    fixture.database.prepare(`
      INSERT INTO formal_assessment_tokens (
        token_hash, assessment_id, student_id, node_id,
        question_version, issued_at, expires_at
      ) VALUES (?, ?, ?, 'P1T1-N02', 'p01-n02-v1', ?, ?)
    `).run(`repo-token-${index}`, assessmentId, studentId, run.startedAt, run.expiresAt);
  }
  fixture.database.prepare(`
    INSERT INTO formal_assessment_drafts (
      assessment_id, student_id, answers_json, state_revision, updated_at
    ) VALUES ('repo-assessment-01', 'stu-01', '{}', 1, ?)
  `).run(run.startedAt);
  return { ...fixture, repository, runId: run.runId };
}

function markSubmitted(
  database: ReturnType<typeof createTestDatabase>['database'],
  assessmentId: string,
  studentId: string,
): void {
  database.prepare(`
    UPDATE formal_assessment_instances
    SET status = 'closed', closure_reason = 'submitted', closed_at = '2026-07-18T01:02:00.000Z'
    WHERE assessment_id = ?
  `).run(assessmentId);
  database.prepare(`
    INSERT INTO formal_attempts (
      attempt_id, student_id, node_id, assessment_id, game_id, score,
      completed_at, question_version, answers_json, diagnostics_json, origin
    ) VALUES (?, ?, 'P1T1-N02', ?, 'P1T1-N02-server-assessment', 80,
      '2026-07-18T01:02:00.000Z', 'p01-n02-v1', '{}', '{}', 'user')
  `).run(`repo-attempt-${studentId}`, studentId, assessmentId);
}
