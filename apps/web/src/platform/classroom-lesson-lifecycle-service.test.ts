import assert from 'node:assert/strict';
import test from 'node:test';
import { ClassroomLessonRunRepository } from './classroom-lesson-run-repository.ts';
import {
  ClassroomLessonLifecycleConflictError,
  ClassroomLessonLifecycleService,
} from './classroom-lesson-lifecycle-service.ts';
import { ClassroomSessionRepository } from './classroom-session-repository.ts';
import { seedDemo } from './db/demo-seed.ts';
import { migrateDatabase } from './db/migrations.ts';
import { createTestDatabase } from './db/test-database.ts';

test('moves one lesson run through the legal lifecycle and keeps closed immutable', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const runs = new ClassroomLessonRunRepository(fixture.database);
    const prepared = runs.startLessonRun({
      sessionId: 'demo-class',
      lessonId: 'P01-L1',
      expectedRevision: 0,
    }, new Date('2026-07-17T01:00:00.000Z')).run;
    const lifecycle = new ClassroomLessonLifecycleService(runs);

    const active = lifecycle.execute({
      sessionId: 'demo-class',
      lessonRunId: prepared.lessonRunId,
      command: { type: 'start', expectedRevision: 1 },
    }, new Date('2026-07-17T01:00:01.000Z')).run;
    assert.equal(active.status, 'active');
    assert.equal(active.revision, 2);
    assert.equal(active.startedAt, '2026-07-17T01:00:01.000Z');

    const paused = lifecycle.execute({
      sessionId: 'demo-class',
      lessonRunId: prepared.lessonRunId,
      command: { type: 'pause', expectedRevision: 2 },
    }, new Date('2026-07-17T01:00:02.000Z')).run;
    assert.equal(paused.status, 'paused');
    assert.equal(paused.teachingCursor.playbackStatus, 'paused');

    const resumed = lifecycle.execute({
      sessionId: 'demo-class',
      lessonRunId: prepared.lessonRunId,
      command: { type: 'resume', expectedRevision: 3 },
    }, new Date('2026-07-17T01:00:03.000Z')).run;
    assert.equal(resumed.status, 'active');
    assert.equal(resumed.revision, 4);

    const closed = lifecycle.execute({
      sessionId: 'demo-class',
      lessonRunId: prepared.lessonRunId,
      command: { type: 'close', expectedRevision: 4, collectAssessment: false },
    }, new Date('2026-07-17T01:00:04.000Z')).run;
    assert.equal(closed.status, 'closed');
    assert.equal(closed.teachingCursor.phase, 'close');
    assert.equal(closed.closedAt, '2026-07-17T01:00:04.000Z');
    const session = new ClassroomSessionRepository(fixture.database).readSession('demo-class');
    assert.equal(session?.status, 'preparing');
    assert.equal(session?.activeLessonRunId, undefined);
    assert.equal(session?.revision, 5);

    assert.throws(
      () => lifecycle.execute({
        sessionId: 'demo-class',
        lessonRunId: prepared.lessonRunId,
        command: { type: 'resume', expectedRevision: 5 },
      }),
      ClassroomLessonLifecycleConflictError,
    );
    assert.equal(runs.readLessonRun(prepared.lessonRunId)?.revision, 5);
    assert.equal(new ClassroomSessionRepository(fixture.database).readSession('demo-class')?.revision, 5);

    const nextLesson = runs.startLessonRun({
      sessionId: 'demo-class',
      lessonId: 'P01-L2',
      expectedRevision: 5,
    }, new Date('2026-07-17T01:00:05.000Z')).run;
    assert.equal(nextLesson.status, 'preparing');
    assert.equal(nextLesson.revision, 6);
    assert.equal(runs.readLessonRun(prepared.lessonRunId)?.status, 'closed');
    assert.equal(runs.readLessonRun(prepared.lessonRunId)?.revision, 5);
    assert.equal(new ClassroomSessionRepository(fixture.database).readSession('demo-class')?.activeLessonRunId, nextLesson.lessonRunId);
  } finally {
    fixture.cleanup();
  }
});

