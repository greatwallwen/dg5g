import assert from 'node:assert/strict';
import test from 'node:test';
import { ClassroomLessonRunRepository } from './classroom-lesson-run-repository.ts';
import { ensureDemoClassroomReady } from './demo-classroom-ready.ts';
import { resetDemo, seedDemo } from './db/demo-seed.ts';
import { migrateDatabase } from './db/migrations.ts';
import { createTestDatabase } from './db/test-database.ts';

test('provisions one idempotent paused P01 second-period run for the demo workbench', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);

    const first = ensureDemoClassroomReady(
      fixture.database,
      new Date('2026-07-19T01:00:00.000Z'),
    );
    const second = ensureDemoClassroomReady(
      fixture.database,
      new Date('2026-07-19T02:00:00.000Z'),
    );

    assert.equal(first.lessonRunId, second.lessonRunId);
    assert.equal(first.lessonId, 'P01-L2');
    assert.equal(first.nodeId, 'P1T1-N02');
    assert.equal(first.status, 'paused');
    assert.equal(first.teachingCursor.unitId, 'P01-ku-02');
    assert.equal(first.teachingCursor.pageId, 'P01-L2-P01');
    assert.equal(first.teachingCursor.playbackStatus, 'paused');
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM classroom_lesson_runs
      WHERE session_id = 'demo-class' AND status IN ('preparing', 'active', 'paused')
    `).pluck().get(), 1);
    assert.deepEqual(fixture.database.prepare(`
      SELECT status, active_node_id AS activeNodeId, active_unit_id AS activeUnitId,
        active_lesson_run_id AS activeLessonRunId, revision
      FROM classroom_sessions WHERE session_id = 'demo-class'
    `).get(), {
      status: 'paused',
      activeNodeId: 'P1T1-N02',
      activeUnitId: 'P01-ku-02',
      activeLessonRunId: first.lessonRunId,
      revision: first.revision,
    });
    assert.equal(fixture.database.prepare(
      "SELECT COUNT(*) FROM classroom_participation WHERE session_id = 'demo-class'",
    ).pluck().get(), 0);
  } finally {
    fixture.cleanup();
  }
});

test('demo reset removes the old classroom run before a fresh resumable run is provisioned', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const oldRun = ensureDemoClassroomReady(fixture.database);

    const repository = new ClassroomLessonRunRepository(fixture.database);
    repository.transitionLessonRun({
      sessionId: 'demo-class',
      lessonRunId: oldRun.lessonRunId,
      expectedRevision: oldRun.revision,
      nextStatus: 'active',
    });
    resetDemo(fixture.database);
    const freshRun = ensureDemoClassroomReady(fixture.database);

    assert.notEqual(freshRun.lessonRunId, oldRun.lessonRunId);
    assert.equal(freshRun.status, 'paused');
    assert.equal(repository.readLessonRun(oldRun.lessonRunId), undefined);
  } finally {
    fixture.cleanup();
  }
});
