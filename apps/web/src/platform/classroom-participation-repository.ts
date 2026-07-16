import type { AppDatabase } from './db/database.ts';
import { SnapshotClock } from './snapshot-clock.ts';

export type ClassroomParticipationMode = 'follow' | 'self';
export type ClassroomParticipationState = 'joined' | 'left';

export interface ClassroomParticipation {
  sessionId: string;
  studentId: string;
  state: ClassroomParticipationState;
  mode: ClassroomParticipationMode;
  joinedAt?: string;
  leftAt?: string;
  updatedAt: string;
}

export class ClassroomParticipationSessionNotFoundError extends Error {
  override readonly name = 'ClassroomParticipationSessionNotFoundError';
}

export class ClassroomParticipationSessionInactiveError extends Error {
  override readonly name = 'ClassroomParticipationSessionInactiveError';
}

export class ClassroomParticipationStudentNotMemberError extends Error {
  override readonly name = 'ClassroomParticipationStudentNotMemberError';
}

export class ClassroomParticipationNotJoinedError extends Error {
  override readonly name = 'ClassroomParticipationNotJoinedError';
}

interface ParticipationRow {
  sessionId: string;
  studentId: string;
  state: ClassroomParticipationState;
  mode: ClassroomParticipationMode;
  joinedAt: string | null;
  leftAt: string | null;
  updatedAt: string;
}

interface SessionRow {
  status: 'preparing' | 'active' | 'paused' | 'closed';
}

export class ClassroomParticipationRepository {
  private readonly clock: SnapshotClock;

  constructor(private readonly database: AppDatabase) {
    this.clock = new SnapshotClock(database);
  }

  read(sessionId: string, studentId: string): ClassroomParticipation | undefined {
    assertNonEmpty('sessionId', sessionId);
    assertNonEmpty('studentId', studentId);
    this.requireSession(sessionId);
    const row = this.readRow(sessionId, studentId);
    return row ? participationFromRow(row) : undefined;
  }

  readJoinedStudentIds(sessionId: string): string[] {
    assertNonEmpty('sessionId', sessionId);
    this.requireSession(sessionId);
    return this.database.prepare(`
      SELECT student_id
      FROM classroom_participation
      WHERE session_id = ? AND state = 'joined'
      ORDER BY student_id
    `).pluck().all(sessionId) as string[];
  }

  readFollowingStudentIds(sessionId: string): string[] {
    assertNonEmpty('sessionId', sessionId);
    this.requireSession(sessionId);
    return this.database.prepare(`
      SELECT student_id
      FROM classroom_participation
      WHERE session_id = ? AND state = 'joined' AND mode = 'follow'
      ORDER BY student_id
    `).pluck().all(sessionId) as string[];
  }

  join(sessionId: string, studentId: string, now = new Date()): ClassroomParticipation {
    assertNonEmpty('sessionId', sessionId);
    assertNonEmpty('studentId', studentId);
    const timestamp = normalizeNow(now);
    return this.database.transaction(() => {
      const session = this.requireSession(sessionId);
      if (session.status !== 'active') {
        throw new ClassroomParticipationSessionInactiveError(`Classroom session is not active: ${sessionId}.`);
      }
      this.requireMember(sessionId, studentId);
      const existing = this.readRow(sessionId, studentId);
      if (existing?.state === 'joined') return participationFromRow(existing);
      this.database.prepare(`
        INSERT INTO classroom_participation (
          session_id, student_id, state, mode, joined_at, left_at, updated_at
        ) VALUES (?, ?, 'joined', 'follow', ?, NULL, ?)
        ON CONFLICT(session_id, student_id) DO UPDATE SET
          state = 'joined',
          mode = 'follow',
          joined_at = excluded.joined_at,
          left_at = NULL,
          updated_at = excluded.updated_at
      `).run(sessionId, studentId, timestamp, timestamp);
      this.clock.advance([`classroom:${sessionId}`], timestamp);
      return this.requiredRead(sessionId, studentId);
    }).immediate();
  }

