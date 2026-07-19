import assert from 'node:assert/strict';
import test from 'node:test';
import { ClassroomLessonRunRepository } from './classroom-lesson-run-repository.ts';
import { ensureDemoClassroomReady } from './demo-classroom-ready.ts';
import { seedDemo } from './db/demo-seed.ts';
import { migrateDatabase } from './db/migrations.ts';
import { createTestDatabase } from './db/test-database.ts';

test('normalizes a fresh demo seed to the clean first-lesson workbench', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    ensureDemoClassroomReady(fixture.database);
    const firstRevision = fixture.database.prepare(`
      SELECT revision FROM classroom_sessions WHERE session_id = 'demo-class'
    `).pluck().get();
    ensureDemoClassroomReady(fixture.database);

    assert.deepEqual(fixture.database.prepare(`
      SELECT status, active_node_id AS activeNodeId, active_unit_id AS activeUnitId,
        active_lesson_run_id AS activeLessonRunId
      FROM classroom_sessions WHERE session_id = 'demo-class'
    `).get(), {
      status: 'preparing', activeNodeId: null, activeUnitId: null, activeLessonRunId: null,
    });
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM classroom_lesson_runs
      WHERE session_id = 'demo-class' AND status IN ('preparing', 'active', 'paused')
    `).pluck().get(), 0);
    assert.equal(fixture.database.prepare(`
      SELECT revision FROM classroom_sessions WHERE session_id = 'demo-class'
    `).pluck().get(), firstRevision);
  } finally {
    fixture.cleanup();
  }
});

test('never replaces an existing open lesson run', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const repository = new ClassroomLessonRunRepository(fixture.database);
    const run = repository.startLessonRun({
      sessionId: 'demo-class', lessonId: 'P01-L1', expectedRevision: 0,
    }).run;

    ensureDemoClassroomReady(fixture.database);

    assert.equal(repository.readOpenLessonRun('demo-class')?.lessonRunId, run.lessonRunId);
  } finally {
    fixture.cleanup();
  }
});
