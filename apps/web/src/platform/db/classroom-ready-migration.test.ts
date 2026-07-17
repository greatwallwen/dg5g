import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateDatabase } from './migrations.ts';
import { createTestDatabase } from './test-database.ts';

test('migration 012 adds classroom-ready runtime contracts', () => {
  const testDatabase = createTestDatabase();

  try {
    const result = migrateDatabase(testDatabase.database);
    const tables = new Set(testDatabase.database.prepare(`
      SELECT name FROM sqlite_master WHERE type = 'table'
    `).pluck().all() as string[]);
    const columns = (table: string) => new Set(testDatabase.database.prepare(`
      SELECT name FROM pragma_table_info(?)
    `).pluck().all(table) as string[]);

    assert.equal(result.currentVersion, 13);
    for (const table of [
      'classroom_lesson_runs',
      'classroom_assessment_runs',
      'formal_assessment_drafts',
    ]) {
      assert.equal(tables.has(table), true, table);
    }
    for (const column of [
      'delivery_channel',
      'classroom_session_id',
      'classroom_run_id',
      'attempt_number',
    ]) {
      assert.equal(columns('practice_attempts').has(column), true, column);
    }
    for (const column of ['client_kind', 'visibility_state']) {
      assert.equal(columns('device_presence').has(column), true, column);
    }
    for (const column of ['expires_at', 'closure_reason']) {
      assert.equal(columns('formal_assessment_instances').has(column), true, column);
    }
    assert.equal(columns('classroom_sessions').has('active_lesson_run_id'), true);

    const indexes = new Set(testDatabase.database.prepare(`
      SELECT name FROM sqlite_master WHERE type = 'index'
    `).pluck().all() as string[]);
    for (const index of [
      'practice_attempts_delivery_idx',
      'classroom_lesson_runs_session_identity_idx',
      'classroom_lesson_runs_one_open_idx',
      'classroom_assessment_runs_one_open_idx',
    ]) {
      assert.equal(indexes.has(index), true, index);
    }
    assert.deepEqual(testDatabase.database.pragma('foreign_key_check'), []);
  } finally {
    testDatabase.cleanup();
  }
});

test('migration 012 keeps the active lesson run owned by its classroom session', () => {
  const testDatabase = createTestDatabase();

  try {
    migrateDatabase(testDatabase.database);
    insertClassroomOwnershipFixtures(testDatabase.database);

    assert.throws(() => testDatabase.database.prepare(`
      INSERT INTO classroom_sessions (
        session_id, class_id, name, teacher_id, active_lesson_run_id
      ) VALUES (
        'session-cross-insert', 'class-cross', 'Cross Session',
        'teacher-ownership', 'lesson-run-b'
      )
    `).run(), /active lesson run must belong to its classroom session/i);
    assert.throws(() => testDatabase.database.prepare(`
      UPDATE classroom_sessions
      SET active_lesson_run_id = 'lesson-run-b'
      WHERE session_id = 'session-a'
    `).run(), /active lesson run must belong to its classroom session/i);
    assert.equal(testDatabase.database.prepare(`
      SELECT active_lesson_run_id
      FROM classroom_sessions
      WHERE session_id = 'session-a'
    `).pluck().get(), null);

    testDatabase.database.prepare(`
      UPDATE classroom_sessions
      SET active_lesson_run_id = 'lesson-run-a'
      WHERE session_id = 'session-a'
    `).run();
    assert.throws(() => testDatabase.database.prepare(`
      INSERT INTO classroom_lesson_runs (
        lesson_run_id, session_id, lesson_id, task_id, node_id, status, teaching_cursor_json
      ) VALUES (
        'lesson-run-a-open-2', 'session-a', 'lesson-a-open-2', 'P01',
        'P1T1-N02', 'paused', '{}'
      )
    `).run(), /UNIQUE constraint failed/i);
    testDatabase.database.prepare(`
      INSERT INTO classroom_lesson_runs (
        lesson_run_id, session_id, lesson_id, task_id, node_id, status, teaching_cursor_json
      ) VALUES (
        'lesson-run-a-closed', 'session-a', 'lesson-a-closed', 'P01',
        'P1T1-N02', 'closed', '{}'
      )
    `).run();
    testDatabase.database.prepare(`
      UPDATE classroom_lesson_runs
      SET status = 'closed'
      WHERE lesson_run_id = 'lesson-run-a'
    `).run();
    assert.throws(() => testDatabase.database.prepare(`
      UPDATE classroom_lesson_runs
      SET session_id = 'session-b'
      WHERE lesson_run_id = 'lesson-run-a'
    `).run(), /active lesson run must belong to its classroom session/i);
  } finally {
    testDatabase.cleanup();
  }
});

