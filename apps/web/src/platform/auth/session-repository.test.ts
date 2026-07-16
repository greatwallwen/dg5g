import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateDatabase } from '../db/migrations.ts';
import { seedBase } from '../db/demo-seed.ts';
import { createTestDatabase } from '../db/test-database.ts';
import {
  SESSION_TOKEN_BYTES,
  SessionRepository,
  digestSessionToken,
} from './session-repository.ts';

test('creates a 256-bit token while persisting only its SHA-256 digest', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    const repository = new SessionRepository(fixture.database);
    const now = new Date('2026-07-15T00:00:00.000Z');
    const session = repository.createSession({
      userId: 'stu-01',
      now,
      expiresAt: new Date('2026-07-15T08:00:00.000Z'),
    });

    assert.equal(Buffer.from(session.token, 'base64url').byteLength, SESSION_TOKEN_BYTES);
    const stored = fixture.database.prepare(
      'SELECT token_hash, expires_at FROM auth_sessions WHERE id = ?',
    ).get(session.sessionId) as { token_hash: string; expires_at: string };
    assert.equal(stored.token_hash, digestSessionToken(session.token));
    assert.notEqual(stored.token_hash, session.token);
    assert.equal(JSON.stringify(stored).includes(session.token), false);
    assert.equal(repository.readSession(session.token, now)?.userId, 'stu-01');
  } finally {
    fixture.cleanup();
  }
});

test('cleans expired actor sessions atomically when creating a new session', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    const repository = new SessionRepository(fixture.database);
    const before = new Date('2026-07-14T00:00:00.000Z');
    repository.createSession({
      userId: 'stu-01',
      now: before,
      expiresAt: new Date('2026-07-14T01:00:00.000Z'),
    });
    repository.createSession({
      userId: 'stu-01',
      now: before,
      expiresAt: new Date('2026-07-16T00:00:00.000Z'),
    });

    repository.createSession({
      userId: 'stu-01',
      now: new Date('2026-07-15T00:00:00.000Z'),
      expiresAt: new Date('2026-07-15T08:00:00.000Z'),
    });

    const rows = fixture.database.prepare(
      'SELECT expires_at FROM auth_sessions WHERE user_id = ? ORDER BY expires_at',
    ).all('stu-01') as Array<{ expires_at: string }>;
    assert.deepEqual(rows.map((row) => row.expires_at), [
      '2026-07-15T08:00:00.000Z',
      '2026-07-16T00:00:00.000Z',
    ]);
  } finally {
    fixture.cleanup();
  }
});

test('expired and revoked sessions fail closed', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    const repository = new SessionRepository(fixture.database);
    const created = repository.createSession({
      userId: 'stu-01',
      now: new Date('2026-07-15T00:00:00.000Z'),
      expiresAt: new Date('2026-07-15T01:00:00.000Z'),
    });

    assert.equal(repository.readSession(created.token, new Date('2026-07-15T01:00:00.001Z')), null);
    repository.revokeSession(created.token, new Date('2026-07-15T00:30:00.000Z'));
    assert.equal(repository.readSession(created.token, new Date('2026-07-15T00:30:00.001Z')), null);
    assert.equal(repository.readSession('not-a-session-token', new Date()), null);
  } finally {
    fixture.cleanup();
  }
});
