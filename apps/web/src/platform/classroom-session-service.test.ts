import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthenticatedActor } from './auth/actor.ts';
import { ClassroomSessionService } from './classroom-session-service.ts';
import { seedDemo } from './db/demo-seed.ts';
import { migrateDatabase } from './db/migrations.ts';
import { createTestDatabase } from './db/test-database.ts';
import { ClassroomSessionRepository } from './classroom-session-repository.ts';
import { ClassroomRosterRepository } from './classroom-roster-repository.ts';
import { getNodeLearningPolicy } from './learning-policy.ts';

const teacher: AuthenticatedActor = {
  userId: 'teacher-01',
  username: 'teacher01',
  displayName: '张老师',
  role: 'teacher',
  classId: 'demo-class',
};

const student: AuthenticatedActor = {
  userId: 'stu-01',
  username: 'student01',
  displayName: '学生一',
  role: 'student',
  classId: 'demo-class',
  studentId: 'stu-01',
};

test('authorizes exact SQLite membership and returns role-scoped projections of one session', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const service = new ClassroomSessionService(
      new ClassroomSessionRepository(fixture.database),
      new ClassroomRosterRepository(fixture.database),
    );

    const teacherSession = service.read(teacher, 'demo-class');
    const studentSession = service.read(student, 'demo-class');

    assert.ok(teacherSession);
    assert.ok(studentSession);
    assert.equal(teacherSession.sessionId, 'demo-class');
    assert.equal(teacherSession.sessionStatus, 'paused');
    assert.equal(teacherSession.activeNodeId, 'P1T1-N02');
    assert.equal(teacherSession.studentRoster.length, 3);
    assert.deepEqual(studentSession.studentRoster, []);
    assert.equal(studentSession.studentProgress?.studentId, 'stu-01');
    assert.throws(
      () => service.read({ ...student, userId: 'stu-missing', studentId: 'stu-missing' }, 'demo-class'),
      { name: 'ClassroomAuthorizationError' },
    );
    assert.equal(service.read(teacher, 'P1T1-N02'), undefined);
  } finally {
    fixture.cleanup();
  }
});

test('allows only the owning teacher to apply a revision-checked lesson intent', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const service = new ClassroomSessionService(
      new ClassroomSessionRepository(fixture.database),
      new ClassroomRosterRepository(fixture.database),
    );

    assert.throws(
      () => service.applyTeacherIntent(student, 'demo-class', { type: 'phase_changed', phase: 'lecture' }, 0),
      { name: 'ClassroomAuthorizationError' },
    );
    const result = service.applyTeacherIntent(
      teacher,
      'demo-class',
      { type: 'phase_changed', phase: 'lecture' },
      0,
      new Date('2026-07-16T02:00:00.000Z'),
    );

    assert.equal(result.session.lessonState?.phase, 'lecture');
    assert.equal(result.session.sessionStatus, 'active');
    assert.equal(result.session.lessonState?.revision, 1);
    assert.equal(result.command.revision, 1);
    assert.equal(result.session.syncRequestId, result.command.commandId);
  } finally {
    fixture.cleanup();
  }
});

test('fails closed without a revision or command when a classroom is closed', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    fixture.database.prepare(`
      UPDATE classroom_sessions SET status = 'closed' WHERE session_id = 'demo-class'
    `).run();
    const service = new ClassroomSessionService(
      new ClassroomSessionRepository(fixture.database),
      new ClassroomRosterRepository(fixture.database),
    );

    assert.throws(
      () => service.applyTeacherIntent(
        teacher,
        'demo-class',
        { type: 'phase_changed', phase: 'lecture' },
        0,
      ),
      { name: 'ClassroomIntentError' },
    );
    assert.equal(fixture.database.prepare(`
      SELECT revision FROM classroom_sessions WHERE session_id = 'demo-class'
    `).pluck().get(), 0);
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM classroom_commands WHERE session_id = 'demo-class'
    `).pluck().get(), 0);
  } finally {
    fixture.cleanup();
  }
});

test('rejects an unpublished node or mismatched unit before teacher CAS', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const service = new ClassroomSessionService(
      new ClassroomSessionRepository(fixture.database),
      new ClassroomRosterRepository(fixture.database),
    );

    for (const patch of [
      { activeNodeId: 'P9T9-N99', activeUnitId: 'P99-ku-99' },
      { activeNodeId: 'P1T1-N03', activeUnitId: 'P01-ku-99' },
    ]) {
      assert.throws(
        () => service.patchTeacherState(teacher, 'demo-class', patch, 0),
        { name: 'ClassroomIntentError' },
      );
    }
    assert.equal(fixture.database.prepare(`
      SELECT revision FROM classroom_sessions WHERE session_id = 'demo-class'
    `).pluck().get(), 0);
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM classroom_commands WHERE session_id = 'demo-class'
    `).pluck().get(), 0);
  } finally {
    fixture.cleanup();
  }
});