for (const assessmentStatus of ['running', 'paused', 'reviewing'] as const) {
  test(`requires explicit collection before closing a ${assessmentStatus} assessment and collects atomically`, () => {
    const fixture = createTestDatabase();
    try {
      migrateDatabase(fixture.database);
      seedDemo(fixture.database);
      const runs = new ClassroomLessonRunRepository(fixture.database);
      const lesson = runs.startLessonRun({
        sessionId: 'demo-class', lessonId: 'P01-L1', expectedRevision: 0,
      }).run;
      const active = new ClassroomLessonLifecycleService(runs).execute({
        sessionId: 'demo-class', lessonRunId: lesson.lessonRunId,
        command: { type: 'start', expectedRevision: 1 },
      }).run;
      insertAssessment(fixture.database, lesson.lessonRunId, assessmentStatus);
      const countsBefore = mutationCounts(fixture.database, lesson.lessonRunId);
      const lifecycle = new ClassroomLessonLifecycleService(runs);

      assert.throws(() => lifecycle.execute({
        sessionId: 'demo-class', lessonRunId: lesson.lessonRunId,
        command: { type: 'close', expectedRevision: active.revision, collectAssessment: false },
      }), ClassroomLessonLifecycleConflictError);
      assert.deepEqual(mutationCounts(fixture.database, lesson.lessonRunId), countsBefore);

      const closed = lifecycle.execute({
        sessionId: 'demo-class', lessonRunId: lesson.lessonRunId,
        command: { type: 'close', expectedRevision: active.revision, collectAssessment: true },
      }, new Date('2026-07-17T02:00:00.000Z')).run;
      assert.equal(closed.status, 'closed');
      assert.equal(closed.teachingCursor.playbackStatus, 'ended');
      assert.deepEqual(fixture.database.prepare(`
        SELECT status, closed_reason AS closedReason, revision
        FROM classroom_assessment_runs WHERE run_id = 'assessment-close-guard'
      `).get(), { status: 'closed', closedReason: 'teacher-collected', revision: 8 });
      assert.deepEqual(fixture.database.prepare(`
        SELECT status, closure_reason AS closureReason
        FROM formal_assessment_instances WHERE assessment_id = 'formal-close-guard'
      `).get(), { status: 'closed', closureReason: 'cancelled' });
      assert.equal(fixture.database.prepare(`
        SELECT used_at FROM formal_assessment_tokens WHERE token_hash = 'token-close-guard'
      `).pluck().get(), '2026-07-17T02:00:00.000Z');
    } finally {
      fixture.cleanup();
    }
  });
}

test('lesson pause leaves assessment timing and revision untouched', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const runs = new ClassroomLessonRunRepository(fixture.database);
    const lifecycle = new ClassroomLessonLifecycleService(runs);
    const lesson = runs.startLessonRun({ sessionId: 'demo-class', lessonId: 'P01-L1', expectedRevision: 0 }).run;
    const active = lifecycle.execute({
      sessionId: 'demo-class', lessonRunId: lesson.lessonRunId,
      command: { type: 'start', expectedRevision: 1 },
    }).run;
    insertAssessment(fixture.database, lesson.lessonRunId, 'running');
    const before = assessmentTiming(fixture.database);

    lifecycle.execute({
      sessionId: 'demo-class', lessonRunId: lesson.lessonRunId,
      command: { type: 'pause', expectedRevision: active.revision },
    });

    assert.deepEqual(assessmentTiming(fixture.database), before);
  } finally {
    fixture.cleanup();
  }
});

