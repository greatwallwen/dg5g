import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthenticatedActor } from './auth/actor.ts';
import { ClassroomParticipationRepository } from './classroom-participation-repository.ts';
import { ClassroomSessionRepository } from './classroom-session-repository.ts';
import { seedDemo } from './db/demo-seed.ts';
import { migrateDatabase } from './db/migrations.ts';
import { createTestDatabase } from './db/test-database.ts';
import { LearningRepository } from './learning-repository.ts';
import {
  AuthoritativeSnapshotAuthorizationError,
  AuthoritativeSnapshotReader,
  type AuthoritativeSnapshot,
} from './authoritative-snapshot.ts';

const now = new Date('2026-07-16T01:20:00.000Z');

test('one authoritative transaction yields identical common facts and audience-safe cuts', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const reader = new AuthoritativeSnapshotReader(fixture.database);
    const student = reader.read(studentActor('stu-01'), 'student', { now });
    const teacher = reader.read(teacherActor(), 'teacher', { now });
    const projector = reader.read(teacherActor(), 'projector', { now });
    const studentGraph = reader.read(studentActor('stu-01'), 'graph', { now });
    const teacherGraph = reader.read(teacherActor(), 'graph', { now });

    const expectedVersion = fixture.database.prepare(`
      SELECT version FROM snapshot_versions WHERE topic = 'global'
    `).pluck().get();
    assert.equal(student.snapshotVersion, expectedVersion);
    assert.deepEqual(commonOf(student), commonOf(teacher));
    assert.deepEqual(commonOf(student), commonOf(projector));
    assert.deepEqual(commonOf(student), commonOf(studentGraph));
    assert.deepEqual(commonOf(student), commonOf(teacherGraph));
    assert.deepEqual(student.membership, { classSize: 3, joinedCount: 0, followingCount: 0 });
    assert.equal(student.classroom.sessionId, 'demo-class');
    assert.equal(student.classroom.activeNodeId, 'P1T1-N02');
    assert.deepEqual(student.helper, {
      status: 'offline',
      observedAt: now.toISOString(),
      onlineStudentDeviceCount: 0,
      commandDelivery: { applied: 0, pending: 0, failed: 0 },
      canPush: false,
    });

    assert.equal(student.audience, 'student');
    assert.equal(student.me.studentId, 'stu-01');
    assert.equal(student.me.learning.studentId, 'stu-01');
    assert.equal(student.me.learning.version, student.me.studentVersion);
    assert.equal(
      student.me.learning.nodes.find(({ nodeId }) => nodeId === 'P1T1-N02')?.bestFormalScore,
      74,
    );
    assert.equal(student.me.nodes.find(({ nodeId }) => nodeId === 'P1T1-N02')?.nodeTestHighestScore, 74);
    assert.equal('students' in student, false);

    assert.equal(teacher.audience, 'teacher');
    assert.deepEqual(teacher.students.map(({ studentId }) => studentId), ['stu-01', 'stu-02', 'stu-03']);
    assert.equal(teacher.students[0]?.nodes.length, 12);
    assert.equal(teacher.students.some((detail) => 'learning' in detail), false);

    assert.equal(studentGraph.audience, 'graph');
    assert.equal(studentGraph.mode, 'student');
    assert.equal(studentGraph.me.studentId, 'stu-01');
    assert.equal(teacherGraph.audience, 'graph');
    assert.equal(teacherGraph.mode, 'teacher');
    assert.equal(teacherGraph.nodeHeatmap.length, 12);

    assert.equal(projector.audience, 'projector');
    assertProjectorContainsNoPersonalData(projector);
  } finally {
    fixture.cleanup();
  }
});

