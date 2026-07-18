import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test, { after } from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'next/server') return nextResolve('next/server.js', context);
    if (specifier === 'next/headers') return nextResolve('next/headers.js', context);
    if (specifier.startsWith('@/')) {
      const sourcePath = resolve(process.cwd(), 'apps/web/src', specifier.slice(2));
      const candidate = [`${sourcePath}.ts`, `${sourcePath}.tsx`, resolve(sourcePath, 'index.ts')].find(existsSync);
      if (candidate) return nextResolve(pathToFileURL(candidate).href, context);
    }
    if (specifier.startsWith('.') && context.parentURL?.includes('/apps/web/src/')
      && !specifier.endsWith('.ts') && !specifier.endsWith('.tsx')) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const { createTestDatabase } = await import('./db/test-database.ts');
const { migrateDatabase } = await import('./db/migrations.ts');
const { seedDemo } = await import('./db/demo-seed.ts');
const { closeDatabase } = await import('./db/database.ts');
const { AuthService } = await import('./auth/auth-service.ts');
const { AUTH_COOKIE_NAME } = await import('./auth/cookie.ts');
const presenceRoute = await import('../app/api/class-sessions/[sessionId]/presence/route.ts');

const fixture = createTestDatabase();
migrateDatabase(fixture.database);
seedDemo(fixture.database);
process.env.DGBOOK_SQLITE_PATH = fixture.databasePath;
const auth = new AuthService(fixture.database);
const teacherCookie = loginCookie('teacher01');
const studentCookie = loginCookie('student01');

after(() => {
  closeDatabase();
  delete process.env.DGBOOK_SQLITE_PATH;
  fixture.cleanup();
});

test('cookie actors create distinct browser presence for teacher projector and member student', async () => {
  const cases = [
    { deviceId: 'browser-teacher-tab', actorRole: 'teacher', cookie: teacherCookie, query: '' },
    { deviceId: 'browser-projector-tab', actorRole: 'projector', cookie: teacherCookie, query: '?view=projector' },
    { deviceId: 'browser-student-tab', actorRole: 'student', cookie: studentCookie, query: '' },
  ] as const;

  for (const item of cases) {
    const response = await presenceRoute.POST(request(item.query, item.cookie, {
      deviceId: item.deviceId,
      visibilityState: 'visible',
      pageState: 'ready',
      lastSeenClassroomRevision: 0,
    }), { params: { sessionId: 'demo-class' } });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(body.presence.actorRole, item.actorRole);
    assert.equal(body.presence.clientKind, 'browser');
    assert.equal(body.presence.visibilityState, 'visible');
    assert.equal(body.presence.syncHealth, 'online');
  }
});

test('presence route rejects spoofing collisions and future revisions with zero writes', async () => {
  const count = () => Number(fixture.database.prepare(`
    SELECT COUNT(*) FROM device_presence WHERE session_id = 'demo-class'
  `).pluck().get());
  const topic = () => Number(fixture.database.prepare(`
    SELECT version FROM snapshot_versions WHERE topic = 'classroom:demo-class'
  `).pluck().get() ?? 0);
  const invalidBody = await presenceRoute.POST(request('', studentCookie, {
    deviceId: 'browser-forged-role',
    visibilityState: 'visible',
    pageState: 'ready',
    lastSeenClassroomRevision: 0,
    role: 'teacher',
  }), { params: { sessionId: 'demo-class' } });
  assert.equal(invalidBody.status, 400);

  const projectorSpoof = await presenceRoute.POST(request('?view=projector', studentCookie, {
    deviceId: 'browser-student-projector-spoof',
    visibilityState: 'visible',
    pageState: 'ready',
    lastSeenClassroomRevision: 0,
  }), { params: { sessionId: 'demo-class' } });
  assert.equal(projectorSpoof.status, 403);

  const first = await presenceRoute.POST(request('', teacherCookie, {
    deviceId: 'browser-collision',
    visibilityState: 'visible',
    pageState: 'ready',
    lastSeenClassroomRevision: 0,
  }), { params: { sessionId: 'demo-class' } });
  assert.equal(first.status, 200);
  const countBefore = count();
  const topicBefore = topic();
  const revisionBefore = fixture.database.prepare(`
    SELECT revision FROM classroom_sessions WHERE session_id = 'demo-class'
  `).pluck().get();

  const collision = await presenceRoute.POST(request('', studentCookie, {
    deviceId: 'browser-collision',
    visibilityState: 'hidden',
    pageState: 'hidden',
    lastSeenClassroomRevision: 0,
  }), { params: { sessionId: 'demo-class' } });
  const future = await presenceRoute.POST(request('', studentCookie, {
    deviceId: 'browser-future-revision',
    visibilityState: 'visible',
    pageState: 'ready',
    lastSeenClassroomRevision: 1,
  }), { params: { sessionId: 'demo-class' } });

  assert.equal(collision.status, 409);
  assert.equal(future.status, 409);
  assert.equal(count(), countBefore);
  assert.equal(topic(), topicBefore);
  assert.equal(fixture.database.prepare(`
    SELECT revision FROM classroom_sessions WHERE session_id = 'demo-class'
  `).pluck().get(), revisionBefore);
});

function loginCookie(username: string): string {
  const result = auth.login({ username, password: '123456' });
  assert.ok(result);
  return `${AUTH_COOKIE_NAME}=${result.token}`;
}

function request(query: string, cookie: string, body: unknown): Request {
  return new Request(`http://localhost/api/class-sessions/demo-class/presence${query}`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
