import assert from 'node:assert/strict';
import test from 'node:test';
import { seedDemo } from './db/demo-seed.ts';
import { migrateDatabase } from './db/migrations.ts';
import { openDatabase } from './db/database.ts';
import { createTestDatabase } from './db/test-database.ts';
import {
  ClassroomParticipationNotJoinedError,
  ClassroomParticipationRepository,
  ClassroomParticipationSessionInactiveError,
  ClassroomParticipationSessionNotFoundError,
  ClassroomParticipationStudentNotMemberError,
} from './classroom-participation-repository.ts';

test('classroom membership never implies joined or following participation', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const repository = new ClassroomParticipationRepository(fixture.database);

    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM classroom_members WHERE session_id = 'demo-class'
    `).pluck().get(), 3);
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM classroom_participation WHERE session_id = 'demo-class'
    `).pluck().get(), 0);
    assert.deepEqual(repository.readJoinedStudentIds('demo-class'), []);
    assert.deepEqual(repository.readFollowingStudentIds('demo-class'), []);
  } finally {
    fixture.cleanup();
  }
});

test('join, independent mode, and explicit leave mutate only real participation changes', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    fixture.database.prepare(`
      UPDATE classroom_sessions SET status = 'active' WHERE session_id = 'demo-class'
    `).run();
    const repository = new ClassroomParticipationRepository(fixture.database);
    const classroomBefore = topicVersion('classroom:demo-class');
    const globalBefore = topicVersion('global');
    const learningBefore = topicVersion('learning:stu-01');

    assert.deepEqual(repository.join('demo-class', 'stu-01', at('01:00:00')), {
      sessionId: 'demo-class', studentId: 'stu-01', state: 'joined', mode: 'follow',
      joinedAt: '2026-07-16T01:00:00.000Z', updatedAt: '2026-07-16T01:00:00.000Z',
    });
    assert.deepEqual(repository.setMode('demo-class', 'stu-01', 'self', at('01:01:00')), {
      sessionId: 'demo-class', studentId: 'stu-01', state: 'joined', mode: 'self',
      joinedAt: '2026-07-16T01:00:00.000Z', updatedAt: '2026-07-16T01:01:00.000Z',
    });
    const versionAfterSelf = topicVersion('classroom:demo-class');
    assert.equal(repository.join('demo-class', 'stu-01', at('01:02:00')).mode, 'self');
    assert.equal(topicVersion('classroom:demo-class'), versionAfterSelf);

    repository.join('demo-class', 'stu-02', at('01:03:00'));
    assert.deepEqual(repository.readJoinedStudentIds('demo-class'), ['stu-01', 'stu-02']);
    assert.deepEqual(repository.readFollowingStudentIds('demo-class'), ['stu-02']);
    const left = repository.leave('demo-class', 'stu-02', at('01:04:00'));
    assert.equal(left.state, 'left');
    assert.equal(left.mode, 'follow');
    assert.equal(left.leftAt, '2026-07-16T01:04:00.000Z');
    const versionAfterLeave = topicVersion('classroom:demo-class');
    assert.deepEqual(repository.leave('demo-class', 'stu-02', at('01:05:00')), left);
    assert.equal(topicVersion('classroom:demo-class'), versionAfterLeave);
    assert.deepEqual(repository.readJoinedStudentIds('demo-class'), ['stu-01']);
    assert.deepEqual(repository.readFollowingStudentIds('demo-class'), []);

    assert.equal(topicVersion('classroom:demo-class'), classroomBefore + 4);
    assert.equal(topicVersion('global'), globalBefore + 4);
    assert.equal(topicVersion('learning:stu-01'), learningBefore);
    assert.equal(fixture.database.prepare(`
      SELECT revision FROM classroom_sessions WHERE session_id = 'demo-class'
    `).pluck().get(), 0);
  } finally {
    fixture.cleanup();
  }

  function topicVersion(topic: string): number {
    return fixture.database.prepare(`SELECT version FROM snapshot_versions WHERE topic = ?`)
      .pluck().get(topic) as number;
  }
});

