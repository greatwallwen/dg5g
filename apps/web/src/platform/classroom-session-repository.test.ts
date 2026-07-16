import assert from 'node:assert/strict';
import test from 'node:test';
import { seedDemo } from './db/demo-seed.ts';
import { openDatabase } from './db/database.ts';
import { migrateDatabase } from './db/migrations.ts';
import { createTestDatabase } from './db/test-database.ts';
import {
  ClassroomRevisionConflictError,
  ClassroomSessionRepository,
  type StoredClassroomSession,
} from './classroom-session-repository.ts';

test('reads only an exact persisted classroom session and derives compatible state from empty JSON', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const repository = new ClassroomSessionRepository(fixture.database);

    const session = repository.readSession('demo-class');

    assert.equal(repository.readSession('P1T1-N02'), undefined);
    assert.equal(session?.sessionId, 'demo-class');
    assert.equal(session?.activeNodeId, 'P1T1-N02');
    assert.equal(session?.activeUnitId, 'P01-ku-02');
    assert.equal(session?.revision, 0);
    assert.equal(session?.state.schemaVersion, 1);
    assert.equal(session?.state.lesson.activeNodeId, 'P1T1-N02');
    assert.equal(session?.state.lesson.activeUnitId, 'P01-ku-02');
    assert.equal(session?.state.lesson.revision, 0);
  } finally {
    fixture.cleanup();
  }
});

test('commits one teacher CAS mutation with its command, queued ack, and snapshot topics atomically', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    fixture.database.prepare(`
      INSERT INTO device_presence (
        device_id, session_id, user_id, role, helper_state, page_state,
        last_heartbeat_at, last_applied_revision
      ) VALUES (?, ?, ?, 'student', 'online', 'ready', ?, 0)
    `).run('device-stu-01', 'demo-class', 'stu-01', '2026-07-16T01:59:59.000Z');
    const repository = new ClassroomSessionRepository(fixture.database);
    const current = repository.readSession('demo-class');
    assert.ok(current);
    const classroomVersion = topicVersion(fixture.database, 'classroom:demo-class');
    const globalVersion = topicVersion(fixture.database, 'global');
    const lesson = {
      ...current.state.lesson,
      phase: 'lecture' as const,
      revision: 1,
      playback: { ...current.state.lesson.playback, revision: 1 },
    };

    const result = repository.commitTeacherMutation({
      sessionId: 'demo-class',
      expectedRevision: 0,
      next: {
        status: 'active',
        activeNodeId: 'P1T1-N02',
        activeUnitId: 'P01-ku-02',
        state: { ...current.state, lesson, teacherSlideIndex: 2 },
      },
      command: {
        phase: 'lecture',
        route: '/classroom/demo-class',
        nodeId: 'P1T1-N02',
        unitId: 'P01-ku-02',
        ttlMs: 15_000,
      },
    }, new Date('2026-07-16T02:00:00.000Z'));

    assert.equal(result.session.revision, 1);
    assert.equal(result.session.state.lesson.revision, 1);
    assert.equal(result.session.state.teacherSlideIndex, 2);
    assert.equal(result.command.revision, 1);
    assert.equal(result.command.expiresAt, '2026-07-16T02:00:15.000Z');
    assert.deepEqual(
      fixture.database.prepare(`
        SELECT state FROM command_acks WHERE command_id = ? AND device_id = ?
      `).get(result.command.commandId, 'device-stu-01'),
      { state: 'queued' },
    );
    assert.equal(topicVersion(fixture.database, 'classroom:demo-class'), classroomVersion + 1);
    assert.equal(topicVersion(fixture.database, 'global'), globalVersion + 1);
    const persisted = JSON.parse(fixture.database.prepare(`
      SELECT state_json FROM classroom_sessions WHERE session_id = 'demo-class'
    `).pluck().get() as string) as Record<string, unknown>;
    assert.equal(JSON.stringify(persisted).includes('studentRoster'), false);
    assert.equal(JSON.stringify(persisted).includes('activeNodeId'), false);
  } finally {
    fixture.cleanup();
  }
});

