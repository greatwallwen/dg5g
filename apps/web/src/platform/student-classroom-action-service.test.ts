import assert from 'node:assert/strict';
import test from 'node:test';
import { ClassroomParticipationRepository } from './classroom-participation-repository.ts';
import { getClassSession } from './class-session-store.ts';
import { closeDatabase } from './db/database.ts';
import { seedDemo } from './db/demo-seed.ts';
import { migrateDatabase } from './db/migrations.ts';
import { createTestDatabase } from './db/test-database.ts';
import { applyStudentClassroomAction } from './student-classroom-action-service.ts';

test('legacy student classroom actions keep navigation but reject generic activity completion', () => {
  const fixture = createTestDatabase();
  const previousPath = process.env.DGBOOK_SQLITE_PATH;
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    process.env.DGBOOK_SQLITE_PATH = fixture.databasePath;
    closeDatabase();
    fixture.database.prepare(`UPDATE classroom_sessions SET status = 'active' WHERE session_id = 'demo-class'`).run();
    const participation = new ClassroomParticipationRepository(fixture.database);
    participation.join('demo-class', 'stu-01');

    const navigation = applyStudentClassroomAction('demo-class', 'stu-01', {
      type: 'navigation_changed',
      mode: 'self',
      currentSlideIndex: 4,
    }, fixture.database);
    assert.equal(navigation.studentRoster.find(({ studentId }) => studentId === 'stu-01')?.mode, 'self');
    assert.equal(participation.read('demo-class', 'stu-01')?.mode, 'self');
    assert.equal(
      navigation.studentRoster.find(({ studentId }) => studentId === 'stu-01')?.currentSlideIndex,
      getClassSession('demo-class').studentRoster.find(({ studentId }) => studentId === 'stu-01')?.currentSlideIndex,
      'the obsolete client slide index is never echoed as if it were persisted',
    );

    assert.throws(() => applyStudentClassroomAction('demo-class', 'stu-01', {
      type: 'activity_submitted',
      answers: ['AAU nameplate', 'fiber label'],
      mode: 'self',
      currentSlideIndex: 4,
    }, fixture.database), /activity attempts API/i);
    closeDatabase();
    const refreshed = getClassSession('demo-class').studentRoster.find(({ studentId }) => studentId === 'stu-01');
    assert.equal(refreshed?.mode, 'self');
    assert.equal(refreshed?.submissionState, 'draft');
    assert.equal(refreshed?.evidenceCount, 0);
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM learning_events
      WHERE student_id = 'stu-01' AND event_type = 'classroom_activity_submitted'
    `).pluck().get(), 0);
  } finally {
    closeDatabase();
    if (previousPath === undefined) delete process.env.DGBOOK_SQLITE_PATH;
    else process.env.DGBOOK_SQLITE_PATH = previousPath;
    fixture.cleanup();
  }
});

test('legacy generic completion is rejected before participation or event mutation', () => {
  const fixture = createTestDatabase();
  const previousPath = process.env.DGBOOK_SQLITE_PATH;
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    process.env.DGBOOK_SQLITE_PATH = fixture.databasePath;
    closeDatabase();
    assert.throws(() => applyStudentClassroomAction('demo-class', 'stu-01', {
      type: 'activity_submitted',
      answers: ['must not persist'],
      mode: 'follow',
      currentSlideIndex: 1,
    }, fixture.database), /activity attempts API/i);
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM learning_events
      WHERE student_id = 'stu-01' AND event_type = 'classroom_activity_submitted'
    `).pluck().get(), 0);
  } finally {
    closeDatabase();
    if (previousPath === undefined) delete process.env.DGBOOK_SQLITE_PATH;
    else process.env.DGBOOK_SQLITE_PATH = previousPath;
    fixture.cleanup();
  }
});
