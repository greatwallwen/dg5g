import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateDatabase, readMigrations } from './migrations.ts';
import { createTestDatabase } from './test-database.ts';

test('applies ordered migrations once and replays idempotently', () => {
  const testDatabase = createTestDatabase();

  try {
    const first = migrateDatabase(testDatabase.database);
    const replay = migrateDatabase(testDatabase.database);
    const recorded = testDatabase.database.prepare(
      'SELECT version FROM schema_migrations ORDER BY version',
    ).all() as Array<{ version: number }>;

    assert.deepEqual(first.appliedVersions, [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.deepEqual(replay.appliedVersions, []);
    assert.equal(replay.currentVersion, 8);
    assert.deepEqual(recorded.map(({ version }) => version), [1, 2, 3, 4, 5, 6, 7, 8]);
  } finally {
    testDatabase.cleanup();
  }
});

test('rejects a database whose schema version is newer than this runtime', () => {
  const testDatabase = createTestDatabase();

  try {
    testDatabase.database.pragma('user_version = 9');
    assert.throws(
      () => migrateDatabase(testDatabase.database),
      /schema version 9 is newer than supported version 8/i,
    );
  } finally {
    testDatabase.cleanup();
  }
});

test('rejects migration history ahead of PRAGMA user_version', () => {
  const testDatabase = createTestDatabase();

  try {
    migrateDatabase(testDatabase.database);
    testDatabase.database.pragma('user_version = 7');
    assert.throws(
      () => migrateDatabase(testDatabase.database),
      /migration history version 8 does not match PRAGMA user_version 7/i,
    );
  } finally {
    testDatabase.cleanup();
  }
});

test('rejects PRAGMA user_version ahead of migration history', () => {
  const testDatabase = createTestDatabase();

  try {
    migrateDatabase(testDatabase.database);
    testDatabase.database.prepare('DELETE FROM schema_migrations WHERE version = 8').run();
    assert.throws(
      () => migrateDatabase(testDatabase.database),
      /migration history version 7 does not match PRAGMA user_version 8/i,
    );
  } finally {
    testDatabase.cleanup();
  }
});

test('rejects migration history versions unsupported by this runtime', () => {
  const testDatabase = createTestDatabase();

  try {
    migrateDatabase(testDatabase.database);
    testDatabase.database.prepare(`
      INSERT INTO schema_migrations (version, name, checksum)
        VALUES (9, 'unexpected', 'unexpected')
    `).run();
    assert.throws(
      () => migrateDatabase(testDatabase.database),
      /migration history contains unsupported version 9/i,
    );
  } finally {
    testDatabase.cleanup();
  }
});

test('rejects a non-empty schema with no migration history instead of adopting tables', () => {
  const testDatabase = createTestDatabase();

  try {
    testDatabase.database.exec('CREATE TABLE preexisting_data (id INTEGER PRIMARY KEY) STRICT;');
    assert.throws(
      () => migrateDatabase(testDatabase.database),
      /migration history is empty for a non-empty database schema/i,
    );
  } finally {
    testDatabase.cleanup();
  }
});

test('rejects an applied migration whose recorded checksum has drifted', () => {
  const testDatabase = createTestDatabase();

  try {
    migrateDatabase(testDatabase.database);
    testDatabase.database.prepare(`
      UPDATE schema_migrations SET checksum = 'tampered' WHERE version = 2
    `).run();
    assert.throws(
      () => migrateDatabase(testDatabase.database),
      /does not match its recorded checksum/i,
    );
  } finally {
    testDatabase.cleanup();
  }
});

test('creates the exact versioned domain tables without superseded storage models', () => {
  const testDatabase = createTestDatabase();

  try {
    migrateDatabase(testDatabase.database);
    const tables = new Set(testDatabase.database.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
    `).pluck().all() as string[]);
    const requiredTables = [
      'snapshot_versions',
      'learning_events',
      'formal_attempts',
      'professional_outputs',
      'professional_output_versions',
      'output_reviews',
      'self_study_cursors',
      'frozen_task_scores',
      'classroom_sessions',
      'classroom_members',
      'classroom_participation',
      'classroom_commands',
      'device_presence',
      'command_acks',
    ];
    const supersededTables = [
      'learning_progress',
      'learning_scores',
      'learning_outputs',
      'learning_cursors',
      'classes',
      'class_memberships',
      'classroom_devices',
      'classroom_command_acks',
    ];

    for (const table of requiredTables) assert.equal(tables.has(table), true, table);
    for (const table of supersededTables) assert.equal(tables.has(table), false, table);
  } finally {
    testDatabase.cleanup();
  }
});

test('enforces authentication, learning, and classroom constraints', () => {
  const testDatabase = createTestDatabase();

  try {
    migrateDatabase(testDatabase.database);

    assert.throws(
      () => testDatabase.database.prepare(`
        INSERT INTO users (id, username, display_name, role, password_hash)
        VALUES ('invalid-role', 'invalid-role', 'Invalid', 'admin', 'disabled')
      `).run(),
      /CHECK constraint failed/i,
    );
    assert.throws(
      () => testDatabase.database.prepare(`
        INSERT INTO formal_attempts (attempt_id, student_id, node_id, score)
        VALUES ('attempt-invalid', 'missing-student', 'P1T1-N01', 101)
      `).run(),
      /CHECK constraint failed|FOREIGN KEY constraint failed/i,
    );
    assert.throws(
      () => testDatabase.database.prepare(`
        INSERT INTO classroom_members (session_id, student_id)
        VALUES ('missing-class', 'missing-student')
      `).run(),
      /FOREIGN KEY constraint failed/i,
    );
  } finally {
    testDatabase.cleanup();
  }
});

test('enforces event, attempt, and classroom revision uniqueness', () => {
  const testDatabase = createTestDatabase();

  try {
    migrateDatabase(testDatabase.database);
    testDatabase.database.exec(`
      INSERT INTO users (id, username, display_name, role, password_hash)
      VALUES
        ('teacher-unique', 'teacher-unique', 'Teacher', 'teacher', 'disabled'),
        ('student-unique', 'student-unique', 'Student', 'student', 'disabled');
      INSERT INTO classroom_sessions (session_id, class_id, name, teacher_id)
      VALUES ('session-unique', 'class-unique', 'Class', 'teacher-unique');
      INSERT INTO learning_events (event_id, student_id, node_id, event_type)
      VALUES ('event-unique', 'student-unique', 'P1T1-N01', 'section_completed');
      INSERT INTO formal_attempts (attempt_id, student_id, node_id, score)
      VALUES ('attempt-unique', 'student-unique', 'P1T1-N01', 80);
      INSERT INTO classroom_commands (command_id, session_id, revision, kind)
      VALUES ('command-unique-1', 'session-unique', 1, 'phase_changed');
    `);

    assert.throws(
      () => testDatabase.database.prepare(`
        INSERT INTO learning_events (event_id, student_id, node_id, event_type)
        VALUES ('event-unique', 'student-unique', 'P1T1-N02', 'section_completed')
      `).run(),
      /UNIQUE constraint failed/i,
    );
    assert.throws(
      () => testDatabase.database.prepare(`
        INSERT INTO formal_attempts (attempt_id, student_id, node_id, score)
        VALUES ('attempt-unique', 'student-unique', 'P1T1-N02', 90)
      `).run(),
      /UNIQUE constraint failed/i,
    );
    assert.throws(
      () => testDatabase.database.prepare(`
        INSERT INTO classroom_commands (command_id, session_id, revision, kind)
        VALUES ('command-unique-2', 'session-unique', 1, 'playback_started')
      `).run(),
      /UNIQUE constraint failed/i,
    );
  } finally {
    testDatabase.cleanup();
  }
});

test('supports monotonic snapshot version increments', () => {
  const testDatabase = createTestDatabase();

  try {
    migrateDatabase(testDatabase.database);
    assert.equal(testDatabase.database.prepare(`
      SELECT version FROM snapshot_versions WHERE topic = 'global'
    `).pluck().get(), 0);
    testDatabase.database.prepare(`
      UPDATE snapshot_versions
      SET version = version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE topic = 'global'
    `).run();
    assert.equal(testDatabase.database.prepare(`
      SELECT version FROM snapshot_versions WHERE topic = 'global'
    `).pluck().get(), 1);
  } finally {
    testDatabase.cleanup();
  }
});

test('migration 004 remains replay-safe when backfilling an independent learning topic', () => {
  const testDatabase = createTestDatabase();

  try {
    migrateDatabase(testDatabase.database);
    testDatabase.database.prepare(`
      INSERT INTO users (id, username, display_name, role, password_hash)
      VALUES ('student-before-v4', 'student-before-v4', 'Student', 'student', 'disabled')
    `).run();
    const migration = readMigrations().find(({ version }) => version === 4)!;
    testDatabase.database.exec(migration.sql);
    assert.equal(testDatabase.database.prepare(`
      SELECT version FROM snapshot_versions WHERE topic = 'learning:student-before-v4'
    `).pluck().get(), 0);
  } finally {
    testDatabase.cleanup();
  }
});

test('migration 005 promotes legacy content to immutable canonical output v1', () => {
  const testDatabase = createTestDatabase();

  try {
    applyMigrationsThrough(testDatabase.database, 4);
    testDatabase.database.exec(`
      INSERT INTO users (id, username, display_name, role, password_hash)
      VALUES ('legacy-student', 'legacy-student', 'Legacy student', 'student', 'disabled');
      INSERT INTO professional_outputs (
        output_id, student_id, task_id, node_id, status, content_json
      ) VALUES (
        'legacy-output', 'legacy-student', 'P1T1', 'P1T1-N04', 'submitted',
        '{"summary":"legacy evidence"}'
      );
    `);

    const result = migrateDatabase(testDatabase.database);
    assert.deepEqual(result.appliedVersions, [5, 6, 7, 8]);
    assert.deepEqual(testDatabase.database.prepare(`
      SELECT
        task_id AS taskId,
        current_version AS currentVersion,
        state_revision AS stateRevision,
        status
      FROM professional_outputs
      WHERE output_id = 'legacy-output'
    `).get(), {
      taskId: 'P01',
      currentVersion: 1,
      stateRevision: 1,
      status: 'submitted',
    });
    assert.deepEqual(testDatabase.database.prepare(`
      SELECT
        task_id AS taskId,
        version,
        schema_version AS schemaVersion,
        fields_json AS fieldsJson,
        upstream_refs_json AS upstreamRefsJson
      FROM professional_output_versions
      WHERE output_id = 'legacy-output'
    `).get(), {
      taskId: 'P01',
      version: 1,
      schemaVersion: 1,
      fieldsJson: '{"summary":"legacy evidence"}',
      upstreamRefsJson: '[]',
    });
    assert.throws(() => testDatabase.database.prepare(`
      UPDATE professional_output_versions
      SET fields_json = '{"summary":"tampered"}'
      WHERE output_id = 'legacy-output' AND version = 1
    `).run(), /professional output versions are immutable/i);
  } finally {
    testDatabase.cleanup();
  }
});

test('migration 007 separates classroom membership from explicit participation', () => {
  const testDatabase = createTestDatabase();

  try {
    applyMigrationsThrough(testDatabase.database, 7);
    testDatabase.database.exec(`
      INSERT INTO users (id, username, display_name, role, password_hash)
      VALUES
        ('teacher-v7', 'teacher-v7', 'Teacher v7', 'teacher', 'disabled'),
        ('member-v7', 'member-v7', 'Member v7', 'student', 'disabled'),
        ('outsider-v7', 'outsider-v7', 'Outsider v7', 'student', 'disabled');
      INSERT INTO classroom_sessions (session_id, class_id, name, teacher_id)
      VALUES ('session-v7', 'class-v7', 'Class v7', 'teacher-v7');
      INSERT INTO classroom_members (session_id, student_id)
      VALUES ('session-v7', 'member-v7');
    `);

    assert.equal(testDatabase.database.prepare(`
      SELECT COUNT(*) FROM classroom_members WHERE session_id = 'session-v7'
    `).pluck().get(), 1);
    assert.equal(testDatabase.database.prepare(`
      SELECT COUNT(*) FROM classroom_participation WHERE session_id = 'session-v7'
    `).pluck().get(), 0);
    testDatabase.database.prepare(`
      INSERT INTO classroom_participation (session_id, student_id, state, mode)
      VALUES ('session-v7', 'member-v7', 'joined', 'follow')
    `).run();
    assert.throws(() => testDatabase.database.prepare(`
      INSERT INTO classroom_participation (session_id, student_id, state, mode)
      VALUES ('session-v7', 'outsider-v7', 'joined', 'follow')
    `).run(), /FOREIGN KEY constraint failed/i);
  } finally {
    testDatabase.cleanup();
  }
});

test('migration 006 backfills classroom revision topics without rolling a newer topic backward', () => {
  const testDatabase = createTestDatabase();

  try {
    applyMigrationsThrough(testDatabase.database, 5);
    testDatabase.database.exec(`
      INSERT INTO users (id, username, display_name, role, password_hash)
      VALUES ('teacher-v6', 'teacher-v6', 'Teacher v6', 'teacher', 'disabled');
      INSERT INTO classroom_sessions (
        session_id, class_id, name, teacher_id, revision, updated_at
      ) VALUES
        ('session-revision-7', 'class-v6', 'Revision seven', 'teacher-v6', 7,
          '2026-07-15T07:00:00.000Z'),
        ('session-topic-9', 'class-v6', 'Existing topic nine', 'teacher-v6', 7,
          '2026-07-15T07:30:00.000Z');
      INSERT INTO snapshot_versions (topic, version, updated_at)
      VALUES ('classroom:session-topic-9', 9, '2026-07-15T09:00:00.000Z');
    `);

    const result = migrateDatabase(testDatabase.database);
    assert.deepEqual(result.appliedVersions, [6, 7, 8]);
    assert.deepEqual(testDatabase.database.prepare(`
      SELECT version, updated_at AS updatedAt
      FROM snapshot_versions WHERE topic = 'classroom:session-revision-7'
    `).get(), {
      version: 7,
      updatedAt: '2026-07-15T07:00:00.000Z',
    });
    assert.deepEqual(testDatabase.database.prepare(`
      SELECT version, updated_at AS updatedAt
      FROM snapshot_versions WHERE topic = 'classroom:session-topic-9'
    `).get(), {
      version: 9,
      updatedAt: '2026-07-15T09:00:00.000Z',
    });
  } finally {
    testDatabase.cleanup();
  }
});

test('migration 008 upgrades a v5 cursor row to the per-student per-node key without losing fields', () => {
  const testDatabase = createTestDatabase();

  try {
    applyMigrationsThrough(testDatabase.database, 5);
    testDatabase.database.exec(`
      INSERT INTO users (id, username, display_name, role, password_hash)
      VALUES ('legacy-cursor-student', 'legacy-cursor-student', 'Legacy cursor', 'student', 'disabled');
      INSERT INTO self_study_cursors (
        student_id, context_id, node_id, unit_id, action_id,
        action_index, position_ms, updated_at
      ) VALUES (
        'legacy-cursor-student', 'self-study', 'P1T1-N02', 'P01-ku-02',
        'P1T1-N02-lesson-evidence', 2, 4200, '2026-07-15T08:00:00.000Z'
      );
    `);

    const result = migrateDatabase(testDatabase.database);
    assert.deepEqual(result.appliedVersions, [6, 7, 8]);
    assert.equal(result.currentVersion, 8);
    const columns = testDatabase.database.prepare(`
      PRAGMA table_info(self_study_cursors)
    `).all() as Array<{ name: string; pk: number }>;
    assert.deepEqual(columns.filter(({ pk }) => pk > 0).map(({ name, pk }) => ({ name, pk })), [
      { name: 'student_id', pk: 1 },
      { name: 'node_id', pk: 2 },
    ]);
    assert.equal(columns.some(({ name }) => name === 'context_id'), false);
    assert.deepEqual(testDatabase.database.prepare(`
      SELECT
        student_id AS studentId,
        node_id AS nodeId,
        unit_id AS unitId,
        action_id AS actionId,
        action_index AS actionIndex,
        position_ms AS positionMs,
        is_active AS isActive,
        updated_at AS updatedAt
      FROM self_study_cursors
      WHERE student_id = 'legacy-cursor-student'
    `).get(), {
      studentId: 'legacy-cursor-student',
      nodeId: 'P1T1-N02',
      unitId: 'P01-ku-02',
      actionId: 'P1T1-N02-lesson-evidence',
      actionIndex: 2,
      positionMs: 4200,
      isActive: 1,
      updatedAt: '2026-07-15T08:00:00.000Z',
    });
    assert.throws(() => testDatabase.database.prepare(`
      INSERT INTO self_study_cursors (
        student_id, node_id, action_index, position_ms, is_active
      ) VALUES ('legacy-cursor-student', 'P1T2-N02', 0, 0, 1)
    `).run(), /UNIQUE constraint failed/i);
  } finally {
    testDatabase.cleanup();
  }
});

test('keeps a migrated database structurally intact', () => {
  const testDatabase = createTestDatabase();

  try {
    migrateDatabase(testDatabase.database);
    assert.equal(testDatabase.database.pragma('integrity_check', { simple: true }), 'ok');
  } finally {
    testDatabase.cleanup();
  }
});

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
