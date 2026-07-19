import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthenticatedActor } from './auth/actor.ts';
import { AuthoritativeSnapshotReader } from './authoritative-snapshot.ts';
import { ClassroomParticipationRepository } from './classroom-participation-repository.ts';
import { openDatabase, type AppDatabase } from './db/database.ts';
import { seedDemo } from './db/demo-seed.ts';
import { migrateDatabase } from './db/migrations.ts';
import { createTestDatabase } from './db/test-database.ts';

test('student participation and aggregate counts come from one SQLite cut during a concurrent change', () => {
  const fixture = createTestDatabase();
  migrateDatabase(fixture.database);
  seedDemo(fixture.database);
  const writer = openDatabase(fixture.databasePath);
  try {
    fixture.database.prepare(`
      UPDATE classroom_sessions SET status = 'active' WHERE session_id = 'demo-class'
    `).run();
    let concurrentMutationCount = 0;
    const intercepted = interceptStudentParticipationRead(fixture.database, () => {
      concurrentMutationCount += 1;
      new ClassroomParticipationRepository(writer).join(
        'demo-class',
        'stu-01',
        new Date('2026-07-16T01:19:59.000Z'),
      );
    });

    const before = new AuthoritativeSnapshotReader(intercepted)
      .read(studentActor, 'student', { now: new Date('2026-07-16T01:20:00.000Z') });

    assert.equal(concurrentMutationCount, 1);
    assert.equal(before.participation, null);
    assert.deepEqual(before.membership, { classSize: 3, joinedCount: 0, followingCount: 0 });
    const after = new AuthoritativeSnapshotReader(fixture.database)
      .read(studentActor, 'student', { now: new Date('2026-07-16T01:20:00.000Z') });
    assert.ok(after.snapshotVersion > before.snapshotVersion);
    assert.equal(after.participation?.state, 'joined');
    assert.equal(after.participation?.mode, 'follow');
    assert.deepEqual(after.membership, { classSize: 3, joinedCount: 1, followingCount: 1 });
  } finally {
    writer.close();
    fixture.cleanup();
  }
});

const studentActor: AuthenticatedActor = {
  userId: 'stu-01',
  username: 'student01',
  displayName: 'student one',
  role: 'student',
  classId: 'demo-class',
  studentId: 'stu-01',
};

function interceptStudentParticipationRead(
  database: AppDatabase,
  beforeRead: () => void,
): AppDatabase {
  let intercepted = false;
  return new Proxy(database, {
    get(target, property) {
      if (property === 'prepare') {
        return (source: string) => {
          const statement = target.prepare(source);
          if (!source.includes('WHERE session_id = ? AND student_id = ?')) return statement;
          return new Proxy(statement, {
            get(statementTarget, statementProperty) {
              if (statementProperty === 'get') {
                return (...parameters: unknown[]) => {
                  if (!intercepted) {
                    intercepted = true;
                    beforeRead();
                  }
                  return statementTarget.get(...parameters);
                };
              }
              const value: unknown = Reflect.get(statementTarget, statementProperty);
              return typeof value === 'function' ? value.bind(statementTarget) : value;
            },
          });
        };
      }
      const value: unknown = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
