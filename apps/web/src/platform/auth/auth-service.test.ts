import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateDatabase } from '../db/migrations.ts';
import { seedDemo } from '../db/demo-seed.ts';
import { createTestDatabase } from '../db/test-database.ts';
import { AuthService } from './auth-service.ts';

test('authenticates the teacher and all three students from authoritative database membership', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const service = new AuthService(fixture.database, {
      now: () => new Date('2026-07-15T00:00:00.000Z'),
    });

    const expected = [
      ['teacher01', 'teacher-01', 'teacher', undefined],
      ['student01', 'stu-01', 'student', 'stu-01'],
      ['student02', 'stu-02', 'student', 'stu-02'],
      ['student03', 'stu-03', 'student', 'stu-03'],
    ] as const;
    for (const [username, userId, role, studentId] of expected) {
      const result = service.login({ username, password: '123456' });
      assert.ok(result, username);
      assert.deepEqual(result.actor, {
        userId,
        username,
        displayName: role === 'teacher' ? '张老师' : `学生${['一', '二', '三'][Number(userId.slice(-1)) - 1]}`,
        role,
        classId: 'demo-class',
        ...(studentId ? { studentId } : {}),
      });
    }
  } finally {
    fixture.cleanup();
  }
});

test('uses one generic login failure for wrong, unknown, disabled, and oversized credentials', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    fixture.database.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run('stu-03');
    const service = new AuthService(fixture.database);

    assert.equal(service.login({ username: 'student01', password: 'wrong-password' }), null);
    assert.equal(service.login({ username: 'missing-user', password: '123456' }), null);
    assert.equal(service.login({ username: 'student03', password: '123456' }), null);
    assert.equal(service.login({ username: 'x'.repeat(200), password: '123456' }), null);
    assert.equal(service.login({ username: 'student01', password: 'x'.repeat(2_000) }), null);
  } finally {
    fixture.cleanup();
  }
});

test('readActor fails closed after expiry, revocation, or account deactivation', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    let now = new Date('2026-07-15T00:00:00.000Z');
    const service = new AuthService(fixture.database, {
      now: () => now,
      sessionTtlSeconds: 60,
    });

    const expiring = service.login({ username: 'student01', password: '123456' });
    assert.ok(expiring);
    now = new Date('2026-07-15T00:01:00.001Z');
    assert.equal(service.readActor(expiring.token), null);

    now = new Date('2026-07-15T01:00:00.000Z');
    const revoked = service.login({ username: 'student01', password: '123456' });
    assert.ok(revoked);
    service.logout(revoked.token);
    assert.equal(service.readActor(revoked.token), null);

    const inactive = service.login({ username: 'student02', password: '123456' });
    assert.ok(inactive);
    fixture.database.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run('stu-02');
    assert.equal(service.readActor(inactive.token), null);
  } finally {
    fixture.cleanup();
  }
});

test('fails closed when database role has no matching class membership', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    fixture.database.prepare(
      'DELETE FROM classroom_members WHERE student_id = ?',
    ).run('stu-01');
    const service = new AuthService(fixture.database);
    assert.equal(service.login({ username: 'student01', password: '123456' }), null);
  } finally {
    fixture.cleanup();
  }
});
