import type { AuthenticatedActor } from './auth/actor.ts';
import {
  ClassroomSessionService,
} from './classroom-session-service.ts';
import { ClassroomSessionRepository } from './classroom-session-repository.ts';
import { ClassroomRosterRepository } from './classroom-roster-repository.ts';
import type { SessionPatch, SessionRole } from './class-session-protocol.ts';
import type { ClassroomLessonIntent } from './classroom-state.ts';
import { getDatabase } from './db/database.ts';
import { ClassSessionAccessError } from './fixtures/index.ts';
import type { ClassSession, StudentProgress } from './models.ts';

export function getClassSession(sessionId: string): ClassSession {
  const { repository, service } = dependencies();
  const stored = repository.readSession(sessionId);
  if (!stored) throw new ClassSessionAccessError(sessionId);
  return service.materialize(stored);
}

export function patchClassSession(
  sessionId: string,
  role: SessionRole,
  patch: SessionPatch,
  expectedRevision: number,
): ClassSession {
  if (role !== 'teacher') throw new Error('Only teachers can patch shared classroom state.');
  const { repository, service } = dependencies();
  const stored = repository.readSession(sessionId);
  if (!stored) throw new ClassSessionAccessError(sessionId);
  return service.patchTeacherState(
    teacherActor(stored.teacherId, stored.classId),
    sessionId,
    patch,
    expectedRevision,
  );
}

type StudentClassroomProgressUpdate = Partial<Pick<
  StudentProgress,
  'mode' | 'currentSlideIndex' | 'selfStudyState' | 'submissionState' | 'evidenceCount' | 'lastAction'
>>;

export function patchStudentClassroomProgress(
  sessionId: string,
  studentId: string,
  update: StudentClassroomProgressUpdate,
): ClassSession {
  const current = getClassSession(sessionId);
  const currentStudent = current.studentRoster.find((student) => student.studentId === studentId);
  if (!currentStudent) throw new Error('Student is not part of this class session');
  const nextStudent = { ...currentStudent, ...update, studentId };
  return {
    ...current,
    studentRoster: current.studentRoster.map((student) => (
      student.studentId === studentId ? nextStudent : student
    )),
    studentProgress: nextStudent,
    lastUpdatedAt: new Date().toISOString(),
  };
}

export function applyClassroomIntent(
  sessionId: string,
  intent: ClassroomLessonIntent,
  expectedRevision: number,
  now = new Date(),
) {
  const { repository, service } = dependencies();
  const stored = repository.readSession(sessionId);
  if (!stored) throw new ClassSessionAccessError(sessionId);
  return service.applyTeacherIntent(
    teacherActor(stored.teacherId, stored.classId),
    sessionId,
    intent,
    expectedRevision,
    now,
  );
}

function dependencies(): {
  repository: ClassroomSessionRepository;
  service: ClassroomSessionService;
} {
  const database = getDatabase();
  const repository = new ClassroomSessionRepository(database);
  return {
    repository,
    service: new ClassroomSessionService(
      repository,
      new ClassroomRosterRepository(database),
    ),
  };
}

function teacherActor(teacherId: string, classId: string): AuthenticatedActor {
  return {
    userId: teacherId,
    username: teacherId,
    displayName: teacherId,
    role: 'teacher',
    classId,
  };
}
