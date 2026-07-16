import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { closeDatabase } from '../../../platform/db/database.ts';
import { migrateDatabase } from '../../../platform/db/migrations.ts';
import { seedDemo } from '../../../platform/db/demo-seed.ts';
import { createTestDatabase, type TestDatabase } from '../../../platform/db/test-database.ts';
import { AUTH_COOKIE_NAME } from '../../../platform/auth/cookie.ts';
import { GET as me } from './me/route.ts';
import { POST as login } from './login/route.ts';
import { POST as logout } from './logout/route.ts';

let fixture: TestDatabase;

before(() => {
  fixture = createTestDatabase();
  migrateDatabase(fixture.database);
  seedDemo(fixture.database);
  process.env.DGBOOK_SQLITE_PATH = fixture.databasePath;
});

beforeEach(() => {
  fixture.database.prepare('DELETE FROM auth_sessions').run();
});

after(() => {
  closeDatabase();
  delete process.env.DGBOOK_SQLITE_PATH;
  fixture.cleanup();
});

test('logs in the teacher and all three students with safe actor DTOs and role homes', async () => {
  const cases = [
    ['teacher01', 'teacher', '/teacher/workbench'],
    ['student01', 'student', '/student/home'],
    ['student02', 'student', '/student/home'],
    ['student03', 'student', '/student/home'],
  ] as const;

  for (const [username, role, home] of cases) {
    const response = await login(loginRequest('http://demo.test/api/auth/login', {
      username,
      password: '123456',
    }));
    assert.equal(response.status, 200, username);
    const payload = await response.json() as Record<string, unknown>;
    assert.equal(payload.home, home);
    assert.equal((payload.actor as { role: string }).role, role);
    assert.deepEqual(Object.keys(payload.actor as Record<string, unknown>).sort(), [
      'displayName', 'role', 'userId', 'username',
    ]);
    assert.equal(JSON.stringify(payload).match(/password|token|hash/i), null);
    const setCookie = response.headers.get('set-cookie') ?? '';
    assert.match(setCookie, new RegExp(`^${AUTH_COOKIE_NAME}=`));
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
    assert.match(setCookie, /Path=\//i);
    assert.doesNotMatch(setCookie, /;\s*Secure/i);
  }
});

test('returns one generic 401 for bad credentials and rejects client role authority', async () => {
  const responses = await Promise.all([
    login(loginRequest('http://demo.test/api/auth/login', { username: 'student01', password: 'bad' })),
    login(loginRequest('http://demo.test/api/auth/login', { username: 'missing', password: '123456' })),
    login(loginRequest('http://demo.test/api/auth/login', {
      username: 'student01',
      password: '123456',
      role: 'teacher',
    })),
  ]);
  assert.deepEqual(responses.map((response) => response.status), [401, 401, 401]);
  const bodies = await Promise.all(responses.map((response) => response.text()));
  assert.equal(new Set(bodies).size, 1);
});

test('rejects unsafe and cross-role next while preserving a safe same-role next', async () => {
  const unsafe = ['//evil.test', '/\\evil.test', 'https://evil.test', '/teacher/workbench'];
  for (const next of unsafe) {
    const response = await login(loginRequest('http://demo.test/api/auth/login', {
      username: 'student01', password: '123456', next,
    }));
    assert.equal((await response.json() as { home: string }).home, '/student/home', next);
  }
  const safe = await login(loginRequest('http://demo.test/api/auth/login', {
    username: 'student01', password: '123456', next: '/learn/P1T1-N02',
  }));
  assert.equal((await safe.json() as { home: string }).home, '/learn/P1T1-N02');
});

test('sets Secure on HTTPS, and me returns only the authenticated safe actor', async () => {
  const loginResponse = await login(loginRequest('https://demo.test/api/auth/login', {
    username: 'teacher01', password: '123456',
  }));
  const setCookie = loginResponse.headers.get('set-cookie') ?? '';
  assert.match(setCookie, /;\s*Secure/i);
  const cookie = setCookie.split(';', 1)[0] ?? '';

  const meResponse = await me(new Request('https://demo.test/api/auth/me', {
    headers: { cookie },
  }));
  assert.equal(meResponse.status, 200);
  const payload = await meResponse.json() as { actor: Record<string, unknown> };
  assert.deepEqual(Object.keys(payload.actor).sort(), [
    'displayName', 'role', 'userId', 'username',
  ]);
  assert.equal(JSON.stringify(payload).match(/password|token|hash/i), null);
});

test('logout revokes the database session and always clears the cookie', async () => {
  const loginResponse = await login(loginRequest('http://demo.test/api/auth/login', {
    username: 'student01', password: '123456',
  }));
  const cookie = (loginResponse.headers.get('set-cookie') ?? '').split(';', 1)[0] ?? '';
  const token = cookie.slice(cookie.indexOf('=') + 1);

  const logoutResponse = await logout(new Request('http://demo.test/api/auth/logout', {
    method: 'POST', headers: { cookie },
  }));
  assert.equal(logoutResponse.status, 200);
  assert.match(logoutResponse.headers.get('set-cookie') ?? '', /Max-Age=0/i);
  assert.equal(fixture.database.prepare(
    'SELECT revoked_at FROM auth_sessions WHERE token_hash = ?',
  ).pluck().get((await import('../../../platform/auth/session-repository.ts')).digestSessionToken(token)) === null, false);

  const afterLogout = await me(new Request('http://demo.test/api/auth/me', { headers: { cookie } }));
  assert.equal(afterLogout.status, 401);

  const anonymousLogout = await logout(new Request('http://demo.test/api/auth/logout', { method: 'POST' }));
  assert.equal(anonymousLogout.status, 200);
  assert.match(anonymousLogout.headers.get('set-cookie') ?? '', /Max-Age=0/i);
});

function loginRequest(url: string, body: Record<string, unknown>): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
