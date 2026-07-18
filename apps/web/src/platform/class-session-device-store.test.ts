import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { closeDatabase } from './db/database.ts';
import { seedDemo } from './db/demo-seed.ts';
import { migrateDatabase } from './db/migrations.ts';
import { createTestDatabase } from './db/test-database.ts';
import { ClassroomParticipationRepository } from './classroom-participation-repository.ts';
import {
  classroomDeviceSnapshot,
  publishClassroomCommand,
  recordCommandAck,
  recordDeviceHeartbeat,
} from './class-session-device-store.ts';

const fixture = createTestDatabase();
migrateDatabase(fixture.database);
seedDemo(fixture.database);
const deviceSessionIds = [
  'P1T1-N02-device-expiry',
  'P1T1-N02-three-devices',
  'P1T1-N02-ack-order',
  'P1T1-N02-ack-recovery',
  'P1T1-N02-command-expiry',
  'P1T1-N02-late-helper',
  'P1T1-N02-ack-identity',
  'P1T1-N02-command-revision',
  'P1T1-N02-browser-presence',
  'P1T1-N02-browser-recipients',
];
seedClassroomSessions(fixture.database, deviceSessionIds);
process.env.DGBOOK_SQLITE_PATH = fixture.databasePath;

after(() => {
  closeDatabase();
  delete process.env.DGBOOK_SQLITE_PATH;
  fixture.cleanup();
});

const at = (milliseconds: number) => new Date(Date.UTC(2026, 6, 13, 1, 0, 0, milliseconds));

function heartbeat(sessionId: string, studentId: string, deviceId = deviceIdFor(sessionId, studentId)) {
  fixture.database.prepare(`
    UPDATE classroom_sessions SET status = 'active' WHERE session_id = ?
  `).run(sessionId);
  new ClassroomParticipationRepository(fixture.database).join(sessionId, studentId, at(-1));
  return recordDeviceHeartbeat(sessionId, {
    actorRole: 'student',
    deviceId,
    studentId,
    clientKind: 'browser',
    visibilityState: 'visible',
    pageState: 'ready',
    lastAppliedRevision: 0,
  }, at(0));
}

function command(sessionId: string, revision = 1, ttlMs = 15_000) {
  return publishClassroomCommand(sessionId, {
    phase: 'lecture',
    route: `/classroom/${sessionId}`,
    nodeId: 'P1T1-N02',
    unitId: 'P01-ku-02',
    revision,
    ttlMs,
  }, at(0));
}

test('degrades after six seconds and expires after sixteen without inventing an acknowledgement', () => {
  const sessionId = 'P1T1-N02-device-expiry';
  heartbeat(sessionId, 'stu-01');

  assert.equal(classroomDeviceSnapshot(sessionId, at(5_999)).devices[0]?.helperState, 'online');
  assert.equal(classroomDeviceSnapshot(sessionId, at(6_001)).devices[0]?.helperState, 'degraded');
  assert.equal(classroomDeviceSnapshot(sessionId, at(16_001)).devices[0]?.helperState, 'offline');
  assert.equal(classroomDeviceSnapshot(sessionId, at(16_001)).acks.length, 0);
});

test('round-trips browser presence and derives online degraded offline health without changing classroom revision', () => {
  const sessionId = 'P1T1-N02-browser-presence';
  const revisionBefore = fixture.database.prepare(`
    SELECT revision FROM classroom_sessions WHERE session_id = ?
  `).pluck().get(sessionId);
  const topicBefore = fixture.database.prepare(`
    SELECT version FROM snapshot_versions WHERE topic = ?
  `).pluck().get(`classroom:${sessionId}`) as number | undefined;

  const presence = recordDeviceHeartbeat(sessionId, {
    actorRole: 'student',
    clientKind: 'browser',
    visibilityState: 'visible',
    deviceId: `browser-${sessionId}-stu-01`,
    studentId: 'stu-01',
    pageState: 'ready',
    lastAppliedRevision: 0,
  }, at(0));

  assert.equal(presence.actorRole, 'student');
  assert.equal(presence.clientKind, 'browser');
  assert.equal(presence.visibilityState, 'visible');
  assert.equal(presence.syncHealth, 'online');
  assert.equal(classroomDeviceSnapshot(sessionId, at(6_000)).devices[0]?.syncHealth, 'online');
  assert.equal(classroomDeviceSnapshot(sessionId, at(6_001)).devices[0]?.syncHealth, 'degraded');
  assert.equal(classroomDeviceSnapshot(sessionId, at(16_000)).devices[0]?.syncHealth, 'degraded');
  assert.equal(classroomDeviceSnapshot(sessionId, at(16_001)).devices[0]?.syncHealth, 'offline');
  assert.equal(fixture.database.prepare(`
    SELECT revision FROM classroom_sessions WHERE session_id = ?
  `).pluck().get(sessionId), revisionBefore);
  assert.equal(fixture.database.prepare(`
    SELECT version FROM snapshot_versions WHERE topic = ?
  `).pluck().get(`classroom:${sessionId}`), (topicBefore ?? 0) + 1);
});

