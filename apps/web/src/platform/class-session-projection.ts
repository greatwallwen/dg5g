import type { ClassSession } from './models.ts';
import type { SessionRole } from './class-session-protocol.ts';

export type ProjectorClassSession = Pick<
  ClassSession,
  | 'sessionId'
  | 'sessionStatus'
  | 'activeLessonRunId'
  | 'lessonRunStatus'
  | 'teachingCursor'
  | 'currentPageId'
  | 'currentSlideId'
  | 'teacherSlideId'
  | 'teacherSlideIndex'
  | 'sceneMode'
  | 'activeTaskId'
  | 'activeNodeId'
  | 'activeUnitId'
  | 'lessonState'
  | 'studentMode'
  | 'studentSyncState'
  | 'syncRequestId'
  | 'playbackCursor'
  | 'lastUpdatedAt'
  | 'activityState'
  | 'reviewState'
>;

export function projectClassSession(session: ClassSession, role: 'projector'): ProjectorClassSession;
export function projectClassSession(session: ClassSession, role: 'student', studentId: string): ClassSession;
export function projectClassSession(session: ClassSession, role: 'teacher'): ClassSession;
export function projectClassSession(
  session: ClassSession,
  role: SessionRole,
  studentId?: string,
): ClassSession | ProjectorClassSession;
export function projectClassSession(
  session: ClassSession,
  role: SessionRole,
  studentId?: string,
): ClassSession | ProjectorClassSession {
  if (role === 'student') return projectStudentClassSession(session, studentId);
  if (role === 'projector') return projectProjectorClassSession(session);
  return session;
}

function projectStudentClassSession(session: ClassSession, studentId?: string): ClassSession {
  if (!studentId) throw new Error('Student projection requires an authenticated student ID');
  const studentProgress = session.studentRoster.find((item) => item.studentId === studentId)
    ?? (session.studentProgress?.studentId === studentId ? session.studentProgress : undefined);
  if (!studentProgress) throw new Error('Student is not part of this class session');

  return {
    ...session,
    studentProgress,
    studentRoster: [],
    devicePresence: session.devicePresence?.filter((device) => device.studentId === studentId) ?? [],
    commandAcks: session.commandAcks?.filter((ack) => ack.studentId === studentId) ?? [],
    submissionState: studentProgress.submissionState,
    selfStudyState: studentProgress.selfStudyState,
    submissionAnswers: undefined,
    selfStudyAnswers: undefined,
    formalTest: session.formalTest ? {
      ...session.formalTest,
      participants: session.formalTest.participants.filter((participant) => participant.studentId === studentId),
    } : undefined,
  };
}

function projectProjectorClassSession(session: ClassSession): ProjectorClassSession {
  return {
    sessionId: session.sessionId,
    sessionStatus: session.sessionStatus,
    activeLessonRunId: session.activeLessonRunId,
    lessonRunStatus: session.lessonRunStatus,
    teachingCursor: session.teachingCursor,
    currentPageId: session.currentPageId,
    currentSlideId: session.currentSlideId,
    teacherSlideId: session.teacherSlideId,
    teacherSlideIndex: session.teacherSlideIndex,
    sceneMode: session.sceneMode,
    activeTaskId: session.activeTaskId,
    activeNodeId: session.activeNodeId,
    activeUnitId: session.activeUnitId,
    lessonState: session.lessonState,
    studentMode: session.studentMode,
    studentSyncState: session.studentSyncState,
    syncRequestId: session.syncRequestId,
    playbackCursor: session.playbackCursor,
    lastUpdatedAt: session.lastUpdatedAt,
    activityState: session.activityState,
    reviewState: session.reviewState,
  };
}