test('score and submission fields keep their distinct authoritative meanings', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const snapshot = new AuthoritativeSnapshotReader(fixture.database)
      .read(teacherActor(), 'teacher', { now });

    assert.deepEqual(snapshot.submissions.classroomActivity, {
      submittedCount: 0,
      submissionPercent: 0,
    });
    assert.deepEqual(snapshot.submissions.activeAssessment, {
      status: 'idle',
      eligibleCount: 3,
      submittedCount: 0,
      playingCount: 0,
      passedCount: 0,
      submissionPercent: 0,
    });
    assert.deepEqual(snapshot.submissions.professionalOutputs, {
      submittedAwaitingReviewCount: 0,
      returnedCount: 0,
      verifiedCount: 3,
    });
    assert.deepEqual(snapshot.classScores, {
      activeNodeTestHighestScore: 93,
      activeNodeTestAverageScore: 85,
      activeTaskCompositeAverageScore: 91.5,
      distribution: [
        { range: '90-100', count: 1 },
        { range: 'pass-89', count: 1 },
        { range: '60-below-pass', count: 1 },
        { range: 'below-60', count: 0 },
      ],
    });
    assert.equal('projectCompositeAverageScore' in snapshot.classScores, false);
  } finally {
    fixture.cleanup();
  }
});

test('running assessment counts current-window zero-score submissions and remaining active players', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const classroom = new ClassroomSessionRepository(fixture.database).readSession('demo-class');
    assert.ok(classroom);
    classroom.state.formalTest = {
      gameId: 'P1T1-N02-formal',
      nodeId: 'P1T1-N02',
      status: 'running',
      durationSeconds: 300,
      startedAt: '2026-07-16T01:10:00.000Z',
    };
    fixture.database.prepare(`
      UPDATE classroom_sessions
      SET status = 'active', state_json = ?
      WHERE session_id = 'demo-class'
    `).run(JSON.stringify(classroom.state));
    const learning = new LearningRepository(fixture.database);
    learning.recordFormalAttempt({
      attemptId: 'current-window-zero',
      studentId: 'stu-01',
      nodeId: 'P1T1-N02',
      gameId: 'P1T1-N02-formal',
      score: 0,
      completedAt: '2026-07-16T01:15:00.000Z',
    }, learning.readTopicVersion('learning:stu-01'));
    learning.recordFormalAttempt({
      attemptId: 'current-window-other-game',
      studentId: 'stu-02',
      nodeId: 'P1T1-N02',
      gameId: 'other-formal-game',
      score: 100,
      completedAt: '2026-07-16T01:16:00.000Z',
    }, learning.readTopicVersion('learning:stu-02'));
    learning.recordFormalAttempt({
      attemptId: 'current-window-after-observation',
      studentId: 'stu-03',
      nodeId: 'P1T1-N02',
      gameId: 'P1T1-N02-formal',
      score: 100,
      completedAt: '2026-07-16T01:21:00.000Z',
    }, learning.readTopicVersion('learning:stu-03'));

    const snapshot = new AuthoritativeSnapshotReader(fixture.database)
      .read(teacherActor(), 'teacher', { now });

    assert.deepEqual(snapshot.submissions.activeAssessment, {
      status: 'running',
      eligibleCount: 3,
      submittedCount: 1,
      playingCount: 2,
      passedCount: 0,
      submissionPercent: 33.3,
      passRatePercent: 0,
    });
  } finally {
    fixture.cleanup();
  }
});

test('classroom lifecycle, participation, and helper availability remain separate synchronized axes', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    fixture.database.prepare(`
      UPDATE classroom_sessions SET status = 'active' WHERE session_id = 'demo-class'
    `).run();
    const participation = new ClassroomParticipationRepository(fixture.database);
    participation.join('demo-class', 'stu-01', new Date('2026-07-16T01:19:55.000Z'));
    participation.setMode('demo-class', 'stu-01', 'self', new Date('2026-07-16T01:19:56.000Z'));
    new ClassroomSessionRepository(fixture.database).recordHeartbeat('demo-class', {
      deviceId: 'private-student-device',
      actorRole: 'student',
      studentId: 'stu-01',
      pageState: 'ready',
      lastAppliedRevision: 0,
    }, new Date('2026-07-16T01:19:59.000Z'));

    const reader = new AuthoritativeSnapshotReader(fixture.database);
    const student = reader.read(studentActor('stu-01'), 'student', { now });
    const teacher = reader.read(teacherActor(), 'teacher', { now });
    const projector = reader.read(teacherActor(), 'projector', { now });

    assert.deepEqual(commonOf(student), commonOf(teacher));
    assert.deepEqual(commonOf(student), commonOf(projector));
    assert.equal(student.classroom.status, 'active');
    assert.deepEqual(student.membership, { classSize: 3, joinedCount: 1, followingCount: 0 });
    assert.equal(student.helper.status, 'online');
    assert.equal(student.helper.onlineStudentDeviceCount, 1);
    assert.equal(student.helper.canPush, true);
    assert.equal(JSON.stringify(projector).includes('private-student-device'), false);
  } finally {
    fixture.cleanup();
  }
});

