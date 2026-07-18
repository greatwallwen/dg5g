import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ClassroomLessonRunConflictError,
  ClassroomLessonRunRevisionConflictError,
  ClassroomLessonRunRepository,
} from './classroom-lesson-run-repository.ts';
import { ClassroomSessionRepository } from './classroom-session-repository.ts';
import { seedDemo } from './db/demo-seed.ts';
import { migrateDatabase } from './db/migrations.ts';
import { createTestDatabase } from './db/test-database.ts';

test('starts exactly one open lesson run with one atomic session revision', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    fixture.database.prepare(`
      INSERT INTO classroom_sessions (
        session_id, class_id, name, teacher_id, status, active_node_id,
        active_unit_id, revision, state_json
      )
      SELECT 'lesson-start-test', class_id, 'Lesson start test', teacher_id,
        'paused', active_node_id, active_unit_id, 0, state_json
      FROM classroom_sessions WHERE session_id = 'demo-class'
    `).run();
    const stateJsonBefore = fixture.database.prepare(`
      SELECT state_json FROM classroom_sessions WHERE session_id = 'lesson-start-test'
    `).pluck().get();
    const classroomTopicBefore = topicVersion(fixture.database, 'classroom:lesson-start-test');
    const repository = new ClassroomLessonRunRepository(fixture.database);

    const started = repository.startLessonRun({
      sessionId: 'lesson-start-test',
      lessonId: 'P01-L1',
      expectedRevision: 0,
    }, new Date('2026-07-17T01:00:00.000Z'));

    assert.equal(started.run.status, 'preparing');
    assert.equal(started.run.revision, 1);
    assert.equal(started.run.teachingCursor.revision, 1);
    assert.equal(started.command.revision, 1);
    assert.equal(repository.readOpenLessonRun('lesson-start-test')?.lessonRunId, started.run.lessonRunId);
    const session = new ClassroomSessionRepository(fixture.database).readSession('lesson-start-test');
    assert.equal(session?.activeLessonRunId, started.run.lessonRunId);
    assert.equal(session?.revision, 1);
    assert.deepEqual(session?.teachingCursor, started.run.teachingCursor);
    assert.equal(fixture.database.prepare(`
      SELECT state_json FROM classroom_sessions WHERE session_id = 'lesson-start-test'
    `).pluck().get(), stateJsonBefore);
    assert.equal(topicVersion(fixture.database, 'classroom:lesson-start-test'), classroomTopicBefore + 1);

    assert.throws(
      () => repository.startLessonRun({
        sessionId: 'lesson-start-test',
        lessonId: 'P01-L2',
        expectedRevision: 1,
      }, new Date('2026-07-17T01:00:01.000Z')),
      ClassroomLessonRunConflictError,
    );
    assert.equal(repository.readOpenLessonRun('lesson-start-test')?.lessonRunId, started.run.lessonRunId);
    assert.equal(new ClassroomSessionRepository(fixture.database).readSession('lesson-start-test')?.revision, 1);
    assert.equal(topicVersion(fixture.database, 'classroom:lesson-start-test'), classroomTopicBefore + 1);
  } finally {
    fixture.cleanup();
  }
});

