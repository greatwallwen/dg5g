import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeSessionPatch, normalizeSessionPatch } from './class-session-protocol.ts';

const studentOne = {
  studentId: 'stu-01',
  name: 'Student 01',
  group: 'A',
  mode: 'self' as const,
  currentSlideIndex: 4,
  selfStudyState: 'in_progress' as const,
  submissionState: 'submitted' as const,
  evidenceCount: 2,
  lastAction: 'Concurrent student update',
  risk: 'watch' as const,
  evidenceReviewStatus: 'submitted' as const,
  evidenceText: 'Original evidence',
  teacherVerified: false,
};

const studentTwo = {
  ...studentOne,
  studentId: 'stu-02',
  name: 'Student 02',
  currentSlideIndex: 7,
  lastAction: 'Untouched student',
};

const session = {
  sessionId: 'task-4-protocol',
  teacherSlideId: 'slide-04',
  teacherSlideIndex: 4,
  studentMode: 'follow' as const,
  activityState: 'submitted' as const,
  submissionState: 'submitted' as const,
  reviewState: 'reviewing' as const,
  studentRoster: [studentOne, studentTwo],
};

test('teacher normalization permits a selected-student progress patch', () => {
  const studentProgress = {
    studentId: 'stu-01',
    evidenceReviewStatus: 'returned' as const,
    teacherFeedback: 'Add a verifiable signal reading.',
    lastAction: 'Teacher returned P01-N02 evidence.',
  };

  assert.deepEqual(normalizeSessionPatch('teacher', { studentProgress }), { studentProgress });
});

test('teacher review patches cannot manufacture a helper acknowledgement', () => {
  const studentProgress = {
    studentId: 'stu-01',
    evidenceReviewStatus: 'returned' as const,
    handledSyncRequestId: 'forged-helper-ack',
  };

  assert.deepEqual(normalizeSessionPatch('teacher', { studentProgress }), {
    studentProgress: {
      studentId: 'stu-01',
      evidenceReviewStatus: 'returned',
    },
  });
});

test('student patches cannot manufacture browser or nested helper acknowledgements', () => {
  assert.deepEqual(normalizeSessionPatch('student', {
    handledSyncRequestId: 'browser-forged-ack',
    studentProgress: {
      studentId: 'stu-01',
      handledSyncRequestId: 'nested-forged-ack',
      submissionState: 'submitted',
    },
  }), {});
});

test('student generic patches cannot mutate shared state or authoritative progress', () => {
  assert.deepEqual(normalizeSessionPatch('student', {
    activityState: 'submitted',
    submissionState: 'submitted',
    submissionAnswers: ['client answer'],
    selfStudyState: 'completed',
    studentProgress: {
      studentId: 'stu-01',
      name: 'Forged name',
      risk: 'ok',
      evidenceCount: 99,
      bestGameScore: 100,
      teacherVerified: true,
    },
  }), {});
});

test('teacher cannot replace the roster or write authoritative lesson state through a legacy patch', () => {
  const lessonState = {
    phase: 'lecture' as const,
    activeNodeId: 'P1T1-N02',
    activeUnitId: 'P01-ku-02',
    revision: 9,
    playback: {
      sceneId: 'P1T1-N02-lesson',
      actionId: 'P1T1-N02-lesson-case',
      actionIndex: 0,
      status: 'playing' as const,
      startedAt: '2026-07-13T01:00:00.000Z',
      positionMs: 0,
      rate: 1,
      revision: 9,
      audioOwner: 'teacher' as const,
    },
  };

  assert.deepEqual(normalizeSessionPatch('teacher', { studentRoster: [studentOne], lessonState }), {});
});

test('generic teacher patch rejects every teaching-position and playback authority field', () => {
  assert.deepEqual(normalizeSessionPatch('teacher', {
    currentPageId: 'P1-STUDENT-FOLLOW-N01',
    currentSlideId: 'forged-current',
    teacherSlideId: 'forged-teacher',
    teacherSlideIndex: 99,
    sceneMode: 'challenge',
    activeTaskId: 'P03',
    activeNodeId: 'P1T3-N04',
    activeUnitId: 'P03-ku-04',
    lessonState: { phase: 'close' } as never,
    playbackCursor: { sceneId: 'forged', actionId: 'forged', actionIndex: 9 },
  }), {});
});

test('student progress merge updates only its matching row and preserves concurrent fields', () => {
  const merged = mergeSessionPatch(session, {
    studentProgress: {
      studentId: 'stu-01',
      evidenceReviewStatus: 'returned',
      teacherFeedback: 'Add a verifiable signal reading.',
      lastAction: 'Teacher returned P01-N02 evidence.',
    },
  });
  const selected = merged.studentRoster.find((student) => student.studentId === 'stu-01');

  assert.equal(selected?.mode, 'self');
  assert.equal(selected?.currentSlideIndex, 4);
  assert.equal(selected?.evidenceCount, 2);
  assert.equal(selected?.evidenceReviewStatus, 'returned');
  assert.equal(selected?.teacherFeedback, 'Add a verifiable signal reading.');
  assert.deepEqual(merged.studentProgress, selected);
  assert.deepEqual(merged.studentRoster.find((student) => student.studentId === 'stu-02'), studentTwo);
  assert.deepEqual(session.studentRoster, [studentOne, studentTwo]);
});
