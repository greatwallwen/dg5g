import assert from 'node:assert/strict';
import test from 'node:test';
import { seedBase } from './db/demo-seed.ts';
import { migrateDatabase, readMigrations } from './db/migrations.ts';
import { createTestDatabase } from './db/test-database.ts';

test('migration 006 backfills revision seven and never lowers a newer classroom topic', () => {
  const fixture = createTestDatabase();
  try {
    const migrations = readMigrations();
    for (const migration of migrations.filter(({ version }) => version <= 5)) {
      fixture.database.exec(migration.sql);
    }
    seedBase(fixture.database);
    fixture.database.exec(`
      UPDATE classroom_sessions
      SET revision = 7, updated_at = '2026-07-16T02:00:00.000Z'
      WHERE session_id = 'demo-class';
      INSERT INTO classroom_sessions (
        session_id, class_id, name, teacher_id, status, active_node_id,
        active_unit_id, revision, state_json
      ) VALUES (
        'topic-ahead', 'demo-class', 'Topic Ahead', 'teacher-01', 'paused',
        'P1T1-N02', 'P01-ku-02', 7, '{}'
      );
      INSERT INTO snapshot_versions (topic, version)
      VALUES ('classroom:topic-ahead', 9);
    `);

    const migration006 = migrations.find(({ version }) => version === 6);
    assert.ok(migration006);
    fixture.database.exec(migration006.sql);

    assert.equal(topicVersion(fixture.database, 'classroom:demo-class'), 7);
    assert.equal(topicVersion(fixture.database, 'classroom:topic-ahead'), 9);
  } finally {
    fixture.cleanup();
  }
});

test('migrations 012 and 013 preserve schema 11 activity, output, review, and classroom facts', () => {
  const fixture = createTestDatabase();
  try {
    applyMigrationsThrough(fixture.database, 11);
    fixture.database.exec(`
      INSERT INTO users (id, username, display_name, role, password_hash)
      VALUES
        ('teacher-v11', 'teacher-v11', 'Teacher v11', 'teacher', 'disabled'),
        ('student-v11', 'student-v11', 'Student v11', 'student', 'disabled');
      INSERT INTO classroom_sessions (
        session_id, class_id, name, teacher_id, status, active_node_id,
        active_unit_id, revision, state_json, created_at, updated_at, closed_at
      ) VALUES (
        'session-v11', 'class-v11', 'Classroom v11', 'teacher-v11', 'active',
        'P1T1-N02', 'P01-ku-02', 7, '{"phase":"teach"}',
        '2026-07-16T01:00:00.000Z', '2026-07-16T01:30:00.000Z', NULL
      );
      INSERT INTO practice_attempts (
        attempt_id, student_id, activity_id, node_id, response_json,
        result_json, artifact_json, passed, origin, attempted_at
      ) VALUES (
        'activity-v11', 'student-v11', 'P1T1-N02-practice-01', 'P1T1-N02',
        '{"answer":"A"}', '{"score":1}', '{"trace":"kept"}', 1, 'user',
        '2026-07-16T01:10:00.000Z'
      );
      INSERT INTO professional_outputs (
        output_id, student_id, task_id, node_id, status, content_json,
        submitted_at, created_at, updated_at, current_version, state_revision, origin
      ) VALUES (
        'output-v11', 'student-v11', 'P01', 'P1T1-N04', 'verified',
        '{"summary":"preserve exactly"}', '2026-07-16T01:20:00.000Z',
        '2026-07-16T01:15:00.000Z', '2026-07-16T01:25:00.000Z', 1, 3, 'user'
      );
      INSERT INTO professional_output_versions (
        output_id, task_id, version, schema_version, fields_json, upstream_refs_json, created_at
      ) VALUES (
        'output-v11', 'P01', 1, 1, '{"summary":"preserve exactly"}', '[]',
        '2026-07-16T01:15:00.000Z'
      );
      INSERT INTO output_reviews (
        review_id, output_id, reviewer_id, status, score, feedback, reviewed_at, origin
      ) VALUES (
        'review-v11', 'output-v11', 'teacher-v11', 'verified', 92.5,
        'Keep this review unchanged.', '2026-07-16T01:25:00.000Z', 'user'
      );
    `);

    const readSchema11Facts = () => ({
      activity: fixture.database.prepare(`
        SELECT attempt_id, student_id, activity_id, node_id, response_json,
          result_json, artifact_json, passed, origin, attempted_at
        FROM practice_attempts WHERE attempt_id = 'activity-v11'
      `).get(),
      output: fixture.database.prepare(`
        SELECT output_id, student_id, task_id, node_id, status, content_json,
          submitted_at, created_at, updated_at, current_version, state_revision, origin
        FROM professional_outputs WHERE output_id = 'output-v11'
      `).get(),
      review: fixture.database.prepare(`
        SELECT review_id, output_id, reviewer_id, status, score, feedback, reviewed_at, origin
        FROM output_reviews WHERE review_id = 'review-v11'
      `).get(),
      classroomSession: fixture.database.prepare(`
        SELECT session_id, class_id, name, teacher_id, status, active_node_id,
          active_unit_id, revision, state_json, created_at, updated_at, closed_at
        FROM classroom_sessions WHERE session_id = 'session-v11'
      `).get(),
    });
    const before = readSchema11Facts();

    const result = migrateDatabase(fixture.database);

    assert.deepEqual(result.appliedVersions, [12, 13]);
    assert.equal(result.currentVersion, 13);
    assert.deepEqual(readSchema11Facts(), before);
    assert.deepEqual(fixture.database.prepare(`
      SELECT delivery_channel AS deliveryChannel,
        classroom_session_id AS classroomSessionId,
        classroom_run_id AS classroomRunId,
        attempt_number AS attemptNumber
      FROM practice_attempts WHERE attempt_id = 'activity-v11'
    `).get(), {
      deliveryChannel: 'self-study',
      classroomSessionId: null,
      classroomRunId: null,
      attemptNumber: 1,
    });
    assert.deepEqual(fixture.database.pragma('foreign_key_check'), []);
  } finally {
    fixture.cleanup();
  }
});

function topicVersion(
  database: ReturnType<typeof createTestDatabase>['database'],
  topic: string,
): number {
  return database.prepare(`SELECT version FROM snapshot_versions WHERE topic = ?`)
    .pluck().get(topic) as number;
}

function applyMigrationsThrough(
  database: ReturnType<typeof createTestDatabase>['database'],
  targetVersion: number,
): void {
  database.exec(`
    CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) STRICT
  `);
  for (const migration of readMigrations().filter(({ version }) => version <= targetVersion)) {
    database.transaction(() => {
      database.exec(migration.sql);
      database.prepare(`
        INSERT INTO schema_migrations (version, name, checksum)
        VALUES (?, ?, ?)
      `).run(migration.version, migration.name, migration.checksum);
      database.pragma(`user_version = ${migration.version}`);
    })();
  }
}
