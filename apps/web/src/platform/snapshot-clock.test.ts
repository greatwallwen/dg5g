import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateDatabase } from './db/migrations.ts';
import { createTestDatabase } from './db/test-database.ts';
import { SnapshotClock, SnapshotTopicNotFoundError } from './snapshot-clock.ts';

test('snapshot clock reads one stable topic version and timestamp', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    const clock = new SnapshotClock(fixture.database);

    const global = clock.read('global');

    assert.equal(global.version, 0);
    assert.match(global.updatedAt, /^\d{4}-\d{2}-\d{2}/);
    assert.throws(
      () => clock.read('learning:missing-student'),
      SnapshotTopicNotFoundError,
    );
  } finally {
    fixture.cleanup();
  }
});

test('snapshot clock advances deduplicated scoped topics and global exactly once', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    const clock = new SnapshotClock(fixture.database);
    const updatedAt = '2026-07-16T01:10:00.000Z';

    const result = clock.advance([
      'learning:stu-01',
      'classroom:demo-class',
      'learning:stu-01',
    ], updatedAt);

    assert.deepEqual(result, {
      globalVersion: 1,
      topicVersions: {
        'learning:stu-01': 1,
        'classroom:demo-class': 1,
      },
    });
    assert.deepEqual(clock.read('global'), { version: 1, updatedAt });
    assert.deepEqual(clock.read('learning:stu-01'), { version: 1, updatedAt });
    assert.deepEqual(clock.read('classroom:demo-class'), { version: 1, updatedAt });
  } finally {
    fixture.cleanup();
  }
});

test('snapshot clock participates in its caller transaction and rolls back atomically', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    const clock = new SnapshotClock(fixture.database);
    const transaction = fixture.database.transaction(() => {
      clock.advance(['learning:stu-01'], '2026-07-16T01:11:00.000Z');
      throw new Error('rollback');
    });

    assert.throws(() => transaction.immediate(), /rollback/);
    assert.equal(clock.read('global').version, 0);
    assert.throws(
      () => clock.read('learning:stu-01'),
      SnapshotTopicNotFoundError,
    );
  } finally {
    fixture.cleanup();
  }
});

test('snapshot clock rejects an empty scoped advance', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    const clock = new SnapshotClock(fixture.database);

    assert.throws(() => clock.advance([]), /at least one scoped topic/i);
    assert.equal(clock.read('global').version, 0);
  } finally {
    fixture.cleanup();
  }
});
