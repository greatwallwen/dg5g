import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthoritativeSnapshotReader } from '@/platform/authoritative-snapshot.ts';
import type { AuthenticatedActor } from '@/platform/auth/actor.ts';
import { seedDemo } from '@/platform/db/demo-seed.ts';
import { migrateDatabase } from '@/platform/db/migrations.ts';
import { createTestDatabase } from '@/platform/db/test-database.ts';
import {
  projectTeacherClassroomCut,
  projectTeacherConsoleSnapshot,
} from './teacher-console-snapshot-model.ts';

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

test('teacher classroom cut exposes the exact fifth page and revision from one authoritative snapshot', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const snapshot = new AuthoritativeSnapshotReader(fixture.database).read(
      teacher,
      'teacher',
      { sessionId: 'demo-class' },
    );
    const cursor = {
      lessonRunId: 'lesson-run-p02', lessonId: 'P02-L1', taskId: 'P02',
      nodeId: 'P1T2-N04', unitId: 'P02-ku-04', pageId: 'P02-L1-P05', pageIndex: 4,
      phase: 'practice', actionId: 'P1T2-N04-S05', actionIndex: 4,
      playbackStatus: 'paused', positionMs: 0, rate: 1, audioOwner: 'teacher',
      revision: 7, updatedAt: '2026-07-18T02:00:00.000Z',
    } as const;
    const cut = projectTeacherClassroomCut({
      ...snapshot,
      classroom: {
        ...snapshot.classroom,
        revision: 7,
        status: 'active',
        activeTaskId: 'P02',
        activeNodeId: cursor.nodeId,
        activeUnitId: cursor.unitId,
        activeLesson: {
          runId: cursor.lessonRunId,
          lessonId: cursor.lessonId,
          status: 'active',
          revision: 7,
          cursor,
          pageCount: 6,
        },
      },
    });

    assert.equal(cut?.page.id, 'P02-L1-P05');
    assert.equal(cut?.page.nodeId, 'P1T2-N04');
    assert.equal(cut?.page.professionalOutput?.kind, 'professional-output');
    assert.equal(cut?.pageIndex, 4);
    assert.equal(cut?.pageCount, 6);
    assert.equal(cut?.revision, 7);
    assert.equal(cut?.lessonState.revision, 7);
  } finally {
    fixture.cleanup();
  }
});
