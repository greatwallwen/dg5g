import type { AppDatabase } from '../db/database.ts';
import { getDatabase } from '../db/database.ts';
import { verifyPassword } from './password.ts';
import {
  resolveActorForUser,
  type AuthenticatedActor,
  type AuthenticatedRole,
  type AuthenticatedUserRow,
} from './actor.ts';
import { SessionRepository } from './session-repository.ts';

export const DEFAULT_SESSION_TTL_SECONDS = 8 * 60 * 60;
const MIN_SESSION_TTL_SECONDS = 60;
const MAX_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_USERNAME_LENGTH = 64;
const MAX_PASSWORD_LENGTH = 512;
const MAX_PASSWORD_BYTES = 1_024;

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface LoginSuccess {
  actor: AuthenticatedActor;
  token: string;
  expiresAt: Date;
}

export interface AuthServiceOptions {
  now?: () => Date;
  sessionTtlSeconds?: number;
}

export class AuthService {
  private readonly database: AppDatabase;
  private readonly repository: SessionRepository;
  private readonly now: () => Date;
  readonly sessionTtlSeconds: number;

  constructor(
    database: AppDatabase,
    options: AuthServiceOptions = {},
  ) {
    this.database = database;
    this.repository = new SessionRepository(database);
    this.now = options.now ?? (() => new Date());
    this.sessionTtlSeconds = boundedSessionTtl(options.sessionTtlSeconds);
  }

  login(credentials: LoginCredentials): LoginSuccess | null {
    const normalized = normalizeCredentials(credentials);
    if (!normalized) return null;
    const row = this.database.prepare(`
      SELECT
        id AS userId,
        username,
        display_name AS displayName,
        role,
        password_hash AS passwordHash,
        is_active AS isActive
      FROM users
      WHERE username = ? COLLATE NOCASE
      LIMIT 1
    `).get(normalized.username) as {
      userId: string;
      username: string;
      displayName: string;
      role: AuthenticatedRole;
      passwordHash: string;
      isActive: number;
    } | undefined;
    if (!row || row.isActive !== 1 || (row.role !== 'student' && row.role !== 'teacher')) return null;
    if (!verifyPassword(normalized.password, row.passwordHash)) return null;

    const user: AuthenticatedUserRow = {
      userId: row.userId,
      username: row.username,
      displayName: row.displayName,
      role: row.role,
      isActive: true,
    };
    const actor = resolveActorForUser(this.database, user);
    if (!actor) return null;

    const now = this.now();
    const expiresAt = new Date(now.getTime() + this.sessionTtlSeconds * 1_000);
    const session = this.repository.createSession({ userId: actor.userId, now, expiresAt });
    return { actor, token: session.token, expiresAt };
  }

  readActor(token: string | null | undefined): AuthenticatedActor | null {
    if (!token) return null;
    const session = this.repository.readSession(token, this.now());
    return session ? resolveActorForUser(this.database, session) : null;
  }

  logout(token: string | null | undefined): boolean {
    return token ? this.repository.revokeSession(token, this.now()) : false;
  }
}

export function getAuthService(): AuthService {
  return new AuthService(getDatabase());
}

function normalizeCredentials(credentials: LoginCredentials): LoginCredentials | null {
  if (!credentials || typeof credentials.username !== 'string' || typeof credentials.password !== 'string') {
    return null;
  }
  const username = credentials.username.trim();
  if (!username || username.length > MAX_USERNAME_LENGTH) return null;
  if (!credentials.password || credentials.password.length > MAX_PASSWORD_LENGTH) return null;
  if (Buffer.byteLength(credentials.password, 'utf8') > MAX_PASSWORD_BYTES) return null;
  return { username, password: credentials.password };
}

function boundedSessionTtl(value?: number): number {
  if (value === undefined) return DEFAULT_SESSION_TTL_SECONDS;
  if (!Number.isInteger(value) || value < MIN_SESSION_TTL_SECONDS || value > MAX_SESSION_TTL_SECONDS) {
    throw new RangeError('Session TTL is outside the permitted range.');
  }
  return value;
}
