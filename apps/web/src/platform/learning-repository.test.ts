import assert from 'node:assert/strict';
import test from 'node:test';
import { openDatabase } from './db/database.ts';
import { migrateDatabase } from './db/migrations.ts';
import { createTestDatabase } from './db/test-database.ts';
import {
  LearningFactIdConflictError,
  LearningRepository,
  LearningVersionConflictError,
} from './learning-repository.ts';

test('writes one learning event and advances only its student topic plus global in the same transaction', () => {
  const fixture = repositoryFixture();
  try {
    const repository = new LearningRepository(fixture.database);

    const result = repository.appendEvent({
      eventId: 'event-stu-a-001',
      studentId: 'stu-a',
      nodeId: 'P1T1-N01',
      channel: 'self-study',
      eventType: 'section_completed',
      payload: { sectionId: 'case' },
      occurredAt: '2026-07-15T10:00:00.000Z',
    }, 0);

    assert.deepEqual(result, { inserted: true, version: 1, globalVersion: 1 });
    assert.equal(repository.readTopicVersion('learning:stu-a'), 1);
    assert.equal(repository.readTopicVersion('learning:stu-b'), 0);
    assert.equal(repository.readTopicVersion('global'), 1);
    assert.deepEqual(repository.readStudentFacts('stu-a').events, [{
      eventId: 'event-stu-a-001',
      studentId: 'stu-a',
      nodeId: 'P1T1-N01',
      channel: 'self-study',
      eventType: 'section_completed',
      payload: { sectionId: 'case' },
      occurredAt: '2026-07-15T10:00:00.000Z',
      origin: 'user',
    }]);
  } finally {
    fixture.cleanup();
  }
});

test('replays the same event ID idempotently before checking a stale expected version', () => {
  const fixture = repositoryFixture();
  try {
    const repository = new LearningRepository(fixture.database);
    const event = {
      eventId: 'event-replay-001',
      studentId: 'stu-a',
      nodeId: 'P1T1-N01',
      channel: 'self-study' as const,
      eventType: 'micro_practice_passed',
      payload: { result: 'passed' },
      occurredAt: '2026-07-15T10:01:00.000Z',
    };

    assert.equal(repository.appendEvent(event, 0).inserted, true);
    assert.deepEqual(repository.appendEvent(event, 0), {
      inserted: false,
      version: 1,
      globalVersion: 1,
    });
    assert.equal(repository.readStudentFacts('stu-a').events.length, 1);
  } finally {
    fixture.cleanup();
  }
});

test('stores and replays a structurally valid formal attempt without applying command policy', () => {
  const fixture = repositoryFixture();
  try {
    const repository = new LearningRepository(fixture.database);
    fixture.database.prepare(`
      INSERT INTO formal_assessment_instances (
        assessment_id, node_id, game_id, question_version, status
      ) VALUES ('assessment-stu-a-001', 'P1T1-N02', 'node-test', 'question-v1', 'running')
    `).run();
    const attempt = {
      attemptId: 'attempt-stu-a-001',
      studentId: 'stu-a',
      nodeId: 'P1T1-N02',
      assessmentId: 'assessment-stu-a-001',
      gameId: 'node-test',
      score: 79.5,
      durationSeconds: 203,
      mistakeKnowledgePointIds: ['kp-boundary'],
      completedAt: '2026-07-15T10:02:00.000Z',
      answers: {},
      diagnostics: {},
      origin: 'user',
    };

    assert.deepEqual(repository.recordFormalAttempt(attempt, 0), {
      inserted: true,
      version: 1,
      globalVersion: 1,
    });
    assert.deepEqual(repository.recordFormalAttempt(attempt, 0), {
      inserted: false,
      version: 1,
      globalVersion: 1,
    });
    assert.deepEqual(repository.readStudentFacts('stu-a').attempts, [{
      ...attempt,
      score: 79.5,
    }]);
  } finally {
    fixture.cleanup();
  }
});

test('conflicts only on the addressed student topic while another student writes independently', () => {
  const fixture = repositoryFixture();
  try {
    const repository = new LearningRepository(fixture.database);
    repository.appendEvent(eventInput('event-a-1', 'stu-a'), 0);

    assert.throws(
      () => repository.appendEvent(eventInput('event-a-stale', 'stu-a'), 0),
      (error: unknown) => error instanceof LearningVersionConflictError
        && error.topic === 'learning:stu-a'
        && error.expectedVersion === 0
        && error.actualVersion === 1,
    );
    assert.deepEqual(repository.appendEvent(eventInput('event-b-1', 'stu-b'), 0), {
      inserted: true,
      version: 1,
      globalVersion: 2,
    });
    assert.equal(repository.readTopicVersion('learning:stu-a'), 1);
    assert.equal(repository.readTopicVersion('learning:stu-b'), 1);
    assert.equal(repository.readStudentFacts('stu-a').events.length, 1);

    assert.throws(
      () => repository.appendEvent({
        ...eventInput('event-a-1', 'stu-a'),
        nodeId: 'P1T1-N02',
      }, 1),
      LearningFactIdConflictError,
    );
    assert.equal(repository.readTopicVersion('global'), 2);
  } finally {
    fixture.cleanup();
  }
});