test('reads a non-empty V1 session through the relational cursor without rewriting legacy JSON', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const sessions = new ClassroomSessionRepository(fixture.database);
    const legacy = sessions.readSession('demo-class');
    assert.ok(legacy);
    const legacyJson = JSON.stringify({
      ...legacy.state,
      currentPageId: 'P1-TEACH-CONSOLE-N01',
    });
    fixture.database.prepare(`
      UPDATE classroom_sessions SET state_json = ? WHERE session_id = 'demo-class'
    `).run(legacyJson);
    const lessonRuns = new ClassroomLessonRunRepository(fixture.database);

    const started = lessonRuns.startLessonRun({
      sessionId: 'demo-class',
      lessonId: 'P01-L1',
      expectedRevision: 0,
    }, new Date('2026-07-17T01:00:00.000Z'));
    const compatible = sessions.readSession('demo-class');

    assert.equal(compatible?.revision, 1);
    assert.equal(compatible?.state.lesson.revision, 1);
    assert.equal(compatible?.state.lesson.playback.revision, 1);
    assert.equal(compatible?.state.lesson.activeNodeId, started.run.teachingCursor.nodeId);
    assert.equal(compatible?.state.currentSlideId, started.run.teachingCursor.actionId);
    assert.equal(compatible?.state.teacherSlideId, started.run.teachingCursor.actionId);
    assert.equal(compatible?.state.teacherSlideIndex, started.run.teachingCursor.pageIndex + 1);
    assert.equal(compatible?.state.playbackCursor?.actionId, started.run.teachingCursor.actionId);
    assert.equal(fixture.database.prepare(`
      SELECT state_json FROM classroom_sessions WHERE session_id = 'demo-class'
    `).pluck().get(), legacyJson);

    const active = lessonRuns.transitionLessonRun({
      sessionId: 'demo-class',
      lessonRunId: started.run.lessonRunId,
      expectedRevision: started.run.revision,
      nextStatus: 'active',
    }, new Date('2026-07-17T01:00:01.000Z')).run;
    const closed = lessonRuns.transitionLessonRun({
      sessionId: 'demo-class',
      lessonRunId: active.lessonRunId,
      expectedRevision: active.revision,
      nextStatus: 'closed',
    }, new Date('2026-07-17T01:00:02.000Z')).run;
    const afterClose = sessions.readSession('demo-class');

    assert.equal(afterClose?.revision, closed.revision);
    assert.equal(afterClose?.activeLessonRunId, undefined);
    assert.equal(afterClose?.state.lesson.revision, closed.revision);
    assert.equal(afterClose?.state.lesson.playback.revision, closed.revision);
    assert.equal(afterClose?.state.lesson.phase, 'close');
    assert.equal(fixture.database.prepare(`
      SELECT state_json FROM classroom_sessions WHERE session_id = 'demo-class'
    `).pluck().get(), legacyJson);
  } finally {
    fixture.cleanup();
  }
});

test('mutates the teaching cursor with one run-and-session CAS and zero stale writes', () => {
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
    const started = runs.transitionLessonRun({
      sessionId: 'demo-class', lessonRunId: prepared.lessonRunId,
      expectedRevision: 1, nextStatus: 'active',
    }, new Date('2026-07-17T01:00:01.000Z')).run;
    const topicBefore = topicVersion(fixture.database, 'classroom:demo-class');

    const result = runs.updateTeachingCursor({
      sessionId: 'demo-class',
      lessonRunId: started.lessonRunId,
      expectedRevision: 2,
      next: {
        nodeId: 'P1T1-N02',
        unitId: 'P01-ku-02',
        pageId: 'P01-L1-P02',
        pageIndex: 1,
        phase: 'question',
        actionId: 'P1T1-N02-S02',
        actionIndex: 1,
        playbackStatus: 'paused',
        positionMs: 2400,
        rate: 1.25,
        audioOwner: 'projector',
      },
    }, new Date('2026-07-17T01:00:02.000Z'));

    assert.equal(result.run.revision, 3);
    assert.equal(result.run.nodeId, 'P1T1-N02');
    assert.equal(result.run.teachingCursor.updatedAt, '2026-07-17T01:00:02.000Z');
    assert.equal(result.command.nodeId, 'P1T1-N02');
    assert.equal(new ClassroomSessionRepository(fixture.database).readSession('demo-class')?.activeNodeId, 'P1T1-N02');
    assert.equal(topicVersion(fixture.database, 'classroom:demo-class'), topicBefore + 1);
    const commandCountBefore = commandCount(fixture.database, 'demo-class');

    assert.throws(() => runs.updateTeachingCursor({
      sessionId: 'demo-class',
      lessonRunId: started.lessonRunId,
      expectedRevision: 2,
      next: { ...result.run.teachingCursor, pageIndex: 2, pageId: 'P01-L1-P03' },
    }), ClassroomLessonRunRevisionConflictError);
    assert.equal(runs.readLessonRun(started.lessonRunId)?.revision, 3);
    assert.equal(commandCount(fixture.database, 'demo-class'), commandCountBefore);
    assert.equal(topicVersion(fixture.database, 'classroom:demo-class'), topicBefore + 1);
  } finally {
    fixture.cleanup();
  }
});

