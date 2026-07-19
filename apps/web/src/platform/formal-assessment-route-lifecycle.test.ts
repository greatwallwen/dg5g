import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthService } from './auth/auth-service.ts';
import { AUTH_COOKIE_NAME } from './auth/cookie.ts';
import { closeDatabase, type AppDatabase } from './db/database.ts';
import { seedDemo } from './db/demo-seed.ts';
import { migrateDatabase } from './db/migrations.ts';
import { createTestDatabase } from './db/test-database.ts';

test('assessment PATCH accepts only answers plus expectedRevision and returns 409 without overwriting on stale CAS', async () => {
  const fixture = createTestDatabase();
  const previousPath = process.env.DGBOOK_SQLITE_PATH;
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    readyForFormalAssessment(fixture.database, 'stu-01');
    const session = new AuthService(fixture.database).login({ username: 'student01', password: '123456' });
    assert.ok(session);
    process.env.DGBOOK_SQLITE_PATH = fixture.databasePath;
    closeDatabase();
    const route = await import('../app/api/learning/nodes/[nodeId]/assessment/route.ts');
    const cookie = `${AUTH_COOKIE_NAME}=${session.token}`;
    const issuedResponse = route.GET(assessmentRequest('GET', cookie), assessmentRouteContext());
    const issued = await issuedResponse.json() as { attemptToken: string; assessmentId: string };

    const first = await route.PATCH(assessmentRequest('PATCH', cookie, {
      answers: { evidenceClassification: 'nameplate-photo' },
      expectedRevision: 0,
    }, issued.attemptToken), assessmentRouteContext());
    assert.equal(first.status, 200);
    assert.equal((await first.json()).revision, 1);

    const stale = await route.PATCH(assessmentRequest('PATCH', cookie, {
      answers: { evidenceClassification: 'location-photo' },
      expectedRevision: 0,
    }, issued.attemptToken), assessmentRouteContext());
    assert.equal(stale.status, 409);
    assert.deepEqual(fixture.database.prepare(`
      SELECT answers_json AS answersJson, state_revision AS revision
      FROM formal_assessment_drafts WHERE assessment_id = ? AND student_id = 'stu-01'
    `).get(issued.assessmentId), {
      answersJson: JSON.stringify({ evidenceClassification: 'nameplate-photo' }),
      revision: 1,
    });

    const forged = await route.PATCH(assessmentRequest('PATCH', cookie, {
      answers: { evidenceClassification: 'nameplate-photo' },
      expectedRevision: 1,
      score: 100,
    }, issued.attemptToken), assessmentRouteContext());
    assert.equal(forged.status, 400);
  } finally {
    closeDatabase();
    if (previousPath === undefined) delete process.env.DGBOOK_SQLITE_PATH;
    else process.env.DGBOOK_SQLITE_PATH = previousPath;
    fixture.cleanup();
  }
});

function readyForFormalAssessment(database: AppDatabase, studentId: string): void {
  const insert = database.prepare(`
    INSERT INTO practice_attempts (
      attempt_id, student_id, activity_id, node_id, passed, origin, attempted_at
    ) VALUES (?, ?, ?, ?, 1, 'user', '1999-12-31T23:59:00.000Z')
  `);
  for (const [activityId, nodeId] of [
    ['P1T1-N01-micro-01', 'P1T1-N01'],
    ['P1T1-N02-foundation-01', 'P1T1-N02'],
    ['P1T1-N02-application-01', 'P1T1-N02'],
    ['P1T1-N02-transfer-01', 'P1T1-N02'],
  ]) insert.run(`route-lifecycle-ready-${studentId}-${activityId}`, studentId, activityId, nodeId);
}

function assessmentRequest(method: string, cookie: string, body?: unknown, token?: string): Request {
  return new Request('http://localhost/api/learning/nodes/P1T1-N02/assessment', {
    method,
    headers: {
      cookie,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token === undefined ? {} : { 'x-assessment-token': token }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function assessmentRouteContext() {
  return { params: { nodeId: 'P1T1-N02' } };
}
