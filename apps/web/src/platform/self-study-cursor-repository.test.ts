import assert from 'node:assert/strict';
import test from 'node:test';
import { seedDemo } from './db/demo-seed.ts';
import { openDatabase } from './db/database.ts';
import { migrateDatabase } from './db/migrations.ts';
import { createTestDatabase } from './db/test-database.ts';
import {
  SelfStudyCursorRepository,
  SelfStudyCursorStudentNotActiveError,
} from './self-study-cursor-repository.ts';

test('two node cursors coexist while only the last saved node is active and versions change once', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const repository = new SelfStudyCursorRepository(fixture.database);
    const learningBefore = topicVersion('learning:stu-01');
    const globalBefore = topicVersion('global');
    const classroomBefore = topicVersion('classroom:demo-class');
    const p01 = {
      unitId: 'P01-ku-02', actionId: 'P1T1-N02-lesson-evidence',
      actionIndex: 2, positionMs: 4200,
    };
    const p02 = {
      unitId: 'P02-ku-02', actionId: 'P1T2-N02-lesson-example',
      actionIndex: 4, positionMs: 8700,
    };

    assert.deepEqual(repository.save('stu-01', 'P1T1-N02', p01, at('03:00:00')), {
      studentId: 'stu-01', nodeId: 'P1T1-N02', ...p01,
    });
    assert.deepEqual(repository.save('stu-01', 'P1T2-N02', p02, at('03:01:00')), {
      studentId: 'stu-01', nodeId: 'P1T2-N02', ...p02,
    });
    assert.deepEqual(repository.read('stu-01', 'P1T1-N02'), {
      studentId: 'stu-01', nodeId: 'P1T1-N02', ...p01,
    });
    assert.deepEqual(repository.readActive('stu-01'), {
      studentId: 'stu-01', nodeId: 'P1T2-N02', ...p02,
    });
    assert.deepEqual(repository.readAll('stu-01'), [
      { studentId: 'stu-01', nodeId: 'P1T2-N02', ...p02 },
      { studentId: 'stu-01', nodeId: 'P1T1-N02', ...p01 },
    ]);
    assert.equal(topicVersion('learning:stu-01'), learningBefore + 2);
    assert.equal(topicVersion('global'), globalBefore + 2);
    assert.equal(topicVersion('classroom:demo-class'), classroomBefore);

    const learningAfter = topicVersion('learning:stu-01');
    const globalAfter = topicVersion('global');
    repository.save('stu-01', 'P1T2-N02', p02, at('03:02:00'));
    assert.equal(topicVersion('learning:stu-01'), learningAfter);
    assert.equal(topicVersion('global'), globalAfter);

    const p01Updated = { ...p01, actionIndex: 3, positionMs: 5100 };
    repository.save('stu-01', 'P1T1-N02', p01Updated, at('03:03:00'));
    assert.deepEqual(repository.readActive('stu-01'), {
      studentId: 'stu-01', nodeId: 'P1T1-N02', ...p01Updated,
    });
    assert.deepEqual(repository.read('stu-01', 'P1T2-N02'), {
      studentId: 'stu-01', nodeId: 'P1T2-N02', ...p02,
    });
  } finally {
    fixture.cleanup();
  }

  function topicVersion(topic: string): number {
    return fixture.database.prepare(`SELECT version FROM snapshot_versions WHERE topic = ?`)
      .pluck().get(topic) as number | undefined ?? 0;
  }
});

test('cursor rows and every playback field survive a database process rebuild', () => {
  const fixture = createTestDatabase();
  let reopened: ReturnType<typeof openDatabase> | undefined;
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const repository = new SelfStudyCursorRepository(fixture.database);
    repository.save('stu-01', 'P1T1-N02', {
      unitId: 'P01-ku-02', actionId: 'P1T1-N02-lesson-evidence', actionIndex: 2, positionMs: 4200,
    }, at('04:00:00'));
    repository.save('stu-01', 'P1T2-N02', {
      unitId: 'P02-ku-02', actionId: 'P1T2-N02-lesson-example', actionIndex: 4, positionMs: 8700,
    }, at('04:01:00'));
    const before = repository.readAll('stu-01');
    const stu02Before = repository.readAll('stu-02');
    fixture.database.close();

    reopened = openDatabase({ path: fixture.databasePath, fileMustExist: true });
    const rebuilt = new SelfStudyCursorRepository(reopened);
    assert.deepEqual(rebuilt.readAll('stu-01'), before);
    assert.deepEqual(rebuilt.readAll('stu-02'), stu02Before);
  } finally {
    if (reopened?.open) reopened.close();
    fixture.cleanup();
  }
});

test('cursor save rejects teacher, inactive, and missing identities with zero side effects', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    fixture.database.prepare(`UPDATE users SET is_active = 0 WHERE id = 'stu-03'`).run();
    const repository = new SelfStudyCursorRepository(fixture.database);
    const before = {
      cursors: fixture.database.prepare(`SELECT COUNT(*) FROM self_study_cursors`).pluck().get(),
      topics: fixture.database.prepare(`SELECT COUNT(*) FROM snapshot_versions`).pluck().get(),
      global: fixture.database.prepare(`SELECT version FROM snapshot_versions WHERE topic = 'global'`).pluck().get(),
    };
    const draft = { actionIndex: 0, positionMs: 0 };

    for (const studentId of ['teacher-01', 'stu-03', 'missing-student']) {
      assert.throws(
        () => repository.save(studentId, 'P1T1-N02', draft),
        SelfStudyCursorStudentNotActiveError,
      );
    }
    assert.deepEqual({
      cursors: fixture.database.prepare(`SELECT COUNT(*) FROM self_study_cursors`).pluck().get(),
      topics: fixture.database.prepare(`SELECT COUNT(*) FROM snapshot_versions`).pluck().get(),
      global: fixture.database.prepare(`SELECT version FROM snapshot_versions WHERE topic = 'global'`).pluck().get(),
    }, before);
  } finally {
    fixture.cleanup();
  }
});

function at(time: string): Date {
  return new Date(`2026-07-16T${time}.000Z`);
}
