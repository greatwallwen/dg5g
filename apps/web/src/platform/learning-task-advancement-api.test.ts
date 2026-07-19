import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { AuthService } from './auth/auth-service.ts';
import { AUTH_COOKIE_NAME } from './auth/cookie.ts';
import { closeDatabase, type AppDatabase } from './db/database.ts';
import { seedDemo } from './db/demo-seed.ts';
import { migrateDatabase } from './db/migrations.ts';
import { createTestDatabase } from './db/test-database.ts';
import { LearningRepository } from './learning-repository.ts';
import { seedUserFormalAssessment } from './professional-output-policy-test-support.ts';

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

const eventRoute = await import('../app/api/learning/nodes/[nodeId]/events/route.ts');

test('direct P02 API access opens only after valid user advancement facts and stays open after return', async () => {
  await withAuthenticatedFixture(async ({ database, studentCookie }) => {
    const repository = new LearningRepository(database);
    const postSection = (sectionId: string, expectedVersion: number) => eventRoute.POST(jsonRequest(
      'http://localhost/api/learning/nodes/P1T2-N01/events',
      studentCookie,
      {
        eventId: `direct-p02-${sectionId}`,
        channel: 'self-study',
        eventType: 'section_completed',
        payload: { sectionId, completed: true },
        expectedVersion,
      },
    ), { params: { nodeId: 'P1T2-N01' } });

    const beforeVersion = repository.readTopicVersion('learning:stu-01');
    assert.equal((await postSection('problem', beforeVersion)).status, 403);
    assert.equal(repository.readTopicVersion('learning:stu-01'), beforeVersion);

    seedUserFormalAssessment(database, 'stu-01', 'P01', 80, 'direct-p02');
    database.exec(`
      INSERT INTO professional_outputs (
        output_id, student_id, task_id, node_id, status, content_json,
        current_version, state_revision, origin
      ) VALUES ('direct-p02-output', 'stu-01', 'P01', 'P1T1-N04', 'submitted', '{}', 1, 1, 'user');
      INSERT INTO learning_events (
        event_id, student_id, node_id, channel, event_type, payload_json, origin
      ) VALUES ('direct-p02-submit', 'stu-01', 'P1T1-N04', 'self-study', 'evidence_submitted',
        '{"taskId":"P01","outputId":"direct-p02-output","version":1,"stateRevision":1}', 'user');
    `);
    const opened = await postSection('problem', beforeVersion);
    assert.equal(opened.status, 200);
    const openedVersion = (await opened.json()).version as number;

    database.exec(`
      UPDATE professional_outputs
      SET status = 'returned', state_revision = 3
      WHERE output_id = 'direct-p02-output';
      INSERT INTO output_reviews (
        review_id, output_id, reviewer_id, status, feedback, origin
      ) VALUES ('direct-p02-return', 'direct-p02-output', 'teacher-01', 'returned', 'revise', 'user');
      INSERT INTO learning_events (
        event_id, student_id, node_id, channel, event_type, payload_json, origin
      ) VALUES ('direct-p02-return-event', 'stu-01', 'P1T1-N04', 'classroom', 'teacher_returned',
        '{"reviewId":"direct-p02-return","version":1}', 'user');
    `);
    assert.equal((await postSection('figure', openedVersion)).status, 200);
  });
});

async function withAuthenticatedFixture(
  run: (fixture: { database: AppDatabase; studentCookie: string }) => Promise<void>,
): Promise<void> {
  const fixture = createTestDatabase();
  const previousPath = process.env.DGBOOK_SQLITE_PATH;
  const password = process.env.DGBOOK_DEMO_PASSWORD ?? '123456';
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    process.env.DGBOOK_SQLITE_PATH = fixture.databasePath;
    closeDatabase();
    const student = new AuthService(fixture.database).login({ username: 'student01', password });
    assert.ok(student);
    await run({
      database: fixture.database,
      studentCookie: `${AUTH_COOKIE_NAME}=${student.token}`,
    });
  } finally {
    closeDatabase();
    if (previousPath === undefined) delete process.env.DGBOOK_SQLITE_PATH;
    else process.env.DGBOOK_SQLITE_PATH = previousPath;
    fixture.cleanup();
  }
}

function jsonRequest(url: string, cookie: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
