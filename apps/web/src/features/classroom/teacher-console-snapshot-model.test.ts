import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthoritativeSnapshotReader } from '@/platform/authoritative-snapshot.ts';
import type { AuthenticatedActor } from '@/platform/auth/actor.ts';
import { seedDemo } from '@/platform/db/demo-seed.ts';
import { migrateDatabase } from '@/platform/db/migrations.ts';
import { createTestDatabase } from '@/platform/db/test-database.ts';
import { projectTeacherConsoleSnapshot } from './teacher-console-snapshot-model.ts';

const teacher: AuthenticatedActor = {
  userId: 'teacher-01',
  username: 'teacher01',
  displayName: '张老师',
  role: 'teacher',
  classId: 'demo-class',
};

test('teacher console model projects every numeric classroom fact from the authoritative snapshot', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const snapshot = new AuthoritativeSnapshotReader(fixture.database).read(
      teacher,
      'teacher',
      { sessionId: 'demo-class', now: new Date('2026-07-16T02:00:00.000Z') },
    );

    const model = projectTeacherConsoleSnapshot(snapshot, 'idle');

    assert.deepEqual(model.rosterStats, {
      total: 3,
      follow: 0,
      self: 0,
      submitted: 0,
      needsHelp: 3,
    });
    assert.equal(model.controlMode, 'follow');
    assert.equal(model.formalAssessment, snapshot.submissions.activeAssessment);
    assert.equal(model.classroomActivity, snapshot.submissions.classroomActivity);
    assert.equal(model.professionalOutputs, snapshot.submissions.professionalOutputs);
    assert.equal(model.classScores, snapshot.classScores);
    assert.equal(model.helper, snapshot.helper);
    assert.deepEqual(model.helper.commandDelivery, { applied: 0, pending: 0, failed: 0 });
  } finally {
    fixture.cleanup();
  }
});

test('teacher console model distinguishes self-directed joined students and preserves missing scores', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    fixture.database.exec(`
      UPDATE classroom_sessions SET status = 'active' WHERE session_id = 'demo-class';
      INSERT INTO classroom_participation (session_id, student_id, state, mode, joined_at, updated_at)
      VALUES
        ('demo-class', 'stu-01', 'joined', 'follow', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ('demo-class', 'stu-02', 'joined', 'self', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    `);
    const snapshot = new AuthoritativeSnapshotReader(fixture.database).read(
      teacher,
      'teacher',
      { sessionId: 'demo-class' },
    );
    const withoutScores = {
      ...snapshot,
      classScores: { distribution: snapshot.classScores.distribution },
    };

    const model = projectTeacherConsoleSnapshot(withoutScores, 'forced');

    assert.deepEqual(model.rosterStats, {
      total: 3,
      follow: 1,
      self: 1,
      submitted: 0,
      needsHelp: 3,
    });
    assert.equal(model.controlMode, 'forced');
    assert.equal(model.classScores.activeNodeTestAverageScore, undefined);
    assert.equal(model.classScores.activeTaskCompositeAverageScore, undefined);
    assert.equal(model.classScores.projectCompositeAverageScore, undefined);
  } finally {
    fixture.cleanup();
  }
});
