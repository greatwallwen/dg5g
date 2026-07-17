import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { seedDemo } from '../../platform/db/demo-seed.ts';
import { migrateDatabase } from '../../platform/db/migrations.ts';
import { createTestDatabase } from '../../platform/db/test-database.ts';
import { ClassroomParticipationRepository } from '../../platform/classroom-participation-repository.ts';
import { AuthoritativeSnapshotReader } from '../../platform/authoritative-snapshot.ts';
import { seedUserFormalAssessment } from '../../platform/professional-output-policy-test-support.ts';

test('SQLite role-home read returns the current three-member class and persisted N02 teaching position', async () => {
  const { RoleHomeReadRepository } = await readModel();
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    fixture.database.prepare(`
      UPDATE classroom_sessions SET revision = 7 WHERE session_id = 'demo-class'
    `).run();
    const repository = new RoleHomeReadRepository(fixture.database);

    const student = repository.readStudentHomeSnapshot(studentActor());
    const teacher = repository.readTeacherWorkbenchSnapshot(teacherActor());
    const authoritative = new AuthoritativeSnapshotReader(fixture.database)
      .read(teacherActor(), 'teacher');

    assert.equal(student.selfStudy?.node.id, 'P1T1-N01');
    assert.equal(student.activeClassroom, undefined, 'paused teaching is not an active follow session');
    assert.equal(teacher.classroom.id, 'demo-class');
    assert.equal(teacher.classroom.status, 'paused');
    assert.equal(teacher.classroom.revision, 7);
    assert.equal(teacher.lastPosition?.nodeId, 'P1T1-N02');
    assert.equal(teacher.lastPosition?.unitId, 'P01-ku-02');
    assert.equal(teacher.classSummary.memberCount, 3);
    assert.equal(teacher.classSummary.joinedCount, 0);
    assert.equal(teacher.classSummary.followingCount, 0);
    assert.deepEqual(teacher.classSummary.submissions, authoritative.submissions);
    assert.deepEqual(teacher.classSummary.weakPoints, [{
      id: 'P1T1-N02',
      label: '设备拓扑待巩固',
      affectedCount: 3,
    }]);
    assert.deepEqual(teacher.classScores, authoritative.classScores);
    assert.equal(student.selfStudy?.progress.nodeTestHighestScore, undefined);
    assert.equal(student.selfStudy?.progress.taskCompositeScore, undefined);
    assert.equal(student.selfStudy?.progress.projectCompositeScore, undefined);

    fixture.database.prepare(`
      INSERT INTO formal_attempts (
        attempt_id, student_id, node_id, game_id, score,
        mistake_knowledge_point_ids_json
      ) VALUES ('zero-is-a-score', 'stu-03', 'P1T1-N02', 'node-test', 0, '[]')
    `).run();
    const afterInvalidAttempt = repository.readTeacherWorkbenchSnapshot(teacherActor());
    assert.equal(afterInvalidAttempt.classScores.activeNodeTestHighestScore, undefined);
  } finally {
    fixture.cleanup();
  }
});

test('active SQLite classroom is authoritative while the independent cursor remains unchanged', async () => {
  const { RoleHomeReadRepository } = await readModel();
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    fixture.database.prepare(`
      UPDATE classroom_sessions
      SET status = 'active', active_node_id = 'P1T1-N03', active_unit_id = 'P01-ku-03'
      WHERE session_id = 'demo-class'
    `).run();

    const snapshot = new RoleHomeReadRepository(fixture.database)
      .readStudentHomeSnapshot(studentActor());

    assert.equal(snapshot.selfStudy?.node.id, 'P1T1-N01');
    assert.equal(snapshot.activeClassroom?.context.node.id, 'P1T1-N03');
    assert.equal(snapshot.activeClassroom?.routeSessionId, 'demo-class');
    assert.deepEqual(snapshot.activeClassroom?.participation, {
      state: 'not-joined',
      mode: 'self',
    });

    new ClassroomParticipationRepository(fixture.database)
      .join('demo-class', 'stu-01', new Date('2026-07-16T05:00:00.000Z'));
    const joined = new RoleHomeReadRepository(fixture.database)
      .readStudentHomeSnapshot(studentActor());
    assert.deepEqual(joined.activeClassroom?.participation, {
      state: 'joined',
      mode: 'follow',
    });
  } finally {
    fixture.cleanup();
  }
});

test('missing personal cursor is explicit and never becomes an N01 snapshot', async () => {
  const { RoleHomeReadRepository } = await readModel();
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    fixture.database.prepare(`
      DELETE FROM self_study_cursors WHERE student_id = 'stu-03'
    `).run();

    const snapshot = new RoleHomeReadRepository(fixture.database)
      .readStudentHomeSnapshot({ ...studentActor(), userId: 'stu-03', studentId: 'stu-03', displayName: '学生三' });

    assert.equal(snapshot.selfStudy, undefined);
    assert.match(snapshot.dataIssue ?? '', /个人自主学习位置/);
    assert.doesNotMatch(JSON.stringify(snapshot), /P1T1-N01/);
  } finally {
    fixture.cleanup();
  }
});

test('authoritative membership/session failures remain an explicit blocked home instead of a server error', async () => {
  const { RoleHomeReadRepository } = await readModel();
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    fixture.database.prepare(`
      DELETE FROM classroom_members WHERE session_id = 'demo-class' AND student_id = 'stu-01'
    `).run();
    const repository = new RoleHomeReadRepository(fixture.database);

    const student = repository.readStudentHomeSnapshot(studentActor());
    const teacher = repository.readTeacherWorkbenchSnapshot({ ...teacherActor(), classId: 'missing-class' });

    assert.match(student.dataIssue ?? '', /班级成员关系/);
    assert.equal(student.selfStudy, undefined);
    assert.match(teacher.dataIssue ?? '', /授课班级/);
    assert.equal(teacher.classroom.status, 'closed');
  } finally {
    fixture.cleanup();
  }
});

