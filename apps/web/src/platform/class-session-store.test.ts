import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test, { after } from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
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

const { createTestDatabase } = await import('./db/test-database.ts');
const { migrateDatabase } = await import('./db/migrations.ts');
const { seedDemo } = await import('./db/demo-seed.ts');
const { closeDatabase } = await import('./db/database.ts');
const fixture = createTestDatabase();
migrateDatabase(fixture.database);
seedDemo(fixture.database);
seedClassroomSessions(fixture.database, [
  'P1T1-N02-intent-server-revision',
  'P1T1-N02-intent-conflict',
  'P1T1-N02-intent-illegal',
]);
const { startActiveLessonRun } = await import('./classroom-lesson-run-test-fixture.ts');
const { ClassroomParticipationRepository } = await import('./classroom-participation-repository.ts');
const activeLessonRuns = new Map([
  'P1T1-N02-intent-server-revision',
  'P1T1-N02-intent-conflict',
].map((sessionId) => [sessionId, startActiveLessonRun(fixture.database, sessionId)]));
process.env.DGBOOK_SQLITE_PATH = fixture.databasePath;

const { classroomDeviceSnapshot, recordDeviceHeartbeat } = await import('./class-session-device-store.ts');
const { applyClassroomIntent, getClassSession } = await import('./class-session-store.ts');

after(() => {
  closeDatabase();
  delete process.env.DGBOOK_SQLITE_PATH;
  fixture.cleanup();
});

const now = new Date('2026-07-13T02:00:00.000Z');

test('server owns the next classroom revision and publishes one device command', () => {
  const sessionId = 'P1T1-N02-intent-server-revision';
  const lessonRun = activeLessonRuns.get(sessionId);
  assert.ok(lessonRun);
  new ClassroomParticipationRepository(fixture.database).join(
    sessionId,
    'stu-01',
    new Date(now.getTime() - 1_000),
  );
  recordDeviceHeartbeat(sessionId, {
    actorRole: 'student',
    deviceId: `device-${sessionId}-stu-01`,
    studentId: 'stu-01',
    clientKind: 'browser',
    visibilityState: 'visible',
    pageState: 'ready',
    lastAppliedRevision: lessonRun.revision,
  }, now);

  const initial = getClassSession(sessionId);
  const result = applyClassroomIntent(sessionId, {
    type: 'phase_changed',
    phase: 'question',
  }, initial.lessonState?.revision ?? 0, now);

  assert.equal(result.session.lessonState?.phase, 'question');
  assert.equal(result.session.lessonState?.revision, lessonRun.revision + 1);
  assert.equal(result.command.revision, lessonRun.revision + 1);
  assert.equal(classroomDeviceSnapshot(sessionId, now).acks[0]?.state, 'queued');
});

test('rejects a stale expected revision instead of overwriting a newer class state', () => {
  const sessionId = 'P1T1-N02-intent-conflict';
  const lessonRun = activeLessonRuns.get(sessionId);
  assert.ok(lessonRun);
  const initial = getClassSession(sessionId);
  applyClassroomIntent(sessionId, { type: 'phase_changed', phase: 'question' }, initial.lessonState?.revision ?? 0, now);

  assert.throws(
    () => applyClassroomIntent(sessionId, { type: 'phase_changed', phase: 'practice' }, lessonRun.revision, now),
    /revision conflict/i,
  );
  assert.equal(getClassSession(sessionId).lessonState?.phase, 'question');
});

test('rejects an illegal phase transition without publishing another revision', () => {
  const sessionId = 'P1T1-N02-intent-illegal';
  const initial = getClassSession(sessionId);

  assert.throws(
    () => applyClassroomIntent(sessionId, { type: 'phase_changed', phase: 'review' }, initial.lessonState?.revision ?? 0, now),
    /illegal classroom intent/i,
  );
  assert.equal(getClassSession(sessionId).lessonState?.revision, 0);
});

function seedClassroomSessions(
  database: typeof fixture.database,
  sessionIds: string[],
): void {
  const insertSession = database.prepare(`
    INSERT INTO classroom_sessions (
      session_id, class_id, name, teacher_id, status, active_node_id,
      active_unit_id, revision, state_json
    )
    SELECT ?, class_id, ?, teacher_id, status, active_node_id,
      active_unit_id, 0, '{}'
    FROM classroom_sessions
    WHERE session_id = 'demo-class'
  `);
  const insertMembers = database.prepare(`
    INSERT INTO classroom_members (session_id, student_id)
    SELECT ?, student_id FROM classroom_members WHERE session_id = 'demo-class'
  `);
  database.transaction(() => {
    for (const sessionId of sessionIds) {
      insertSession.run(sessionId, `Test ${sessionId}`);
      insertMembers.run(sessionId);
    }
  })();
}
