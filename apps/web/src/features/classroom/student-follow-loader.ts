import type { AuthenticatedActor } from '../../platform/auth/actor.ts';
import {
  ClassroomSessionService,
} from '../../platform/classroom-session-service.ts';
import { ClassroomSessionRepository } from '../../platform/classroom-session-repository.ts';
import { ClassroomRosterRepository } from '../../platform/classroom-roster-repository.ts';
import {
  ClassroomParticipationRepository,
  type ClassroomParticipation,
} from '../../platform/classroom-participation-repository.ts';
import type { AppDatabase } from '../../platform/db/database.ts';
import {
  createLearningCommandService,
  describeLearningCommandError,
} from '../../platform/learning-command-service.ts';
import { SelfStudyCursorRepository } from '../../platform/self-study-cursor-repository.ts';
import { loadSelfStudyCatalog } from '../textbook-scene/self-study-content.ts';
import {
  createClassroomContentCatalog,
  type ClassroomContentCatalog,
  type SelfStudyReturnTarget,
} from './classroom-follow-model.ts';

export interface StudentFollowPageData {
  session: NonNullable<ReturnType<ClassroomSessionService['read']>>;
  sessionStatus: 'preparing' | 'active' | 'paused' | 'closed';
  participation: {
    participation: ClassroomParticipation | null;
    joinedCount: number;
    followingCount: number;
  };
  returnTarget: SelfStudyReturnTarget;
  contentCatalog: ClassroomContentCatalog;
}

export function loadStudentFollowPage(
  database: AppDatabase,
  actor: AuthenticatedActor,
  sessionId: string,
): StudentFollowPageData | undefined {
  const sessionRepository = new ClassroomSessionRepository(database);
  const stored = sessionRepository.readSession(sessionId);
  if (!stored) return undefined;

  const session = new ClassroomSessionService(
    sessionRepository,
    new ClassroomRosterRepository(database),
  ).read(actor, sessionId);
  if (!session) return undefined;

  const studentId = requireStudentId(actor);
  const participationRepository = new ClassroomParticipationRepository(database);
  const contentCatalog = createClassroomContentCatalog(loadSelfStudyCatalog());
  return {
    session,
    sessionStatus: stored.status,
    participation: {
      participation: participationRepository.read(sessionId, studentId) ?? null,
      joinedCount: participationRepository.readJoinedStudentIds(sessionId).length,
      followingCount: participationRepository.readFollowingStudentIds(sessionId).length,
    },
    returnTarget: activeReturnTarget(database, actor, contentCatalog),
    contentCatalog,
  };
}

function activeReturnTarget(
  database: AppDatabase,
  actor: AuthenticatedActor,
  catalog: ClassroomContentCatalog,
): SelfStudyReturnTarget {
  const studentId = requireStudentId(actor);
  const cursor = new SelfStudyCursorRepository(database).readActive(studentId);
  if (!cursor || !catalog[cursor.nodeId]) return { href: '/student/home' };
  try {
    createLearningCommandService(database).requireNodeAccess(actor, cursor.nodeId);
  } catch (error) {
    if (describeLearningCommandError(error)) return { href: '/student/home' };
    throw error;
  }
  return {
    href: `/learn/${cursor.nodeId}`,
    nodeId: cursor.nodeId,
  };
}

function requireStudentId(actor: AuthenticatedActor): string {
  if (actor.role !== 'student' || !actor.studentId || actor.studentId !== actor.userId) {
    throw new Error('Student classroom loader requires an authenticated student actor.');
  }
  return actor.studentId;
}