test('collector failure rolls back assessment, lesson, session, command, and topic', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const runs = new ClassroomLessonRunRepository(fixture.database);
    const normal = new ClassroomLessonLifecycleService(runs);
    const lesson = runs.startLessonRun({ sessionId: 'demo-class', lessonId: 'P01-L1', expectedRevision: 0 }).run;
    const active = normal.execute({
      sessionId: 'demo-class', lessonRunId: lesson.lessonRunId,
      command: { type: 'start', expectedRevision: 1 },
    }).run;
    insertAssessment(fixture.database, lesson.lessonRunId, 'running');
    const before = mutationCounts(fixture.database, lesson.lessonRunId);
    const failing = new ClassroomLessonLifecycleService(runs, ({ database }) => {
      database.prepare(`UPDATE classroom_assessment_runs SET status = 'closed' WHERE run_id = 'assessment-close-guard'`).run();
      throw new Error('collector failed');
    });

    assert.throws(() => failing.execute({
      sessionId: 'demo-class', lessonRunId: lesson.lessonRunId,
      command: { type: 'close', expectedRevision: active.revision, collectAssessment: true },
    }), /collector failed/);
    assert.deepEqual(mutationCounts(fixture.database, lesson.lessonRunId), before);
  } finally {
    fixture.cleanup();
  }
});

function insertAssessment(
  database: ReturnType<typeof createTestDatabase>['database'],
  lessonRunId: string,
  status: 'running' | 'paused' | 'reviewing',
): void {
  database.prepare(`
    INSERT INTO classroom_assessment_runs (
      run_id, lesson_run_id, session_id, node_id, game_id, status,
      started_at, expires_at, remaining_seconds_when_paused, review_started_at, revision
    ) VALUES ('assessment-close-guard', ?, 'demo-class', 'P1T1-N01', 'game-close-guard', ?,
      '2026-07-17T01:10:00.000Z', '2026-07-17T01:20:00.000Z',
      CASE WHEN ? = 'paused' THEN 300 ELSE NULL END,
      CASE WHEN ? = 'reviewing' THEN '2026-07-17T01:15:00.000Z' ELSE NULL END, 7)
  `).run(lessonRunId, status, status, status);
  database.prepare(`
    INSERT INTO formal_assessment_instances (
      assessment_id, session_id, node_id, game_id, question_version, status,
      opened_at, classroom_run_id, expires_at
    ) VALUES ('formal-close-guard', 'demo-class', 'P1T1-N01', 'game-close-guard',
      'v1', 'running', '2026-07-17T01:10:00.000Z', 'assessment-close-guard',
      '2026-07-17T01:20:00.000Z')
  `).run();
  database.prepare(`
    INSERT INTO formal_assessment_tokens (
      token_hash, assessment_id, student_id, node_id, question_version, expires_at
    ) SELECT 'token-close-guard', 'formal-close-guard', id, 'P1T1-N01', 'v1',
      '2026-07-17T01:20:00.000Z'
    FROM users WHERE username = 'student01'
  `).run();
}

function assessmentTiming(database: ReturnType<typeof createTestDatabase>['database']) {
  return database.prepare(`
    SELECT status, expires_at AS expiresAt,
      remaining_seconds_when_paused AS remainingSecondsWhenPaused, revision
    FROM classroom_assessment_runs WHERE run_id = 'assessment-close-guard'
  `).get();
}

function mutationCounts(
  database: ReturnType<typeof createTestDatabase>['database'],
  lessonRunId: string,
) {
  return {
    lesson: database.prepare(`SELECT status, revision FROM classroom_lesson_runs WHERE lesson_run_id = ?`).get(lessonRunId),
    session: database.prepare(`SELECT status, active_lesson_run_id AS activeLessonRunId, revision FROM classroom_sessions WHERE session_id = 'demo-class'`).get(),
    assessment: assessmentTiming(database),
    instance: database.prepare(`SELECT status, closed_at AS closedAt, closure_reason AS closureReason FROM formal_assessment_instances WHERE assessment_id = 'formal-close-guard'`).get(),
    token: database.prepare(`SELECT used_at AS usedAt FROM formal_assessment_tokens WHERE token_hash = 'token-close-guard'`).get(),
    commands: database.prepare(`SELECT COUNT(*) FROM classroom_commands WHERE session_id = 'demo-class'`).pluck().get(),
    topic: database.prepare(`SELECT version FROM snapshot_versions WHERE topic = 'classroom:demo-class'`).pluck().get(),
  };
}
