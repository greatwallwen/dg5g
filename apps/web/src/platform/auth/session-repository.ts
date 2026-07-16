import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { AppDatabase } from '../db/database.ts';
import type { AuthenticatedRole, AuthenticatedUserRow } from './actor.ts';

export const SESSION_TOKEN_BYTES = 32;

export interface CreatedSession {
  sessionId: string;
  token: string;
  expiresAt: Date;
}

export interface SessionUser extends AuthenticatedUserRow {
  sessionId: string;
}

export class SessionRepository {
  private readonly database: AppDatabase;

  constructor(database: AppDatabase) {
    this.database = database;
  }

  createSession(input: { userId: string; now: Date; expiresAt: Date }): CreatedSession {
    if (!isValidDate(input.now) || !isValidDate(input.expiresAt) || input.expiresAt <= input.now) {
      throw new TypeError('Session expiry must be after creation.');
    }

    const sessionId = randomUUID();
    const token = randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
    const tokenHash = digestSessionToken(token);
    this.database.transaction(() => {
      this.database.prepare(`
        DELETE FROM auth_sessions
        WHERE user_id = ? AND julianday(expires_at) <= julianday(?)
      `).run(input.userId, input.now.toISOString());
      this.database.prepare(`
        INSERT INTO auth_sessions (
          id, user_id, token_hash, expires_at, created_at
        ) VALUES (?, ?, ?, ?, ?)
      `).run(
        sessionId,
        input.userId,
        tokenHash,
        input.expiresAt.toISOString(),
        input.now.toISOString(),
      );
    })();
    return { sessionId, token, expiresAt: input.expiresAt };
  }

  readSession(token: string, now: Date): SessionUser | null {
    if (!isCanonicalSessionToken(token) || !isValidDate(now)) return null;
    const row = this.database.prepare(`
      SELECT
        auth_sessions.id AS sessionId,
        auth_sessions.expires_at AS expiresAt,
        users.id AS userId,
        users.username AS username,
        users.display_name AS displayName,
        users.role AS role,
        users.is_active AS isActive
      FROM auth_sessions
      INNER JOIN users ON users.id = auth_sessions.user_id
      WHERE auth_sessions.token_hash = ?
        AND auth_sessions.revoked_at IS NULL
      LIMIT 1
    `).get(digestSessionToken(token)) as {
      sessionId: string;
      expiresAt: string;
      userId: string;
      username: string;
      displayName: string;
      role: AuthenticatedRole;
      isActive: number;
    } | undefined;
    if (!row || !Number.isFinite(Date.parse(row.expiresAt)) || Date.parse(row.expiresAt) <= now.getTime()) {
      return null;
    }
    if ((row.role !== 'student' && row.role !== 'teacher') || row.isActive !== 1) return null;
    return {
      sessionId: row.sessionId,
      userId: row.userId,
      username: row.username,
      displayName: row.displayName,
      role: row.role,
      isActive: true,
    };
  }

  revokeSession(token: string, now: Date): boolean {
    if (!isCanonicalSessionToken(token) || !isValidDate(now)) return false;
    const result = this.database.prepare(`
      UPDATE auth_sessions
      SET revoked_at = ?
      WHERE token_hash = ? AND revoked_at IS NULL
    `).run(now.toISOString(), digestSessionToken(token));
    return result.changes > 0;
  }
}

export function digestSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function isCanonicalSessionToken(token: string): boolean {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const decoded = Buffer.from(token, 'base64url');
  return decoded.byteLength === SESSION_TOKEN_BYTES && decoded.toString('base64url') === token;
}

function isValidDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
}