test('startLesson atomically reopens the classroom at a fresh published teaching position', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const repository = new ClassroomSessionRepository(fixture.database);
    const service = new ClassroomSessionService(
      repository,
      new ClassroomRosterRepository(fixture.database),
    );
    service.applyTeacherIntent(
      teacher,
      'demo-class',
      { type: 'phase_changed', phase: 'lecture' },
      0,
      new Date('2026-07-16T03:00:00.000Z'),
    );
    const beforeDirty = service.read(teacher, 'demo-class');
    assert.ok(beforeDirty?.formalTest);
    const dirty = service.patchTeacherState(teacher, 'demo-class', {
      activityState: 'reviewing',
      reviewState: 'completed',
      studentSyncState: 'forced',
      playbackCursor: {
        sceneId: 'stale-scene',
        actionId: 'stale-action',
        actionIndex: 4,
      },
      formalTest: {
        ...beforeDirty.formalTest,
        status: 'running',
        startedAt: '2026-07-16T03:01:00.000Z',
      },
    }, 1, new Date('2026-07-16T03:01:00.000Z'));
    fixture.database.prepare(`
      UPDATE classroom_sessions SET status = 'closed' WHERE session_id = 'demo-class'
    `).run();
    const rosterModes = dirty.studentRoster.map(({ studentId, mode }) => ({ studentId, mode }));
    const eventCount = Number(fixture.database.prepare('SELECT COUNT(*) FROM learning_events').pluck().get());
    const outputCount = Number(fixture.database.prepare('SELECT COUNT(*) FROM professional_outputs').pluck().get());

    const result = service.startLesson(
      teacher,
      'demo-class',
      { nodeId: 'P1T1-N02', expectedRevision: 2 },
      new Date('2026-07-16T03:02:00.000Z'),
    );

    assert.equal(result.session.sessionStatus, 'active');
    assert.equal(result.session.activeNodeId, 'P1T1-N02');
    assert.equal(result.session.activeUnitId, 'P01-ku-02');
    assert.equal(result.session.lessonState?.phase, 'prepare');
    assert.equal(result.session.lessonState?.revision, 3);
    assert.equal(result.session.lessonState?.playback.status, 'idle');
    assert.equal(result.session.lessonState?.playback.actionId, 'P1T1-N02-lesson-case');
    assert.equal(result.session.lessonState?.playback.actionIndex, 0);
    assert.equal(result.session.currentPageId, 'P1-TEACH-CONSOLE-N01');
    assert.equal(result.session.currentSlideId, 'P1T1-N02-S01');
    assert.equal(result.session.teacherSlideId, 'P1T1-N02-S01');
    assert.equal(result.session.teacherSlideIndex, 1);
    assert.equal(result.session.sceneMode, 'learning');
    assert.equal(result.session.studentSyncState, 'idle');
    assert.equal(result.session.activityState, 'not_pushed');
    assert.equal(result.session.reviewState, 'not_started');
    assert.equal(result.session.formalTest?.nodeId, 'P1T1-N02');
    assert.equal(result.session.formalTest?.status, 'idle');
    assert.equal(result.session.formalTest?.startedAt, undefined);
    assert.equal(result.command.revision, 3);
    assert.equal(result.command.nodeId, 'P1T1-N02');
    assert.equal(result.command.unitId, 'P01-ku-02');
    assert.equal(result.command.route, '/classroom/demo-class');
    assert.deepEqual(
      result.session.studentRoster.map(({ studentId, mode }) => ({ studentId, mode })),
      rosterModes,
    );
    assert.equal(Number(fixture.database.prepare('SELECT COUNT(*) FROM learning_events').pluck().get()), eventCount);
    assert.equal(Number(fixture.database.prepare('SELECT COUNT(*) FROM professional_outputs').pluck().get()), outputCount);
    assert.deepEqual(fixture.database.prepare(`
      SELECT status, active_node_id AS activeNodeId, active_unit_id AS activeUnitId, revision
      FROM classroom_sessions WHERE session_id = 'demo-class'
    `).get(), {
      status: 'active',
      activeNodeId: 'P1T1-N02',
      activeUnitId: 'P01-ku-02',
      revision: 3,
    });
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM classroom_commands WHERE session_id = 'demo-class' AND revision = 3
    `).pluck().get(), 1);
  } finally {
    fixture.cleanup();
  }
});

test('startLesson rejects unknown and unpublished nodes without mutating SQLite', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const repository = new ClassroomSessionRepository(fixture.database);
    const roster = new ClassroomRosterRepository(fixture.database);
    const published = getNodeLearningPolicy('P1T1-N02');
    assert.ok(published);
    const unknownService = new ClassroomSessionService(repository, roster);
    const unpublishedService = new ClassroomSessionService(
      repository,
      roster,
      (nodeId) => nodeId === published.nodeId
        ? { ...published, publicationStatus: 'not-open' }
        : getNodeLearningPolicy(nodeId),
    );

    assert.throws(
      () => unknownService.startLesson(
        teacher,
        'demo-class',
        { nodeId: 'P9T9-N99', expectedRevision: 0 },
      ),
      { name: 'ClassroomIntentError' },
    );
    assert.throws(
      () => unpublishedService.startLesson(
        teacher,
        'demo-class',
        { nodeId: 'P1T1-N02', expectedRevision: 0 },
      ),
      { name: 'ClassroomIntentError' },
    );
    assert.equal(fixture.database.prepare(`
      SELECT revision FROM classroom_sessions WHERE session_id = 'demo-class'
    `).pluck().get(), 0);
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM classroom_commands WHERE session_id = 'demo-class'
    `).pluck().get(), 0);
  } finally {
    fixture.cleanup();
  }
});