test('tracks three independent devices and applies one command to one student only', () => {
  const sessionId = 'P1T1-N02-three-devices';
  heartbeat(sessionId, 'stu-01');
  heartbeat(sessionId, 'stu-02');
  heartbeat(sessionId, 'stu-03');
  const published = command(sessionId);

  recordCommandAck(sessionId, {
    commandId: published.commandId,
    deviceId: deviceIdFor(sessionId, 'stu-01'),
    studentId: 'stu-01',
    state: 'delivered',
  }, at(1));
  recordCommandAck(sessionId, {
    commandId: published.commandId,
    deviceId: deviceIdFor(sessionId, 'stu-01'),
    studentId: 'stu-01',
    state: 'applied',
  }, at(2));

  const snapshot = classroomDeviceSnapshot(sessionId, at(2));
  assert.equal(snapshot.devices.length, 3);
  assert.deepEqual(snapshot.acks.map((ack) => [ack.studentId, ack.state]), [
    ['stu-01', 'applied'],
    ['stu-02', 'queued'],
    ['stu-03', 'queued'],
  ]);
});

test('queues commands only for joined following non-offline student browsers', () => {
  const sessionId = 'P1T1-N02-browser-recipients';
  fixture.database.prepare(`
    UPDATE classroom_sessions SET status = 'active' WHERE session_id = ?
  `).run(sessionId);
  const participation = new ClassroomParticipationRepository(fixture.database);
  participation.join(sessionId, 'stu-01', at(-20_000));
  participation.join(sessionId, 'stu-02', at(-20_000));
  participation.setMode(sessionId, 'stu-02', 'self', at(-19_000));
  participation.join(sessionId, 'stu-03', at(-20_000));
  participation.leave(sessionId, 'stu-03', at(-19_000));
  const browserHeartbeat = (
    deviceId: string,
    actorRole: 'teacher' | 'student' | 'projector',
    studentId?: string,
    now = at(0),
  ) => recordDeviceHeartbeat(sessionId, {
    deviceId,
    actorRole,
    ...(studentId ? { studentId } : {}),
    clientKind: 'browser',
    visibilityState: 'visible',
    pageState: 'ready',
    lastAppliedRevision: 0,
  }, now);
  browserHeartbeat('browser-follow-online', 'student', 'stu-01');
  browserHeartbeat('browser-follow-offline', 'student', 'stu-01', at(-16_001));
  recordDeviceHeartbeat(sessionId, {
    deviceId: 'simulator-follow-online',
    actorRole: 'student',
    studentId: 'stu-01',
    clientKind: 'helper-simulator',
    visibilityState: 'visible',
    pageState: 'ready',
    lastAppliedRevision: 0,
  }, at(0));
  browserHeartbeat('browser-self-online', 'student', 'stu-02');
  browserHeartbeat('browser-left-online', 'student', 'stu-03');
  browserHeartbeat('browser-teacher-online', 'teacher');
  browserHeartbeat('browser-projector-online', 'projector');

  command(sessionId);

  assert.deepEqual(
    classroomDeviceSnapshot(sessionId, at(1)).acks.map(({ deviceId }) => deviceId),
    ['browser-follow-online'],
  );
  const published = classroomDeviceSnapshot(sessionId, at(1)).command;
  assert.ok(published);
  assert.throws(() => recordCommandAck(sessionId, {
    commandId: published.commandId,
    deviceId: 'simulator-follow-online',
    studentId: 'stu-01',
    state: 'applied',
  }, at(2)), /recipient/i);
});

