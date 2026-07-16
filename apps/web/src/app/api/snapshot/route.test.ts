import assert from 'node:assert/strict';
import test from 'node:test';
import type { AppDatabase } from '@/platform/db/database.ts';

const { AuthService } = await import('@/platform/auth/auth-service.ts');
const { AUTH_COOKIE_NAME } = await import('@/platform/auth/cookie.ts');
const { closeDatabase } = await import('@/platform/db/database.ts');
const { seedDemo } = await import('@/platform/db/demo-seed.ts');
const { migrateDatabase } = await import('@/platform/db/migrations.ts');
const { createTestDatabase } = await import('@/platform/db/test-database.ts');
const snapshotRoute = await import('./route.ts');

test('snapshot API requires a Cookie actor and validates its audience query', async () => {
  await withFixture(async ({ studentCookie }) => {
    const anonymous = await snapshotRoute.GET(request('?audience=student'));
    const missingAudience = await snapshotRoute.GET(request('', studentCookie));
    const invalidAudience = await snapshotRoute.GET(request('?audience=admin', studentCookie));
    const duplicateAudience = await snapshotRoute.GET(request('?audience=student&audience=graph', studentCookie));

    assert.equal(anonymous.status, 401);
    assert.equal(missingAudience.status, 400);
    assert.equal(invalidAudience.status, 400);
    assert.equal(duplicateAudience.status, 400);
  });
});

test('snapshot API enforces the complete student and teacher audience matrix', async () => {
  await withFixture(async ({ studentCookie, teacherCookie }) => {
    const studentCuts = await Promise.all([
      readCut(studentCookie, 'student'),
      readCut(studentCookie, 'teacher'),
      readCut(studentCookie, 'projector'),
      readCut(studentCookie, 'graph'),
    ]);
    assert.deepEqual(studentCuts.map(({ response }) => response.status), [200, 403, 403, 200]);
    assert.equal(studentCuts[0]?.body.audience, 'student');
    assert.equal(studentCuts[0]?.body.me.studentId, 'stu-01');
    assert.equal(studentCuts[3]?.body.audience, 'graph');
    assert.equal(studentCuts[3]?.body.mode, 'student');
    assert.equal(studentCuts[3]?.body.me.studentId, 'stu-01');

    const teacherCuts = await Promise.all([
      readCut(teacherCookie, 'student'),
      readCut(teacherCookie, 'teacher'),
      readCut(teacherCookie, 'projector'),
      readCut(teacherCookie, 'graph'),
    ]);
    assert.deepEqual(teacherCuts.map(({ response }) => response.status), [403, 200, 200, 200]);
    assert.equal(teacherCuts[1]?.body.audience, 'teacher');
    assert.deepEqual(teacherCuts[1]?.body.students.map(({ studentId }: { studentId: string }) => studentId), [
      'stu-01',
      'stu-02',
      'stu-03',
    ]);
    assert.equal(teacherCuts[2]?.body.audience, 'projector');
    assert.equal(teacherCuts[3]?.body.audience, 'graph');
    assert.equal(teacherCuts[3]?.body.mode, 'teacher');
  });
});

test('snapshot API selects the authoritative session when omitted and distinguishes 404 from 403', async () => {
  await withFixture(async ({ database, teacherCookie }) => {
    insertForeignSession(database);

    const implicit = await snapshotRoute.GET(request('?audience=teacher', teacherCookie));
    const unknown = await snapshotRoute.GET(request('?audience=teacher&sessionId=missing', teacherCookie));
    const foreign = await snapshotRoute.GET(request('?audience=teacher&sessionId=foreign-class', teacherCookie));
    const duplicateSession = await snapshotRoute.GET(request(
      '?audience=teacher&sessionId=demo-class&sessionId=foreign-class',
      teacherCookie,
    ));

    assert.equal(implicit.status, 200);
    assert.equal((await implicit.json()).classroom.sessionId, 'demo-class');
    assert.equal(unknown.status, 404);
    assert.equal(foreign.status, 403);
    assert.equal(duplicateSession.status, 400);
  });
});