test('reads committed event and attempt facts after the file database and repository are rebuilt', () => {
  const fixture = repositoryFixture();
  let reopened: ReturnType<typeof openDatabase> | undefined;
  try {
    const first = new LearningRepository(fixture.database);
    first.appendEvent(eventInput('event-durable', 'stu-a'), 0);
    first.recordFormalAttempt({
      attemptId: 'attempt-durable',
      studentId: 'stu-a',
      nodeId: 'P1T1-N02',
      score: 82,
    }, 1);
    fixture.database.close();

    reopened = openDatabase({ path: fixture.databasePath, fileMustExist: true });
    const rebuilt = new LearningRepository(reopened);
    const facts = rebuilt.readStudentFacts('stu-a');
    assert.equal(facts.version, 2);
    assert.equal(facts.globalVersion, 2);
    assert.equal(facts.events[0]?.eventId, 'event-durable');
    assert.equal(facts.attempts[0]?.attemptId, 'attempt-durable');
    assert.equal(facts.attempts[0]?.score, 82);
  } finally {
    if (reopened?.open) reopened.close();
    fixture.cleanup();
  }
});

test('keeps teacher ownership and active student membership isolated by class', () => {
  const fixture = repositoryFixture();
  try {
    fixture.database.exec(`
      INSERT INTO users (id, username, display_name, role, password_hash)
      VALUES
        ('teacher-a', 'teacher-a', 'Teacher A', 'teacher', 'disabled'),
        ('teacher-b', 'teacher-b', 'Teacher B', 'teacher', 'disabled'),
        ('stu-disabled', 'student-disabled', 'Disabled', 'student', 'disabled');
      UPDATE users SET is_active = 0 WHERE id = 'stu-disabled';
      INSERT INTO classroom_sessions (session_id, class_id, name, teacher_id)
      VALUES
        ('session-a', 'class-a', 'Class A', 'teacher-a'),
        ('session-b', 'class-b', 'Class B', 'teacher-b');
      INSERT INTO classroom_members (session_id, student_id)
      VALUES
        ('session-a', 'stu-a'),
        ('session-a', 'stu-disabled'),
        ('session-b', 'stu-b');
    `);
    const repository = new LearningRepository(fixture.database);

    assert.equal(repository.teacherOwnsClass('teacher-a', 'class-a'), true);
    assert.equal(repository.teacherOwnsClass('teacher-a', 'class-b'), false);
    assert.equal(repository.teacherOwnsClass('teacher-b', 'class-a'), false);
    assert.equal(repository.teacherOwnsClass('teacher-a', 'missing-class'), false);
    assert.deepEqual(repository.readClassStudentIds('teacher-a', 'class-a'), ['stu-a']);
    assert.deepEqual(repository.readClassStudentIds('teacher-b', 'class-b'), ['stu-b']);
    assert.deepEqual(repository.readClassStudentIds('teacher-a', 'class-b'), []);
    assert.deepEqual(repository.readClassStudentIds('teacher-a', 'missing-class'), []);
  } finally {
    fixture.cleanup();
  }
});

test('teacher class reads use one authoritative session without crossing teachers or historical sessions', () => {
  const fixture = repositoryFixture();
  try {
    fixture.database.exec(`
      INSERT INTO users (id, username, display_name, role, password_hash)
      VALUES
        ('teacher-a', 'teacher-a', 'Teacher A', 'teacher', 'disabled'),
        ('teacher-b', 'teacher-b', 'Teacher B', 'teacher', 'disabled'),
        ('stu-history', 'student-history', 'Historical Student', 'student', 'disabled');
      INSERT INTO classroom_sessions (
        session_id, class_id, name, teacher_id, status, active_node_id, updated_at
      ) VALUES
        ('session-a-current', 'shared-class', 'A Current', 'teacher-a', 'active', 'P1T1-N02', '2026-07-15T10:00:00.000Z'),
        ('session-a-current-z', 'shared-class', 'A Same Time', 'teacher-a', 'active', 'P1T1-N03', '2026-07-15T10:00:00.000Z'),
        ('session-a-history', 'shared-class', 'A History', 'teacher-a', 'active', 'P1T1-N01', '2026-07-14T10:00:00.000Z'),
        ('session-a-paused', 'shared-class', 'A Paused', 'teacher-a', 'paused', 'P1T1-N03', '2026-07-16T10:00:00.000Z'),
        ('session-b-current', 'shared-class', 'B Current', 'teacher-b', 'active', 'P1T1-N04', '2026-07-16T10:00:00.000Z');
      INSERT INTO classroom_members (session_id, student_id)
      VALUES
        ('session-a-current', 'stu-a'),
        ('session-a-current-z', 'stu-history'),
        ('session-a-history', 'stu-history'),
        ('session-a-paused', 'stu-history'),
        ('session-b-current', 'stu-b');
    `);
    const repository = new LearningRepository(fixture.database);

    assert.deepEqual(repository.readClassStudentIds('teacher-a', 'shared-class'), ['stu-a']);
    assert.deepEqual(repository.readClassStudentIds('teacher-b', 'shared-class'), ['stu-b']);
    assert.deepEqual(
      repository.readClassStudentFacts('teacher-a', 'shared-class').students.map(({ studentId }) => studentId),
      ['stu-a'],
    );
    assert.deepEqual(
      repository.readClassStudentFacts('teacher-b', 'shared-class').students.map(({ studentId }) => studentId),
      ['stu-b'],
    );
  } finally {
    fixture.cleanup();
  }
});

