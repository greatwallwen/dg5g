import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import type { AuthenticatedActor } from '../../platform/auth/actor.ts';
import { seedDemo } from '../../platform/db/demo-seed.ts';
import { migrateDatabase } from '../../platform/db/migrations.ts';
import { createTestDatabase } from '../../platform/db/test-database.ts';

const loaderUrl = new URL('./student-follow-loader.ts', import.meta.url);

test('loads the exact demo-class SQLite session without joining or deriving a node from the URL', async () => {
  assert.equal(existsSync(loaderUrl), true, 'student follow loader must exist');
  const { loadStudentFollowPage } = await import(loaderUrl.href);
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);

    const loaded = loadStudentFollowPage(fixture.database, studentActor, 'demo-class');

    assert.ok(loaded);
    assert.equal(loaded.session.sessionId, 'demo-class');
    assert.equal(loaded.session.activeNodeId, 'P1T1-N02');
    assert.equal(loaded.sessionStatus, 'paused');
    assert.equal(loaded.participation.participation, null);
    assert.equal(loaded.participation.joinedCount, 0);
    assert.equal(loaded.participation.followingCount, 0);
    assert.deepEqual(loaded.returnTarget, {
      href: '/learn/P1T1-N01',
      nodeId: 'P1T1-N01',
    });
    assert.equal(Object.keys(loaded.contentCatalog).length, 12);
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM classroom_participation
    `).pluck().get(), 0, 'an RSC read must never join implicitly');
  } finally {
    fixture.cleanup();
  }
});

test('fails closed for an unknown classroom session instead of falling back to a node session', async () => {
  assert.equal(existsSync(loaderUrl), true, 'student follow loader must exist');
  const { loadStudentFollowPage } = await import(loaderUrl.href);
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);

    assert.equal(loadStudentFollowPage(fixture.database, studentActor, 'P1T1-N02'), undefined);
    assert.equal(loadStudentFollowPage(fixture.database, studentActor, 'missing-session'), undefined);
  } finally {
    fixture.cleanup();
  }
});

test('the real classroom page consumes the exact SQLite loader instead of node-style mock access', () => {
  const source = readFileSync(
    new URL('../../app/classroom/[sessionId]/page.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /loadStudentFollowPage/);
  assert.doesNotMatch(source, /isActiveDemoSession|getStudentFollowState|mock-api/);
});

const studentActor: AuthenticatedActor = {
  userId: 'stu-01',
  username: 'student01',
  displayName: '学生一',
  role: 'student',
  classId: 'demo-class',
  studentId: 'stu-01',
};