test('never rolls an applied acknowledgement back to delivered', () => {
  const sessionId = 'P1T1-N02-ack-order';
  heartbeat(sessionId, 'stu-01');
  const published = command(sessionId);
  const base = { commandId: published.commandId, deviceId: deviceIdFor(sessionId, 'stu-01'), studentId: 'stu-01' };

  recordCommandAck(sessionId, { ...base, state: 'applied' }, at(1));
  recordCommandAck(sessionId, { ...base, state: 'delivered' }, at(2));

  assert.equal(classroomDeviceSnapshot(sessionId, at(2)).acks[0]?.state, 'applied');
});

test('recovers a transient failed acknowledgement when the live command later applies', () => {
  const sessionId = 'P1T1-N02-ack-recovery';
  heartbeat(sessionId, 'stu-01');
  const published = command(sessionId);
  const base = { commandId: published.commandId, deviceId: deviceIdFor(sessionId, 'stu-01'), studentId: 'stu-01' };

  recordCommandAck(sessionId, { ...base, state: 'failed', reason: 'page timeout' }, at(1));
  recordCommandAck(sessionId, { ...base, state: 'applied' }, at(2));

  assert.equal(classroomDeviceSnapshot(sessionId, at(2)).acks[0]?.state, 'applied');
});

test('expires queued acknowledgements when a command passes its ttl', () => {
  const sessionId = 'P1T1-N02-command-expiry';
  heartbeat(sessionId, 'stu-01');
  command(sessionId, 1, 500);

  assert.equal(classroomDeviceSnapshot(sessionId, at(499)).acks[0]?.state, 'queued');
  assert.equal(classroomDeviceSnapshot(sessionId, at(501)).acks[0]?.state, 'expired');
  assert.equal(classroomDeviceSnapshot(sessionId, at(501)).command, undefined);
});

test('adds a queued acknowledgement when a student helper arrives after publication', () => {
  const sessionId = 'P1T1-N02-late-helper';
  const published = command(sessionId, 1, 5_000);

  heartbeat(sessionId, 'stu-01');

  assert.deepEqual(classroomDeviceSnapshot(sessionId, at(1)).acks.map((ack) => ({
    commandId: ack.commandId,
    studentId: ack.studentId,
    state: ack.state,
  })), [{ commandId: published.commandId, studentId: 'stu-01', state: 'queued' }]);
});

test('rejects an acknowledgement whose student does not own the helper device', () => {
  const sessionId = 'P1T1-N02-ack-identity';
  heartbeat(sessionId, 'stu-01');
  const published = command(sessionId);

  assert.throws(() => recordCommandAck(sessionId, {
    commandId: published.commandId,
    deviceId: deviceIdFor(sessionId, 'stu-01'),
    studentId: 'stu-02',
    state: 'applied',
  }, at(1)), /device identity/i);
});

test('rejects a command revision that is not newer than the session command', () => {
  const sessionId = 'P1T1-N02-command-revision';
  heartbeat(sessionId, 'stu-01');
  command(sessionId, 1);

  assert.throws(() => command(sessionId, 1), /revision must/i);
  assert.throws(() => command(sessionId, 0), /revision must/i);
});

function deviceIdFor(sessionId: string, studentId: string): string {
  return `device-${sessionId}-${studentId}`;
}

function seedClassroomSessions(
  database: typeof fixture.database,
  sessionIds: string[],
): void {
  const insertSession = database.prepare(`
    INSERT INTO classroom_sessions (
      session_id, class_id, name, teacher_id, status, active_node_id,
      active_unit_id, revision, state_json
    )
    SELECT ?, class_id, ?, teacher_id, status, active_node_id,
      active_unit_id, 0, '{}'
    FROM classroom_sessions
    WHERE session_id = 'demo-class'
  `);
  const insertMembers = database.prepare(`
    INSERT INTO classroom_members (session_id, student_id)
    SELECT ?, student_id FROM classroom_members WHERE session_id = 'demo-class'
  `);
  database.transaction(() => {
    for (const sessionId of sessionIds) {
      insertSession.run(sessionId, `Test ${sessionId}`);
      insertMembers.run(sessionId);
    }
  })();
}
