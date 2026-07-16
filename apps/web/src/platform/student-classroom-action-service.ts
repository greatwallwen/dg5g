import { randomUUID } from 'node:crypto';
import { getClassSession } from './class-session-store.ts';
import { ClassroomParticipationRepository } from './classroom-participation-repository.ts';
import { getDatabase, type AppDatabase } from './db/database.ts';
import { LearningRepository } from './learning-repository.ts';
import type { ClassSession } from './models.ts';
import type { StudentClassroomAction } from './student-classroom-action.ts';

/**
 * Compatibility bridge for the legacy generic classroom PATCH endpoint.
 * It returns a freshly materialized SQLite projection and never overlays
 * request-only progress onto the response.
 */
export function applyStudentClassroomAction(
  sessionId: string,
  studentId: string,
  action: StudentClassroomAction,
  database: AppDatabase = getDatabase(),
): ClassSession {
  const session = getClassSession(sessionId);
  if (action.type === 'refresh') return session;

  const participation = new ClassroomParticipationRepository(database);
  if (action.type === 'navigation_changed') {
    participation.setMode(sessionId, studentId, action.mode);
    return getClassSession(sessionId);
  }

  const answers = action.answers.map((answer) => answer.trim());
  participation.setMode(sessionId, studentId, action.mode);
  const learning = new LearningRepository(database);
  const topic = `learning:${studentId}` as const;
  learning.appendEvent({
    eventId: `classroom-${randomUUID()}`,
    studentId,
    nodeId: session.activeNodeId ?? 'P1T1-N02',
    channel: 'classroom',
    eventType: 'classroom_activity_submitted',
    payload: { sessionId: session.sessionId, answers, completed: true },
  }, learning.readTopicVersion(topic));
  return getClassSession(sessionId);
}