test('persists a late student heartbeat and queues the live command without changing session revision', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const repository = new ClassroomSessionRepository(fixture.database);
    const current = repository.readSession('demo-class');
    assert.ok(current);
    const mutation = repository.commitTeacherMutation(
      teacherMutation(current),
      new Date('2026-07-16T02:00:00.000Z'),
    );
    const classroomVersion = topicVersion(fixture.database, 'classroom:demo-class');
    const globalVersion = topicVersion(fixture.database, 'global');

    const presence = repository.recordHeartbeat('demo-class', {
      deviceId: 'late-device-stu-01',
      actorRole: 'student',
      studentId: 'stu-01',
      pageState: 'ready',
      lastAppliedRevision: 0,
    }, new Date('2026-07-16T02:00:01.000Z'));
    const snapshot = repository.readDeviceSnapshot(
      'demo-class',
      new Date('2026-07-16T02:00:01.000Z'),
    );

    assert.equal(presence.helperState, 'online');
    assert.equal(snapshot.command?.commandId, mutation.command.commandId);
    assert.equal(snapshot.devices[0]?.deviceId, 'late-device-stu-01');
    assert.equal(snapshot.acks[0]?.state, 'queued');
    assert.equal(repository.readSession('demo-class')?.revision, 1);
    assert.equal(topicVersion(fixture.database, 'classroom:demo-class'), classroomVersion + 1);
    assert.equal(topicVersion(fixture.database, 'global'), globalVersion + 1);
  } finally {
    fixture.cleanup();
  }
});

test('persists monotonic acknowledgements without consuming teacher revision or topics on a regression', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const repository = new ClassroomSessionRepository(fixture.database);
    const current = repository.readSession('demo-class');
    assert.ok(current);
    const mutation = repository.commitTeacherMutation(
      teacherMutation(current),
      new Date('2026-07-16T02:00:00.000Z'),
    );
    repository.recordHeartbeat('demo-class', {
      deviceId: 'ack-device-stu-01',
      actorRole: 'student',
      studentId: 'stu-01',
      pageState: 'ready',
      lastAppliedRevision: 0,
    }, new Date('2026-07-16T02:00:01.000Z'));
    const classroomVersion = topicVersion(fixture.database, 'classroom:demo-class');
    const globalVersion = topicVersion(fixture.database, 'global');

    const applied = repository.recordAck('demo-class', {
      commandId: mutation.command.commandId,
      deviceId: 'ack-device-stu-01',
      studentId: 'stu-01',
      state: 'applied',
    }, new Date('2026-07-16T02:00:02.000Z'));

    assert.equal(applied.state, 'applied');
    assert.equal(repository.readSession('demo-class')?.revision, 1);
    assert.equal(
      repository.readDeviceSnapshot('demo-class', new Date('2026-07-16T02:00:02.000Z'))
        .devices[0]?.lastAppliedRevision,
      1,
    );
    assert.equal(topicVersion(fixture.database, 'classroom:demo-class'), classroomVersion + 1);
    assert.equal(topicVersion(fixture.database, 'global'), globalVersion + 1);

    const duplicate = repository.recordAck('demo-class', {
      commandId: mutation.command.commandId,
      deviceId: 'ack-device-stu-01',
      studentId: 'stu-01',
      state: 'delivered',
    }, new Date('2026-07-16T02:00:03.000Z'));

    assert.equal(duplicate.state, 'applied');
    assert.equal(topicVersion(fixture.database, 'classroom:demo-class'), classroomVersion + 1);
    assert.equal(topicVersion(fixture.database, 'global'), globalVersion + 1);
  } finally {
    fixture.cleanup();
  }
});

