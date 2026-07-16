import type { AppDatabase } from '../db/database.ts';

export type AuthenticatedRole = 'student' | 'teacher';

export interface AuthenticatedActor {
  userId: string;
  username: string;
  displayName: string;
  role: AuthenticatedRole;
  classId: string;
  studentId?: string;
}

export type PublicActor = Pick<
  AuthenticatedActor,
  'userId' | 'username' | 'displayName' | 'role'
>;

export interface AuthenticatedUserRow {
  userId: string;
  username: string;
  displayName: string;
  role: AuthenticatedRole;
  isActive: boolean;
}

export function resolveActorForUser(
  database: AppDatabase,
  user: AuthenticatedUserRow,
): AuthenticatedActor | null {
  if (!user.isActive) return null;

  const memberships = user.role === 'teacher'
    ? database.prepare(`
        SELECT DISTINCT class_id AS classId
        FROM classroom_sessions
        WHERE teacher_id = ?
        ORDER BY class_id
      `).all(user.userId) as Array<{ classId: string }>
    : database.prepare(`
        SELECT DISTINCT classroom_sessions.class_id AS classId
        FROM classroom_members
        INNER JOIN classroom_sessions
          ON classroom_sessions.session_id = classroom_members.session_id
        WHERE classroom_members.student_id = ?
        ORDER BY classroom_sessions.class_id
      `).all(user.userId) as Array<{ classId: string }>;

  if (memberships.length !== 1 || !memberships[0]?.classId) return null;
  return {
    userId: user.userId,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    classId: memberships[0].classId,
    ...(user.role === 'student' ? { studentId: user.userId } : {}),
  };
}

export function toPublicActor(actor: AuthenticatedActor): PublicActor {
  return {
    userId: actor.userId,
    username: actor.username,
    displayName: actor.displayName,
    role: actor.role,
  };
}
