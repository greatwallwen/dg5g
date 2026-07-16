import assert from 'node:assert/strict';
import test from 'node:test';
import { seedBase } from './db/demo-seed.ts';
import { readMigrations } from './db/migrations.ts';
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

function topicVersion(
  database: ReturnType<typeof createTestDatabase>['database'],
  topic: string,
): number {
  return database.prepare(`SELECT version FROM snapshot_versions WHERE topic = ?`)
    .pluck().get(topic) as number;
}