test('snapshot API rejects bodies and authority-bearing query overrides', async () => {
  await withFixture(async ({ studentCookie }) => {
    const forgedQuery = await snapshotRoute.GET(request(
      '?audience=student&sessionId=demo-class&studentId=stu-02&role=teacher&classId=other-class',
      studentCookie,
    ));
    const bodyBearingGet = await snapshotRoute.GET(request(
      '?audience=student&sessionId=demo-class',
      studentCookie,
      { 'content-length': '42', 'content-type': 'application/json' },
    ));

    assert.equal(forgedQuery.status, 400);
    assert.equal(bodyBearingGet.status, 400);
  });
});

test('projector cut is no-store and contains no per-student identity or evidence', async () => {
  await withFixture(async ({ teacherCookie }) => {
    const response = await snapshotRoute.GET(request(
      '?audience=projector&sessionId=demo-class',
      teacherCookie,
    ));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(body.audience, 'projector');
    const serialized = JSON.stringify(body);
    for (const forbidden of [
      'stu-01', 'stu-02', 'stu-03', 'student01', 'student02', 'student03',
      '学生一', '学生二', '学生三',
    ]) {
      assert.equal(serialized.includes(forbidden), false, `projector leaked ${forbidden}`);
    }
    const forbiddenKeys = new Set([
      'studentId', 'students', 'participants', 'roster', 'devices', 'acks',
      'displayName', 'username', 'deviceId', 'outputId', 'feedback', 'answers', 'evidenceText',
    ]);
    visit(body, (key) => assert.equal(forbiddenKeys.has(key), false, `projector leaked key ${key}`));
  });
});

async function readCut(cookie: string, audience: string) {
  const response = await snapshotRoute.GET(request(
    `?audience=${audience}&sessionId=demo-class`,
    cookie,
  ));
  return { response, body: await response.json() };
}

async function withFixture(run: (fixture: {
  database: AppDatabase;
  studentCookie: string;
  teacherCookie: string;
}) => Promise<void>): Promise<void> {
  const fixture = createTestDatabase();
  const previousPath = process.env.DGBOOK_SQLITE_PATH;
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    process.env.DGBOOK_SQLITE_PATH = fixture.databasePath;
    closeDatabase();
    const auth = new AuthService(fixture.database);
    const student = auth.login({ username: 'student01', password: '123456' });
    const teacher = auth.login({ username: 'teacher01', password: '123456' });
    assert.ok(student);
    assert.ok(teacher);
    await run({
      database: fixture.database,
      studentCookie: `${AUTH_COOKIE_NAME}=${student.token}`,
      teacherCookie: `${AUTH_COOKIE_NAME}=${teacher.token}`,
    });
  } finally {
    closeDatabase();
    if (previousPath === undefined) delete process.env.DGBOOK_SQLITE_PATH;
    else process.env.DGBOOK_SQLITE_PATH = previousPath;
    fixture.cleanup();
  }
}

function request(query: string, cookie?: string, extraHeaders: Record<string, string> = {}): Request {
  return new Request(`http://localhost/api/snapshot${query}`, {
    headers: {
      ...(cookie ? { cookie } : {}),
      ...extraHeaders,
    },
  });
}

function insertForeignSession(database: AppDatabase): void {
  database.prepare(`
    INSERT INTO users (id, username, display_name, role, password_hash, is_active)
    VALUES ('teacher-foreign', 'teacherforeign', '外班教师', 'teacher', 'test-hash', 1)
  `).run();
  database.prepare(`
    INSERT INTO classroom_sessions (
      session_id, class_id, name, teacher_id, status, active_node_id, active_unit_id, state_json
    )
    SELECT 'foreign-class', 'other-class', '其他班级', 'teacher-foreign',
      status, active_node_id, active_unit_id, state_json
    FROM classroom_sessions WHERE session_id = 'demo-class'
  `).run();
}

function visit(value: unknown, check: (key: string) => void): void {
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    check(key);
    visit(nested, check);
  }
}