test('rejects cursor movement while the lesson is paused without any write', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const runs = new ClassroomLessonRunRepository(fixture.database);
    const prepared = runs.startLessonRun({ sessionId: 'demo-class', lessonId: 'P01-L1', expectedRevision: 0 }).run;
    runs.transitionLessonRun({ sessionId: 'demo-class', lessonRunId: prepared.lessonRunId, expectedRevision: 1, nextStatus: 'active' });
    const paused = runs.transitionLessonRun({ sessionId: 'demo-class', lessonRunId: prepared.lessonRunId, expectedRevision: 2, nextStatus: 'paused' }).run;
    const before = {
      run: runs.readLessonRun(prepared.lessonRunId),
      commandCount: commandCount(fixture.database, 'demo-class'),
      topic: topicVersion(fixture.database, 'classroom:demo-class'),
    };

    assert.throws(() => runs.updateTeachingCursor({
      sessionId: 'demo-class', lessonRunId: prepared.lessonRunId, expectedRevision: 3,
      next: { ...paused.teachingCursor, pageId: 'P01-L1-P02', pageIndex: 1 },
    }), ClassroomLessonRunConflictError);
    assert.deepEqual(runs.readLessonRun(prepared.lessonRunId), before.run);
    assert.equal(commandCount(fixture.database, 'demo-class'), before.commandCount);
    assert.equal(topicVersion(fixture.database, 'classroom:demo-class'), before.topic);
  } finally {
    fixture.cleanup();
  }
});

test('reads a session after a closed lesson and a later non-cursor mutation', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const runs = new ClassroomLessonRunRepository(fixture.database);
    const sessions = new ClassroomSessionRepository(fixture.database);
    const prepared = runs.startLessonRun({ sessionId: 'demo-class', lessonId: 'P01-L1', expectedRevision: 0 }).run;
    runs.transitionLessonRun({ sessionId: 'demo-class', lessonRunId: prepared.lessonRunId, expectedRevision: 1, nextStatus: 'active' });
    runs.transitionLessonRun({ sessionId: 'demo-class', lessonRunId: prepared.lessonRunId, expectedRevision: 2, nextStatus: 'closed' });
    const closed = sessions.readSession('demo-class');
    assert.ok(closed);

    sessions.commitTeacherMutation({
      sessionId: 'demo-class',
      expectedRevision: 3,
      next: {
        status: 'preparing',
        activeNodeId: closed.activeNodeId!,
        activeUnitId: closed.activeUnitId!,
        state: {
          ...closed.state,
          lesson: {
            ...closed.state.lesson,
            activeNodeId: closed.activeNodeId!,
            activeUnitId: closed.activeUnitId!,
            revision: 4,
            playback: { ...closed.state.lesson.playback, revision: 4 },
          },
          reviewState: 'completed',
        },
      },
      command: {
        phase: closed.state.lesson.phase, route: '/classroom/demo-class',
        nodeId: closed.activeNodeId!, unitId: closed.activeUnitId!,
      },
    });

    const fresh = sessions.readSession('demo-class');
    assert.equal(fresh?.revision, 4);
    assert.equal(fresh?.activeLessonRunId, undefined);
    assert.equal(fresh?.teachingCursor, undefined);
    assert.equal(fresh?.state.reviewState, 'completed');
  } finally {
    fixture.cleanup();
  }
});

function topicVersion(
  database: ReturnType<typeof createTestDatabase>['database'],
  topic: string,
): number {
  return Number(database.prepare(`
    SELECT version FROM snapshot_versions WHERE topic = ?
  `).pluck().get(topic) ?? 0);
}

function commandCount(
  database: ReturnType<typeof createTestDatabase>['database'],
  sessionId: string,
): number {
  return Number(database.prepare(`
    SELECT COUNT(*) FROM classroom_commands WHERE session_id = ?
  `).pluck().get(sessionId));
}