test('startLesson rejects a student and a stale teacher revision without overwriting the live lesson', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const service = new ClassroomSessionService(
      new ClassroomSessionRepository(fixture.database),
      new ClassroomRosterRepository(fixture.database),
    );

    assert.throws(
      () => service.startLesson(
        student,
        'demo-class',
        { nodeId: 'P1T1-N02', expectedRevision: 0 },
      ),
      { name: 'ClassroomAuthorizationError' },
    );
    const first = service.startLesson(
      teacher,
      'demo-class',
      { nodeId: 'P1T1-N03', expectedRevision: 0 },
    );
    assert.equal(first.session.lessonState?.revision, 1);
    assert.throws(
      () => service.startLesson(
        teacher,
        'demo-class',
        { nodeId: 'P1T1-N02', expectedRevision: 0 },
      ),
      (error: unknown) => (
        error instanceof Error
        && error.name === 'ClassroomRevisionConflictError'
        && 'currentRevision' in error
        && error.currentRevision === 1
      ),
    );
    assert.deepEqual(fixture.database.prepare(`
      SELECT active_node_id AS activeNodeId, active_unit_id AS activeUnitId, revision
      FROM classroom_sessions WHERE session_id = 'demo-class'
    `).get(), {
      activeNodeId: 'P1T1-N03',
      activeUnitId: 'P01-ku-03',
      revision: 1,
    });
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM classroom_commands WHERE session_id = 'demo-class'
    `).pluck().get(), 1);
  } finally {
    fixture.cleanup();
  }
});

test('startLesson returns the new-node roster projection while preserving each participation mode', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const service = new ClassroomSessionService(
      new ClassroomSessionRepository(fixture.database),
      new ClassroomRosterRepository(fixture.database),
    );
    const before = service.read(teacher, 'demo-class');
    assert.ok(before);
    const modes = before.studentRoster.map(({ studentId, mode }) => ({ studentId, mode }));

    const result = service.startLesson(
      teacher,
      'demo-class',
      { nodeId: 'P1T1-N03', expectedRevision: 0 },
    );
    const fresh = service.read(teacher, 'demo-class');

    assert.ok(fresh);
    assert.deepEqual(result.session.studentRoster, fresh.studentRoster);
    assert.deepEqual(
      result.session.studentRoster.map(({ studentId, mode }) => ({ studentId, mode })),
      modes,
    );
    assert.equal(result.session.studentRoster.every(({ activeNodeId }) => activeNodeId === 'P1T1-N03'), true);
  } finally {
    fixture.cleanup();
  }
});