test('migration 012 keeps assessment runs in the lesson run classroom session', () => {
  const testDatabase = createTestDatabase();

  try {
    migrateDatabase(testDatabase.database);
    insertClassroomOwnershipFixtures(testDatabase.database);

    assert.throws(() => testDatabase.database.prepare(`
      INSERT INTO classroom_assessment_runs (
        run_id, lesson_run_id, session_id, node_id, game_id, status, started_at, expires_at
      ) VALUES (
        'assessment-cross-session', 'lesson-run-a', 'session-b', 'P1T1-N02',
        'node-test', 'running', '2026-07-17T01:00:00.000Z', '2026-07-17T01:10:00.000Z'
      )
    `).run(), /FOREIGN KEY constraint failed/i);

    testDatabase.database.prepare(`
      INSERT INTO classroom_assessment_runs (
        run_id, lesson_run_id, session_id, node_id, game_id, status, started_at, expires_at
      ) VALUES (
        'assessment-a', 'lesson-run-a', 'session-a', 'P1T1-N02',
        'node-test', 'running', '2026-07-17T01:00:00.000Z', '2026-07-17T01:10:00.000Z'
      )
    `).run();
    assert.throws(() => testDatabase.database.prepare(`
      INSERT INTO classroom_assessment_runs (
        run_id, lesson_run_id, session_id, node_id, game_id, status, started_at, expires_at
      ) VALUES (
        'assessment-a-open-2', 'lesson-run-a', 'session-a', 'P1T1-N02',
        'node-test', 'reviewing', '2026-07-17T01:02:00.000Z', '2026-07-17T01:12:00.000Z'
      )
    `).run(), /UNIQUE constraint failed/i);
    testDatabase.database.prepare(`
      INSERT INTO classroom_assessment_runs (
        run_id, lesson_run_id, session_id, node_id, game_id, status, started_at, expires_at
      ) VALUES (
        'assessment-a-closed', 'lesson-run-a', 'session-a', 'P1T1-N02',
        'node-test', 'closed', '2026-07-17T01:02:00.000Z', '2026-07-17T01:12:00.000Z'
      )
    `).run();
  } finally {
    testDatabase.cleanup();
  }
});

function insertClassroomOwnershipFixtures(
  database: ReturnType<typeof createTestDatabase>['database'],
): void {
  database.exec(`
    INSERT INTO users (id, username, display_name, role, password_hash)
    VALUES ('teacher-ownership', 'teacher-ownership', 'Teacher', 'teacher', 'disabled');
    INSERT INTO classroom_sessions (session_id, class_id, name, teacher_id)
    VALUES
      ('session-a', 'class-a', 'Class A', 'teacher-ownership'),
      ('session-b', 'class-b', 'Class B', 'teacher-ownership');
    INSERT INTO classroom_lesson_runs (
      lesson_run_id, session_id, lesson_id, task_id, node_id, status, teaching_cursor_json
    ) VALUES
      ('lesson-run-a', 'session-a', 'lesson-a', 'P01', 'P1T1-N02', 'active', '{}'),
      ('lesson-run-b', 'session-b', 'lesson-b', 'P01', 'P1T1-N02', 'active', '{}');
  `);
}