test('rejects stale teacher CAS with zero command, state, or topic side effects', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const repository = new ClassroomSessionRepository(fixture.database);
    const current = repository.readSession('demo-class');
    assert.ok(current);
    repository.commitTeacherMutation(
      teacherMutation(current),
      new Date('2026-07-16T02:00:00.000Z'),
    );
    const classroomVersion = topicVersion(fixture.database, 'classroom:demo-class');
    const globalVersion = topicVersion(fixture.database, 'global');
    const stateJson = fixture.database.prepare(`
      SELECT state_json FROM classroom_sessions WHERE session_id = 'demo-class'
    `).pluck().get();

    assert.throws(
      () => repository.commitTeacherMutation(
        teacherMutation(current),
        new Date('2026-07-16T02:00:01.000Z'),
      ),
      (error) => error instanceof ClassroomRevisionConflictError
        && error.expectedRevision === 0
        && error.currentRevision === 1,
    );

    assert.equal(repository.readSession('demo-class')?.revision, 1);
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM classroom_commands WHERE session_id = 'demo-class'
    `).pluck().get(), 1);
    assert.equal(fixture.database.prepare(`
      SELECT state_json FROM classroom_sessions WHERE session_id = 'demo-class'
    `).pluck().get(), stateJson);
    assert.equal(topicVersion(fixture.database, 'classroom:demo-class'), classroomVersion);
    assert.equal(topicVersion(fixture.database, 'global'), globalVersion);
  } finally {
    fixture.cleanup();
  }
});

test('retains session, command, presence, and acknowledgement after a real database reopen', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const repository = new ClassroomSessionRepository(fixture.database);
    const current = repository.readSession('demo-class');
    assert.ok(current);
    const mutation = repository.commitTeacherMutation(
      teacherMutation(current),
      new Date('2026-07-16T02:00:00.000Z'),
    );
    repository.recordHeartbeat('demo-class', {
      deviceId: 'reopen-device-stu-01',
      actorRole: 'student',
      studentId: 'stu-01',
      pageState: 'ready',
      lastAppliedRevision: 0,
    }, new Date('2026-07-16T02:00:01.000Z'));
    repository.recordAck('demo-class', {
      commandId: mutation.command.commandId,
      deviceId: 'reopen-device-stu-01',
      studentId: 'stu-01',
      state: 'applied',
    }, new Date('2026-07-16T02:00:02.000Z'));
    fixture.database.close();

    const reopened = openDatabase({ path: fixture.databasePath, fileMustExist: true });
    try {
      const persisted = new ClassroomSessionRepository(reopened);
      const snapshot = persisted.readDeviceSnapshot(
        'demo-class',
        new Date('2026-07-16T02:00:03.000Z'),
      );
      assert.equal(persisted.readSession('demo-class')?.revision, 1);
      assert.equal(snapshot.command?.commandId, mutation.command.commandId);
      assert.equal(snapshot.devices[0]?.deviceId, 'reopen-device-stu-01');
      assert.equal(snapshot.devices[0]?.lastAppliedRevision, 1);
      assert.equal(snapshot.acks[0]?.state, 'applied');
    } finally {
      reopened.close();
    }
  } finally {
    fixture.cleanup();
  }
});

test('rejects a targeted command for a non-member with zero CAS side effects', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    fixture.database.prepare(`
      INSERT INTO users (id, username, display_name, role, password_hash)
      VALUES ('stu-outsider', 'outsider', 'Outsider', 'student', 'test-only')
    `).run();
    const repository = new ClassroomSessionRepository(fixture.database);
    const current = repository.readSession('demo-class');
    assert.ok(current);
    const mutation = teacherMutation(current);
    const classroomVersion = topicVersion(fixture.database, 'classroom:demo-class');
    const globalVersion = topicVersion(fixture.database, 'global');

    assert.throws(
      () => repository.commitTeacherMutation({
        ...mutation,
        command: { ...mutation.command, studentId: 'stu-outsider' },
      }),
      /active member/i,
    );

    assert.equal(repository.readSession('demo-class')?.revision, 0);
    assert.equal(fixture.database.prepare(`SELECT COUNT(*) FROM classroom_commands`).pluck().get(), 0);
    assert.equal(topicVersion(fixture.database, 'classroom:demo-class'), classroomVersion);
    assert.equal(topicVersion(fixture.database, 'global'), globalVersion);
  } finally {
    fixture.cleanup();
  }
});

test('rejects inactive members and invalid or future heartbeat revisions with zero side effects', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    fixture.database.exec(`
      INSERT INTO users (id, username, display_name, role, password_hash, is_active)
      VALUES ('stu-inactive-runtime', 'inactive-runtime', 'Inactive', 'student', 'test-only', 0);
      INSERT INTO classroom_members (session_id, student_id)
      VALUES ('demo-class', 'stu-inactive-runtime');
    `);
    const repository = new ClassroomSessionRepository(fixture.database);
    const classroomVersion = topicVersion(fixture.database, 'classroom:demo-class');
    const globalVersion = topicVersion(fixture.database, 'global');
    const invalid = [
      { studentId: 'stu-01', lastAppliedRevision: 1 },
      { studentId: 'stu-01', lastAppliedRevision: -1 },
      { studentId: 'stu-01', lastAppliedRevision: Number.MAX_SAFE_INTEGER + 1 },
      { studentId: 'stu-inactive-runtime', lastAppliedRevision: 0 },
    ];

    invalid.forEach((item, index) => {
      assert.throws(() => repository.recordHeartbeat('demo-class', {
        deviceId: `invalid-heartbeat-${index}`,
        actorRole: 'student',
        studentId: item.studentId,
        pageState: 'ready',
        lastAppliedRevision: item.lastAppliedRevision,
      }), /revision|active member/i);
    });

    assert.equal(fixture.database.prepare(`SELECT COUNT(*) FROM device_presence`).pluck().get(), 0);
    assert.equal(repository.readSession('demo-class')?.revision, 0);
    assert.equal(topicVersion(fixture.database, 'classroom:demo-class'), classroomVersion);
    assert.equal(topicVersion(fixture.database, 'global'), globalVersion);
  } finally {
    fixture.cleanup();
  }
});

test('keeps failed to delivered as a topic-free no-op while allowing failed to applied', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const repository = new ClassroomSessionRepository(fixture.database);
    const current = repository.readSession('demo-class');
    assert.ok(current);
    const mutation = repository.commitTeacherMutation(
      teacherMutation(current),
      new Date('2026-07-16T02:00:00.000Z'),
    );
    repository.recordHeartbeat('demo-class', {
      deviceId: 'failed-ack-device',
      actorRole: 'student',
      studentId: 'stu-01',
      pageState: 'ready',
      lastAppliedRevision: 0,
    }, new Date('2026-07-16T02:00:01.000Z'));
    const draft = {
      commandId: mutation.command.commandId,
      deviceId: 'failed-ack-device',
      studentId: 'stu-01',
    };
    repository.recordAck('demo-class', { ...draft, state: 'failed' }, new Date('2026-07-16T02:00:02.000Z'));
    const classroomVersion = topicVersion(fixture.database, 'classroom:demo-class');
    const globalVersion = topicVersion(fixture.database, 'global');

    const noOp = repository.recordAck(
      'demo-class',
      { ...draft, state: 'delivered' },
      new Date('2026-07-16T02:00:03.000Z'),
    );
    assert.equal(noOp.state, 'failed');
    assert.equal(topicVersion(fixture.database, 'classroom:demo-class'), classroomVersion);
    assert.equal(topicVersion(fixture.database, 'global'), globalVersion);

    const applied = repository.recordAck(
      'demo-class',
      { ...draft, state: 'applied' },
      new Date('2026-07-16T02:00:04.000Z'),
    );
    assert.equal(applied.state, 'applied');
    assert.equal(topicVersion(fixture.database, 'classroom:demo-class'), classroomVersion + 1);
    assert.equal(topicVersion(fixture.database, 'global'), globalVersion + 1);
  } finally {
    fixture.cleanup();
  }
});

for (const membershipChange of [
  {
    name: 'deactivated',
    apply(database: ReturnType<typeof createTestDatabase>['database']) {
      database.prepare(`UPDATE users SET is_active = 0 WHERE id = 'stu-01'`).run();
    },
  },
  {
    name: 'removed from the class',
    apply(database: ReturnType<typeof createTestDatabase>['database']) {
      database.prepare(`
        DELETE FROM classroom_members
        WHERE session_id = 'demo-class' AND student_id = 'stu-01'
      `).run();
    },
  },
] as const) {
  test(`rejects an acknowledgement after its student is ${membershipChange.name} with zero side effects`, () => {
    const fixture = createTestDatabase();
    try {
      migrateDatabase(fixture.database);
      seedDemo(fixture.database);
      const repository = new ClassroomSessionRepository(fixture.database);
      const current = repository.readSession('demo-class');
      assert.ok(current);
      const mutation = repository.commitTeacherMutation(
        teacherMutation(current),
        new Date('2026-07-16T02:00:00.000Z'),
      );
      repository.recordHeartbeat('demo-class', {
        deviceId: 'revoked-member-device',
        actorRole: 'student',
        studentId: 'stu-01',
        pageState: 'ready',
        lastAppliedRevision: 0,
      }, new Date('2026-07-16T02:00:01.000Z'));
      membershipChange.apply(fixture.database);
      const classroomVersion = topicVersion(fixture.database, 'classroom:demo-class');
      const globalVersion = topicVersion(fixture.database, 'global');

      assert.throws(() => repository.recordAck('demo-class', {
        commandId: mutation.command.commandId,
        deviceId: 'revoked-member-device',
        studentId: 'stu-01',
        state: 'applied',
      }, new Date('2026-07-16T02:00:02.000Z')), /active member/i);

      assert.deepEqual(fixture.database.prepare(`
        SELECT state, reason, acknowledged_at
        FROM command_acks
        WHERE command_id = ? AND device_id = 'revoked-member-device'
      `).get(mutation.command.commandId), {
        state: 'queued',
        reason: null,
        acknowledged_at: '2026-07-16T02:00:01.000Z',
      });
      assert.equal(fixture.database.prepare(`
        SELECT last_applied_revision
        FROM device_presence
        WHERE device_id = 'revoked-member-device'
      `).pluck().get(), 0);
      assert.equal(repository.readSession('demo-class')?.revision, 1);
      assert.equal(topicVersion(fixture.database, 'classroom:demo-class'), classroomVersion);
      assert.equal(topicVersion(fixture.database, 'global'), globalVersion);
    } finally {
      fixture.cleanup();
    }
  });
}

test('rejects command fields that disagree with the authoritative next state', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const repository = new ClassroomSessionRepository(fixture.database);
    const current = repository.readSession('demo-class');
    assert.ok(current);
    const mutation = teacherMutation(current);
    const invalidCommands = [
      { ...mutation.command, phase: 'question' as const },
      { ...mutation.command, route: '/classroom/another-session' },
      { ...mutation.command, nodeId: 'P1T1-N03' },
      { ...mutation.command, unitId: 'P01-ku-03' },
    ];

    for (const command of invalidCommands) {
      assert.throws(
        () => repository.commitTeacherMutation({ ...mutation, command }),
        /authoritative classroom state/i,
      );
    }
    assert.equal(repository.readSession('demo-class')?.revision, 0);
    assert.equal(fixture.database.prepare(`SELECT COUNT(*) FROM classroom_commands`).pluck().get(), 0);
  } finally {
    fixture.cleanup();
  }
});

test('fans one broadcast command out to all 24 registered member devices', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const insertUser = fixture.database.prepare(`
      INSERT INTO users (id, username, display_name, role, password_hash)
      VALUES (?, ?, ?, 'student', 'test-only')
    `);
    const insertMember = fixture.database.prepare(`
      INSERT INTO classroom_members (session_id, student_id) VALUES ('demo-class', ?)
    `);
    const insertDevice = fixture.database.prepare(`
      INSERT INTO device_presence (
        device_id, session_id, user_id, role, helper_state, page_state,
        last_heartbeat_at, last_applied_revision
      ) VALUES (?, 'demo-class', ?, 'student', 'online', 'ready', ?, 0)
    `);
    fixture.database.transaction(() => {
      for (let index = 1; index <= 24; index += 1) {
        const suffix = String(index).padStart(2, '0');
        const studentId = `stu-${suffix}`;
        if (index > 3) {
          insertUser.run(studentId, `student${suffix}`, `Student ${suffix}`);
          insertMember.run(studentId);
        }
        insertDevice.run(`fanout-device-${suffix}`, studentId, '2026-07-16T01:59:59.000Z');
      }
    })();
    const repository = new ClassroomSessionRepository(fixture.database);
    const current = repository.readSession('demo-class');
    assert.ok(current);

    const mutation = repository.commitTeacherMutation(
      teacherMutation(current),
      new Date('2026-07-16T02:00:00.000Z'),
    );

    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM command_acks WHERE command_id = ? AND state = 'queued'
    `).pluck().get(mutation.command.commandId), 24);
  } finally {
    fixture.cleanup();
  }
});

function topicVersion(
  database: ReturnType<typeof createTestDatabase>['database'],
  topic: string,
): number {
  return database.prepare('SELECT version FROM snapshot_versions WHERE topic = ?')
    .pluck().get(topic) as number | undefined ?? 0;
}

function teacherMutation(current: StoredClassroomSession) {
  const nextRevision = current.revision + 1;
  return {
    sessionId: current.sessionId,
    expectedRevision: current.revision,
    next: {
      status: 'active' as const,
      activeNodeId: current.activeNodeId ?? 'P1T1-N02',
      activeUnitId: current.activeUnitId ?? 'P01-ku-02',
      state: {
        ...current.state,
        lesson: {
          ...current.state.lesson,
          phase: 'lecture' as const,
          revision: nextRevision,
          playback: { ...current.state.lesson.playback, revision: nextRevision },
        },
      },
    },
    command: {
      phase: 'lecture' as const,
      route: `/classroom/${current.sessionId}`,
      nodeId: current.activeNodeId ?? 'P1T1-N02',
      unitId: current.activeUnitId ?? 'P01-ku-02',
      ttlMs: 15_000,
    },
  };
}
