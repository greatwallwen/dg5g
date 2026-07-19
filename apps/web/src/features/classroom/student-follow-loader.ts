import type { AuthenticatedActor } from '../../platform/auth/actor.ts';
import { ClassroomSessionRepository } from '../../platform/classroom-session-repository.ts';
import type { AppDatabase } from '../../platform/db/database.ts';
import {
  AuthoritativeSnapshotReader,
  type StudentAuthoritativeSnapshot,
} from '../../platform/authoritative-snapshot.ts';
import {
  createLearningCommandService,
  describeLearningCommandError,
} from '../../platform/learning-command-service.ts';
import { SelfStudyCursorRepository } from '../../platform/self-study-cursor-repository.ts';
import { p1Activities } from '../learning-activities/activity-catalog.ts';
import {
  createClassroomActivityCatalog,
  type ClassroomActivityCatalog,
  type SelfStudyReturnTarget,
} from './classroom-follow-model.ts';

export interface StudentFollowPageData {
  initialSnapshot: StudentAuthoritativeSnapshot;
  returnTarget: SelfStudyReturnTarget;
  activityCatalog: ClassroomActivityCatalog;
}

export function loadStudentFollowPage(
  database: AppDatabase,
  actor: AuthenticatedActor,
  sessionId: string,
): StudentFollowPageData | undefined {
  if (!new ClassroomSessionRepository(database).readSession(sessionId)) return undefined;

  requireStudentId(actor);
  const initialSnapshot = new AuthoritativeSnapshotReader(database).read(
    actor,
    'student',
    { sessionId },
  );
  return {
    initialSnapshot,
    returnTarget: activeReturnTarget(database, actor),
    activityCatalog: createClassroomActivityCatalog(p1Activities.map(({ activity }) => activity)),
  };
}

function activeReturnTarget(
  database: AppDatabase,
  actor: AuthenticatedActor,
): SelfStudyReturnTarget {
  const cursor = new SelfStudyCursorRepository(database).readActive(requireStudentId(actor));
  if (!cursor) return { href: '/student/home' };
  try {
    createLearningCommandService(database).requireNodeAccess(actor, cursor.nodeId);
  } catch (error) {
    if (describeLearningCommandError(error)) return { href: '/student/home' };
    throw error;
  }
  return { href: `/learn/${cursor.nodeId}`, nodeId: cursor.nodeId };
}

function requireStudentId(actor: AuthenticatedActor): string {
  if (actor.role !== 'student' || !actor.studentId || actor.studentId !== actor.userId) {
    throw new Error('Student classroom loader requires an authenticated student actor.');
  }
  return actor.studentId;
}