  setMode(
    sessionId: string,
    studentId: string,
    mode: ClassroomParticipationMode,
    now = new Date(),
  ): ClassroomParticipation {
    assertNonEmpty('sessionId', sessionId);
    assertNonEmpty('studentId', studentId);
    if (mode !== 'follow' && mode !== 'self') throw new TypeError(`Unsupported participation mode: ${String(mode)}.`);
    const timestamp = normalizeNow(now);
    return this.database.transaction(() => {
      this.requireSession(sessionId);
      this.requireMember(sessionId, studentId);
      const existing = this.readRow(sessionId, studentId);
      if (!existing || existing.state !== 'joined') {
        throw new ClassroomParticipationNotJoinedError(`Student has not joined classroom session: ${studentId}.`);
      }
      if (existing.mode === mode) return participationFromRow(existing);
      this.database.prepare(`
        UPDATE classroom_participation
        SET mode = ?, updated_at = ?
        WHERE session_id = ? AND student_id = ?
      `).run(mode, timestamp, sessionId, studentId);
      this.clock.advance([`classroom:${sessionId}`], timestamp);
      return this.requiredRead(sessionId, studentId);
    }).immediate();
  }

  leave(sessionId: string, studentId: string, now = new Date()): ClassroomParticipation {
    assertNonEmpty('sessionId', sessionId);
    assertNonEmpty('studentId', studentId);
    const timestamp = normalizeNow(now);
    return this.database.transaction(() => {
      this.requireSession(sessionId);
      this.requireMember(sessionId, studentId);
      const existing = this.readRow(sessionId, studentId);
      if (!existing) {
        throw new ClassroomParticipationNotJoinedError(`Student has not joined classroom session: ${studentId}.`);
      }
      if (existing.state === 'left') return participationFromRow(existing);
      this.database.prepare(`
        UPDATE classroom_participation
        SET state = 'left', left_at = ?, updated_at = ?
        WHERE session_id = ? AND student_id = ?
      `).run(timestamp, timestamp, sessionId, studentId);
      this.clock.advance([`classroom:${sessionId}`], timestamp);
      return this.requiredRead(sessionId, studentId);
    }).immediate();
  }

  private requireSession(sessionId: string): SessionRow {
    const session = this.database.prepare(`
      SELECT status FROM classroom_sessions WHERE session_id = ?
    `).get(sessionId) as SessionRow | undefined;
    if (!session) throw new ClassroomParticipationSessionNotFoundError(`Unknown classroom session: ${sessionId}.`);
    return session;
  }

  private requireMember(sessionId: string, studentId: string): void {
    const member = this.database.prepare(`
      SELECT 1
      FROM classroom_members AS member
      INNER JOIN users AS student ON student.id = member.student_id
      WHERE member.session_id = ? AND member.student_id = ?
        AND student.role = 'student' AND student.is_active = 1
    `).pluck().get(sessionId, studentId);
    if (member !== 1) {
      throw new ClassroomParticipationStudentNotMemberError(
        `Student is not an active member of classroom session: ${studentId}.`,
      );
    }
  }

  private readRow(sessionId: string, studentId: string): ParticipationRow | undefined {
    return this.database.prepare(`
      SELECT
        session_id AS sessionId,
        student_id AS studentId,
        state,
        mode,
        joined_at AS joinedAt,
        left_at AS leftAt,
        updated_at AS updatedAt
      FROM classroom_participation
      WHERE session_id = ? AND student_id = ?
    `).get(sessionId, studentId) as ParticipationRow | undefined;
  }

  private requiredRead(sessionId: string, studentId: string): ClassroomParticipation {
    const row = this.readRow(sessionId, studentId);
    if (!row) throw new Error(`Participation mutation did not persist: ${sessionId}/${studentId}.`);
    return participationFromRow(row);
  }

}

function participationFromRow(row: ParticipationRow): ClassroomParticipation {
  return {
    sessionId: row.sessionId,
    studentId: row.studentId,
    state: row.state,
    mode: row.mode,
    ...(row.joinedAt === null ? {} : { joinedAt: row.joinedAt }),
    ...(row.leftAt === null ? {} : { leftAt: row.leftAt }),
    updatedAt: row.updatedAt,
  };
}

function normalizeNow(now: Date): string {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError('now must be a valid Date.');
  return now.toISOString();
}

function assertNonEmpty(field: string, value: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-empty string.`);
  }
}
