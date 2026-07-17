import { getClassSession } from './class-session-store.ts';
import { ClassroomParticipationRepository } from './classroom-participation-repository.ts';
import { getDatabase, type AppDatabase } from './db/database.ts';
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
  if (action.type === 'activity_submitted') {
    throw new TypeError(
      'Legacy activity_submitted is retired; submit through the authenticated activity attempts API.',
    );
  }

  const participation = new ClassroomParticipationRepository(database);
  participation.setMode(sessionId, studentId, action.mode);
  return getClassSession(sessionId);
}