test('classroom event eligibility requires the authoritative session membership, node, and live status', () => {
  const fixture = repositoryFixture();
  try {
    fixture.database.exec(`
      INSERT INTO users (id, username, display_name, role, password_hash)
      VALUES ('teacher-a', 'teacher-a', 'Teacher A', 'teacher', 'disabled');
      INSERT INTO classroom_sessions (
        session_id, class_id, name, teacher_id, status, active_node_id, updated_at
      ) VALUES
        ('session-current', 'class-live', 'Current', 'teacher-a', 'active', 'P1T1-N02', '2026-07-15T10:00:00.000Z'),
        ('session-history', 'class-live', 'History', 'teacher-a', 'paused', 'P1T1-N02', '2026-07-14T10:00:00.000Z');
      INSERT INTO classroom_members (session_id, student_id)
      VALUES
        ('session-current', 'stu-a'),
        ('session-history', 'stu-b');
    `);
    const repository = new LearningRepository(fixture.database);

    assert.equal(repository.studentCanSubmitClassroomEvent('stu-a', 'class-live', 'P1T1-N02'), true);
    assert.equal(repository.studentCanSubmitClassroomEvent('stu-a', 'class-live', 'P1T1-N03'), false);
    assert.equal(repository.studentCanSubmitClassroomEvent('stu-b', 'class-live', 'P1T1-N02'), false);
    assert.equal(repository.studentCanSubmitClassroomEvent('stu-a', 'missing-class', 'P1T1-N02'), false);

    fixture.database.prepare(`
      UPDATE classroom_sessions SET status = ? WHERE session_id = 'session-current'
    `).run('paused');
    assert.equal(repository.studentCanSubmitClassroomEvent('stu-a', 'class-live', 'P1T1-N02'), true);

    fixture.database.prepare(`
      UPDATE classroom_sessions SET status = ? WHERE session_id = 'session-current'
    `).run('preparing');
    assert.equal(repository.studentCanSubmitClassroomEvent('stu-a', 'class-live', 'P1T1-N02'), false);
  } finally {
    fixture.cleanup();
  }
});

test('formal-attempt storage validates structure but does not enforce node policy or the three-attempt limit', () => {
  const fixture = repositoryFixture();
  try {
    const repository = new LearningRepository(fixture.database);
    const first = {
      attemptId: 'attempt-structural-1',
      studentId: 'stu-a',
      nodeId: 'P1T1-N02',
      score: 70,
    };
    repository.recordFormalAttempt(first, 0);
    assert.throws(
      () => repository.recordFormalAttempt({ ...first, score: 71 }, 1),
      LearningFactIdConflictError,
    );
    assert.throws(
      () => repository.recordFormalAttempt({ ...first, attemptId: 'attempt-invalid', score: 101 }, 1),
      /score must be a finite number from 0 through 100/i,
    );
    assert.equal(repository.readTopicVersion('learning:stu-a'), 1);
    assert.equal(repository.readTopicVersion('global'), 1);

    for (const [offset, nodeId] of ['P1T1-N02', 'P1T1-N04', 'future-node'].entries()) {
      repository.recordFormalAttempt({
        attemptId: `attempt-structural-${offset + 2}`,
        studentId: 'stu-a',
        nodeId,
        score: 72 + offset,
      }, offset + 1);
    }
    assert.equal(repository.readStudentFacts('stu-a').attempts.length, 4);
    assert.equal(repository.readTopicVersion('learning:stu-a'), 4);
    assert.equal(repository.readTopicVersion('global'), 4);
  } finally {
    fixture.cleanup();
  }
});

function repositoryFixture() {
  const fixture = createTestDatabase();
  migrateDatabase(fixture.database);
  fixture.database.exec(`
    INSERT INTO users (id, username, display_name, role, password_hash)
    VALUES
      ('stu-a', 'student-a', 'Student A', 'student', 'disabled'),
      ('stu-b', 'student-b', 'Student B', 'student', 'disabled');
  `);
  return fixture;
}

function eventInput(eventId: string, studentId: string) {
  return {
    eventId,
    studentId,
    nodeId: 'P1T1-N01',
    channel: 'self-study' as const,
    eventType: 'section_completed',
    payload: { sectionId: 'case' },
    occurredAt: '2026-07-15T10:03:00.000Z',
  };
}