test('seeded personal entries preserve truthful user-only access', async () => {
  const { RoleHomeReadRepository } = await readModel();
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const repository = new RoleHomeReadRepository(fixture.database);
    const entries = [
      repository.readStudentHomeSnapshot(studentActor()),
      repository.readStudentHomeSnapshot({ ...studentActor(), userId: 'stu-02', studentId: 'stu-02', displayName: '学生二' }),
      repository.readStudentHomeSnapshot({ ...studentActor(), userId: 'stu-03', studentId: 'stu-03', displayName: '学生三' }),
    ];

    assert.deepEqual(entries.map((entry: { selfStudy?: { node: { id: string } } }) => entry.selfStudy?.node.id), [
      'P1T1-N01',
      'P1T1-N04',
      'P1T3-N04',
    ]);
    assert.deepEqual(entries.map((entry) => entry.selfStudy?.access.kind), [
      'open',
      'locked',
      'locked',
    ]);
    assert.equal(entries.some((entry: { dataIssue?: string }) => Boolean(entry.dataIssue)), false);
  } finally {
    fixture.cleanup();
  }
});

test('authoritative home adapters preserve a real zero test score instead of treating it as missing', async () => {
  const { RoleHomeReadRepository } = await readModel();
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    fixture.database.prepare(`
      UPDATE classroom_sessions
      SET active_node_id = 'P1T1-N02', active_unit_id = 'P01-ku-02'
      WHERE session_id = 'demo-class'
    `).run();
    fixture.database.prepare(`
      UPDATE self_study_cursors
      SET node_id = 'P1T1-N02', unit_id = 'P01-ku-02', action_id = 'P1T1-N02-lesson-case'
      WHERE student_id = 'stu-03'
    `).run();
    seedUserFormalAssessment(fixture.database, 'stu-03', 'P01', 0, 'zero-score-is-real');
    const repository = new RoleHomeReadRepository(fixture.database);
    const student = repository.readStudentHomeSnapshot({
      ...studentActor(), userId: 'stu-03', studentId: 'stu-03', displayName: '学生三',
    });
    const teacher = repository.readTeacherWorkbenchSnapshot(teacherActor());

    assert.equal(student.selfStudy?.progress.nodeTestHighestScore, 0);
    assert.equal(teacher.classScores.activeNodeTestHighestScore, 0);
    assert.equal(teacher.classScores.activeNodeTestAverageScore, 0);
  } finally {
    fixture.cleanup();
  }
});

test('new-lesson options exclude nodes whose publication policy is not open', async () => {
  const module = await readModel() as unknown as {
    publishedLessonOptions?: (
      candidates: Array<{ nodeId: string; title: string }>,
      isPublished: (nodeId: string) => boolean,
    ) => Array<{ nodeId: string; title: string }>;
  };
  assert.equal(typeof module.publishedLessonOptions, 'function');
  const options = module.publishedLessonOptions?.([
    { nodeId: 'P1T1-N01', title: '边界' },
    { nodeId: 'P1T1-N02', title: '拓扑' },
    { nodeId: 'P1T1-N03', title: '条件' },
  ], (nodeId) => nodeId !== 'P1T1-N03');
  assert.deepEqual(options, [
    { nodeId: 'P1T1-N01', title: '边界' },
    { nodeId: 'P1T1-N02', title: '拓扑' },
  ]);
});

test('teacher workbench fails closed when an active class has no active node', async () => {
  const { RoleHomeReadRepository } = await readModel();
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    fixture.database.prepare(`
      UPDATE classroom_sessions
      SET status = 'active', active_node_id = NULL, active_unit_id = NULL
      WHERE session_id = 'demo-class'
    `).run();

    const snapshot = new RoleHomeReadRepository(fixture.database)
      .readTeacherWorkbenchSnapshot(teacherActor());

    assert.match(snapshot.dataIssue ?? '', /授课中.*能力节点/);
    assert.equal(snapshot.lastPosition, undefined);
  } finally {
    fixture.cleanup();
  }
});

test('role homes consume authoritative student and teacher cuts without rebuilding mutable facts', async () => {
  const source = await readFile(new URL('./role-home-read-model.ts', import.meta.url), 'utf8');

  assert.match(source, /new AuthoritativeSnapshotReader\(database\)/);
  assert.match(source, /snapshotReader\.read\(actor, 'student'\)/);
  assert.match(source, /snapshotReader\.read\(actor, 'teacher'\)/);
  assert.doesNotMatch(source, /LearningReadModel|LearningRepository/);
  assert.doesNotMatch(source, /classAttempts|highestNodeScore|averageTaskScore|averageProjectScore/);
  assert.doesNotMatch(source, /FROM formal_attempts|FROM professional_outputs|FROM frozen_task_scores/);
});

function studentActor() {
  return {
    userId: 'stu-01',
    username: 'student01',
    displayName: '学生一',
    role: 'student' as const,
    classId: 'demo-class',
    studentId: 'stu-01',
  };
}

function teacherActor() {
  return {
    userId: 'teacher-01',
    username: 'teacher01',
    displayName: '张老师',
    role: 'teacher' as const,
    classId: 'demo-class',
  };
}

async function readModel() {
  try {
    return await import('./role-home-read-model.ts');
  } catch (error) {
    assert.fail(`SQLite role-home read model is not implemented: ${String(error)}`);
  }
}
