import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { AuthService } from './auth/auth-service.ts';
import { AUTH_COOKIE_NAME } from './auth/cookie.ts';
import { closeDatabase } from './db/database.ts';
import { seedDemo } from './db/demo-seed.ts';
import { migrateDatabase } from './db/migrations.ts';
import { createTestDatabase } from './db/test-database.ts';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'next/server') return nextResolve('next/server.js', context);
    if (specifier.startsWith('@/')) {
      const sourcePath = resolve(process.cwd(), 'apps/web/src', specifier.slice(2));
      const candidate = [`${sourcePath}.ts`, `${sourcePath}.tsx`, resolve(sourcePath, 'index.ts')].find(existsSync);
      if (candidate) return nextResolve(pathToFileURL(candidate).href, context);
    }
    if (specifier.startsWith('.') && context.parentURL?.includes('/apps/web/src/') && !specifier.endsWith('.ts') && !specifier.endsWith('.tsx')) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const route = await import('../app/api/skill-progress/[studentId]/route.ts');

test('retired skill-progress GET, POST, and DELETE still reject anonymous callers with 401', async () => {
  const context = { params: { studentId: 'stu-01' } };
  const responses = await Promise.all([
    route.GET(new Request('http://localhost/api/skill-progress/stu-01'), context),
    route.POST(new Request('http://localhost/api/skill-progress/stu-01', { method: 'POST' }), context),
    route.DELETE(new Request('http://localhost/api/skill-progress/stu-01', { method: 'DELETE' }), context),
  ]);

  assert.deepEqual(responses.map((response) => response.status), [401, 401, 401]);
});

test('retired skill-progress GET, POST, and DELETE return 410 to an authenticated caller', async () => {
  await withStudentCookie(async (cookie) => {
    const context = { params: { studentId: 'stu-01' } };
    const responses = await Promise.all([
      route.GET(new Request('http://localhost/api/skill-progress/stu-01', { headers: { cookie } }), context),
      route.POST(new Request('http://localhost/api/skill-progress/stu-01', { method: 'POST', headers: { cookie } }), context),
      route.DELETE(new Request('http://localhost/api/skill-progress/stu-01', { method: 'DELETE', headers: { cookie } }), context),
    ]);

    assert.deepEqual(responses.map((response) => response.status), [410, 410, 410]);
    for (const response of responses) {
      assert.deepEqual(await response.json(), {
        error: 'Legacy skill-progress API has been retired',
        replacement: '/api/learning',
      });
    }
  });
});

async function withStudentCookie(run: (cookie: string) => Promise<void>): Promise<void> {
  const fixture = createTestDatabase();
  const previousPath = process.env.DGBOOK_SQLITE_PATH;
  const password = process.env.DGBOOK_DEMO_PASSWORD ?? '123456';
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    process.env.DGBOOK_SQLITE_PATH = fixture.databasePath;
    closeDatabase();
    const login = new AuthService(fixture.database).login({ username: 'student01', password });
    assert.ok(login);
    await run(`${AUTH_COOKIE_NAME}=${login.token}`);
  } finally {
    closeDatabase();
    if (previousPath === undefined) delete process.env.DGBOOK_SQLITE_PATH;
    else process.env.DGBOOK_SQLITE_PATH = previousPath;
    fixture.cleanup();
  }
}