test('teacher snapshot naturally expands from three to twenty-four active members', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const insertUser = fixture.database.prepare(`
      INSERT INTO users (id, username, display_name, role, password_hash, is_active)
      VALUES (?, ?, ?, 'student', 'test-hash', 1)
    `);
    const insertMember = fixture.database.prepare(`
      INSERT INTO classroom_members (session_id, student_id) VALUES ('demo-class', ?)
    `);
    fixture.database.transaction(() => {
      for (let index = 4; index <= 24; index += 1) {
        const id = `stu-${String(index).padStart(2, '0')}`;
        insertUser.run(id, `student${String(index).padStart(2, '0')}`, `学生${index}`);
        insertMember.run(id);
      }
    }).immediate();

    const snapshot = new AuthoritativeSnapshotReader(fixture.database)
      .read(teacherActor(), 'teacher', { now });

    assert.equal(snapshot.membership.classSize, 24);
    assert.equal(snapshot.students.length, 24);
    assert.equal(snapshot.submissions.activeAssessment.eligibleCount, 24);
  } finally {
    fixture.cleanup();
  }
});

test('audience authorization fails closed before returning a snapshot', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const reader = new AuthoritativeSnapshotReader(fixture.database);

    assert.throws(
      () => reader.read(studentActor('stu-01'), 'teacher', { now }),
      AuthoritativeSnapshotAuthorizationError,
    );
    assert.throws(
      () => reader.read(studentActor('stu-01'), 'projector', { now }),
      AuthoritativeSnapshotAuthorizationError,
    );
    assert.throws(
      () => reader.read({ ...teacherActor(), classId: 'other-class' }, 'teacher', { now }),
      AuthoritativeSnapshotAuthorizationError,
    );
    assert.throws(
      () => reader.read({ ...studentActor('stu-01'), studentId: 'stu-02' }, 'student', { now }),
      AuthoritativeSnapshotAuthorizationError,
    );
  } finally {
    fixture.cleanup();
  }
});

function commonOf(snapshot: AuthoritativeSnapshot): Record<string, unknown> {
  const copy = { ...snapshot } as Record<string, unknown>;
  delete copy.audience;
  delete copy.me;
  delete copy.students;
  delete copy.weakPoints;
  delete copy.mode;
  delete copy.nodeHeatmap;
  delete copy.tasks;
  return copy;
}

function assertProjectorContainsNoPersonalData(snapshot: AuthoritativeSnapshot & { audience: 'projector' }): void {
  const serialized = JSON.stringify(snapshot);
  for (const forbidden of ['stu-01', 'stu-02', 'stu-03', '学生一', '学生二', '学生三']) {
    assert.equal(serialized.includes(forbidden), false, `projector leaked ${forbidden}`);
  }
  const forbiddenKeys = new Set([
    'studentId', 'students', 'participants', 'roster', 'devices', 'acks',
    'displayName', 'username', 'deviceId', 'outputId', 'feedback', 'answers', 'evidenceText',
  ]);
  visit(snapshot, (key) => assert.equal(forbiddenKeys.has(key), false, `projector leaked key ${key}`));
}

function visit(value: unknown, check: (key: string) => void): void {
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    check(key);
    visit(nested, check);
  }
}

function teacherActor(): AuthenticatedActor {
  return {
    userId: 'teacher-01',
    username: 'teacher01',
    displayName: '张老师',
    role: 'teacher',
    classId: 'demo-class',
  };
}

function studentActor(studentId: 'stu-01' | 'stu-02' | 'stu-03'): AuthenticatedActor {
  return {
    userId: studentId,
    username: studentId.replace('stu-', 'student'),
    displayName: studentId,
    role: 'student',
    classId: 'demo-class',
    studentId,
  };
}