test('participation rejects unknown, inactive, non-member, and not-joined mutations without side effects', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const repository = new ClassroomParticipationRepository(fixture.database);
    const before = fixture.database.prepare(`SELECT COUNT(*) FROM classroom_participation`).pluck().get();

    assert.throws(() => repository.read('missing-session', 'stu-01'), ClassroomParticipationSessionNotFoundError);
    assert.throws(() => repository.readJoinedStudentIds('missing-session'), ClassroomParticipationSessionNotFoundError);
    assert.throws(() => repository.readFollowingStudentIds('missing-session'), ClassroomParticipationSessionNotFoundError);
    assert.throws(() => repository.join('missing-session', 'stu-01'), ClassroomParticipationSessionNotFoundError);
    assert.throws(() => repository.join('demo-class', 'stu-01'), ClassroomParticipationSessionInactiveError);
    fixture.database.prepare(`UPDATE classroom_sessions SET status = 'active' WHERE session_id = 'demo-class'`).run();
    fixture.database.prepare(`
      INSERT INTO users (id, username, display_name, role, password_hash)
      VALUES ('outsider', 'outsider', 'Outsider', 'student', 'disabled')
    `).run();
    assert.throws(() => repository.join('demo-class', 'outsider'), ClassroomParticipationStudentNotMemberError);
    assert.throws(() => repository.setMode('demo-class', 'stu-01', 'self'), ClassroomParticipationNotJoinedError);
    assert.throws(() => repository.leave('demo-class', 'stu-01'), ClassroomParticipationNotJoinedError);
    assert.equal(fixture.database.prepare(`SELECT COUNT(*) FROM classroom_participation`).pluck().get(), before);
  } finally {
    fixture.cleanup();
  }
});

test('joined and following aggregates remain exact for 24 members and reject a 25th non-member', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    fixture.database.prepare(`UPDATE classroom_sessions SET status = 'active' WHERE session_id = 'demo-class'`).run();
    const insertUser = fixture.database.prepare(`
      INSERT INTO users (id, username, display_name, role, password_hash)
      VALUES (?, ?, ?, 'student', 'disabled')
    `);
    const insertMember = fixture.database.prepare(`
      INSERT INTO classroom_members (session_id, student_id) VALUES ('demo-class', ?)
    `);
    for (let index = 4; index <= 25; index += 1) {
      const studentId = `stu-${String(index).padStart(2, '0')}`;
      insertUser.run(studentId, `student${String(index).padStart(2, '0')}`, `Student ${index}`);
      if (index <= 24) insertMember.run(studentId);
    }
    const repository = new ClassroomParticipationRepository(fixture.database);
    const memberIds = fixture.database.prepare(`
      SELECT student_id FROM classroom_members WHERE session_id = 'demo-class' ORDER BY student_id
    `).pluck().all() as string[];
    assert.equal(memberIds.length, 24);
    for (const [index, studentId] of memberIds.entries()) {
      repository.join('demo-class', studentId);
      if (index >= 12) repository.setMode('demo-class', studentId, 'self');
    }

    assert.equal(repository.readJoinedStudentIds('demo-class').length, 24);
    assert.deepEqual(repository.readFollowingStudentIds('demo-class'), memberIds.slice(0, 12));
    assert.throws(
      () => repository.join('demo-class', 'stu-25'),
      ClassroomParticipationStudentNotMemberError,
    );
    assert.equal(repository.readJoinedStudentIds('demo-class').length, 24);
  } finally {
    fixture.cleanup();
  }
});

test('participation survives a database process rebuild', () => {
  const fixture = createTestDatabase();
  let reopened: ReturnType<typeof openDatabase> | undefined;
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    fixture.database.prepare(`UPDATE classroom_sessions SET status = 'active' WHERE session_id = 'demo-class'`).run();
    const repository = new ClassroomParticipationRepository(fixture.database);
    repository.join('demo-class', 'stu-01', at('02:00:00'));
    repository.setMode('demo-class', 'stu-01', 'self', at('02:01:00'));
    fixture.database.close();

    reopened = openDatabase({ path: fixture.databasePath, fileMustExist: true });
    const rebuilt = new ClassroomParticipationRepository(reopened);
    assert.equal(rebuilt.read('demo-class', 'stu-01')?.mode, 'self');
    assert.deepEqual(rebuilt.readJoinedStudentIds('demo-class'), ['stu-01']);
    assert.deepEqual(rebuilt.readFollowingStudentIds('demo-class'), []);
  } finally {
    if (reopened?.open) reopened.close();
    fixture.cleanup();
  }
});

function at(time: string): Date {
  return new Date(`2026-07-16T${time}.000Z`);
}
