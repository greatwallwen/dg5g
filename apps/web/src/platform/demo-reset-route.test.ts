import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthService } from './auth/auth-service.ts';
import { AUTH_COOKIE_NAME } from './auth/cookie.ts';
import { closeDatabase } from './db/database.ts';
import { seedDemo } from './db/demo-seed.ts';
import { migrateDatabase } from './db/migrations.ts';
import { createTestDatabase } from './db/test-database.ts';

const route = await import('../app/api/demo/reset/route.ts');

test('demo reset requires owning teacher and exact confirmation then preserves stable rows', async () => {
  const fixture = createTestDatabase();
  const previousPath = process.env.DGBOOK_SQLITE_PATH;
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    process.env.DGBOOK_SQLITE_PATH = fixture.databasePath;
    closeDatabase();

    assert.equal((await route.POST(request())).status, 401);
    const student = new AuthService(fixture.database).login({ username: 'student01', password: '123456' });
    const teacher = new AuthService(fixture.database).login({ username: 'teacher01', password: '123456' });
    assert.ok(student && teacher);
    assert.equal((await route.POST(request(student.token))).status, 403);
    assert.equal((await route.POST(request(teacher.token, { confirmation: 'wrong' }))).status, 400);
    assert.equal((await route.POST(request(teacher.token, {
      confirmation: 'RESET_THREE_DEMO_STUDENTS', extra: true,
    }))).status, 400);

    fixture.database.exec(`
      INSERT INTO learning_events (
        event_id, student_id, node_id, channel, event_type, payload_json, origin
      ) VALUES ('user-transient', 'stu-01', 'P1T1-N01', 'self-study', 'section_completed', '{}', 'user');
      INSERT INTO formal_assessment_instances (
        assessment_id, node_id, game_id, question_version, status
      ) VALUES ('user-transient-assessment', 'P1T1-N02', 'node-test', 'p01-n02-v1', 'running');
      INSERT INTO formal_assessment_tokens (
        token_hash, assessment_id, student_id, node_id, question_version, expires_at
      ) VALUES ('user-transient-token', 'user-transient-assessment', 'stu-01', 'P1T1-N02',
        'p01-n02-v1', '2099-01-01T00:00:00Z');
    `);
    const before = topicVersions(fixture.database);
    const response = await route.POST(request(teacher.token, {
      confirmation: 'RESET_THREE_DEMO_STUDENTS',
    }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), {
      reset: true,
      students: ['stu-01', 'stu-02', 'stu-03'],
    });
    assert.equal(fixture.database.prepare("SELECT COUNT(*) FROM users").pluck().get(), 4);
    assert.equal(fixture.database.prepare("SELECT COUNT(*) FROM classroom_members").pluck().get(), 3);
    assert.equal(fixture.database.prepare("SELECT COUNT(*) FROM evidence_library").pluck().get() as number > 0, true);
    assert.equal(fixture.database.prepare(
      "SELECT COUNT(*) FROM formal_assessment_instances WHERE assessment_id = 'user-transient-assessment'",
    ).pluck().get(), 0);
    assert.equal(fixture.database.prepare(
      "SELECT COUNT(*) FROM learning_events WHERE event_id = 'user-transient'",
    ).pluck().get(), 0);
    const after = topicVersions(fixture.database);
    assert.equal(after.global > before.global, true);
    assert.equal(after.classroom > before.classroom, true);
    for (const studentId of ['stu-01', 'stu-02', 'stu-03']) {
      assert.equal(
        after.students[studentId]! > before.students[studentId]!,
        true,
        `${studentId}: ${before.students[studentId]} -> ${after.students[studentId]}`,
      );
    }
  } finally {
    closeDatabase();
    if (previousPath === undefined) delete process.env.DGBOOK_SQLITE_PATH;
    else process.env.DGBOOK_SQLITE_PATH = previousPath;
    fixture.cleanup();
  }
});

function request(token?: string, body: unknown = { confirmation: 'RESET_THREE_DEMO_STUDENTS' }): Request {
  return new Request('http://localhost/api/demo/reset', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { cookie: `${AUTH_COOKIE_NAME}=${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

function topicVersions(database: ReturnType<typeof createTestDatabase>['database']) {
  const read = database.prepare('SELECT version FROM snapshot_versions WHERE topic = ?').pluck();
  return {
    global: read.get('global') as number,
    classroom: read.get('classroom:demo-class') as number,
    students: Object.fromEntries(['stu-01', 'stu-02', 'stu-03'].map((id) => [
      id, read.get(`learning:${id}`) as number,
    ])),
  };
}
