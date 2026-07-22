import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { AuthenticatedActor } from '../../platform/auth/actor.ts';
import { AuthoritativeSnapshotReader } from '../../platform/authoritative-snapshot.ts';
import { seedDemo } from '../../platform/db/demo-seed.ts';
import { migrateDatabase } from '../../platform/db/migrations.ts';
import { createTestDatabase } from '../../platform/db/test-database.ts';
import { projectGraphSnapshot } from './graph-snapshot-model.ts';

test('student graph model keeps canonical state progress separate from named scores', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const snapshot = new AuthoritativeSnapshotReader(fixture.database)
      .read(studentActor(), 'graph', { now: new Date('2026-07-16T02:00:00.000Z') });
    assert.equal(snapshot.mode, 'student');
    if (snapshot.mode !== 'student') throw new Error('Expected the student graph cut.');

    const model = projectGraphSnapshot(snapshot);
    const node = model.nodes.find(({ nodeId }) => nodeId === 'P1T1-N02');
    const task = model.tasks.find(({ taskId }) => taskId === 'P01');

    assert.equal(model.mode, 'student');
    assert.equal(model.selectedNodeId, 'P1T1-N01');
    assert.equal(node?.learningState, 'locked');
    assert.equal(node?.nodeTestHighestScore, undefined);
    assert.equal(node?.stateCompletionPercent, 0);
    assert.notEqual(node?.stateCompletionPercent, node?.nodeTestHighestScore);
    assert.equal(task?.taskCompositeScore, undefined);
    assert.equal(Object.hasOwn(task ?? {}, 'taskCompositeScore'), false);
    assert.equal(task?.stateCompletionPercent, snapshot.me.tasks[0]?.stateCompletionPercent);
  } finally {
    fixture.cleanup();
  }
});

test('teacher graph model exposes only aggregate heatmap while keeping published teaching nodes navigable', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const snapshot = new AuthoritativeSnapshotReader(fixture.database)
      .read(teacherActor(), 'graph', { now: new Date('2026-07-16T02:00:00.000Z') });

    const model = projectGraphSnapshot(snapshot);
    const heatmap = model.nodeHeatmap.find(({ nodeId }) => nodeId === 'P1T1-N02');

    assert.equal(model.mode, 'teacher');
    assert.equal(model.sessionId, 'demo-class');
    assert.equal(model.nodes.length, 12);
    assert.equal(model.tasks.length, 3);
    assert.ok(model.nodes.every(({ learningState }) => learningState === 'available'));
    assert.equal(Object.values(heatmap?.stateCounts ?? {}).reduce((sum, count) => sum + count, 0), 3);
    assert.equal(JSON.stringify(model).includes('stu-01'), false);
    assert.equal(JSON.stringify(model).includes('学生一'), false);
  } finally {
    fixture.cleanup();
  }
});

test('graph model selects the first enterable node when the classroom has no active node', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    fixture.database.prepare(`
      UPDATE classroom_sessions
      SET active_node_id = NULL,
          state_json = json_remove(state_json, '$.lesson.activeNodeId')
      WHERE session_id = 'demo-class'
    `).run();
    const snapshot = new AuthoritativeSnapshotReader(fixture.database)
      .read(studentActor(), 'graph', { now: new Date('2026-07-16T02:00:00.000Z') });

    const model = projectGraphSnapshot(snapshot);

    assert.equal(model.selectedNodeId, 'P1T1-N01');
  } finally {
    fixture.cleanup();
  }
});

test('course graph consumes the graph snapshot and never reuses scores as workflow completion', () => {
  const overview = readFileSync(new URL('../textbook-scene/course-overview.tsx', import.meta.url), 'utf8');
  const elements = readFileSync(new URL('./semantic-graph-elements.tsx', import.meta.url), 'utf8');

  assert.match(overview, /\/api\/snapshot\?audience=graph/);
  assert.match(overview, /snapshot\.sessionId/);
  assert.doesNotMatch(overview, /fetchLearningProgress/);
  assert.match(elements, /stateCompletionPercent/);
  assert.match(elements, /nodeTestHighestScore/);
  assert.match(elements, /taskCompositeScore/);
  assert.match(elements, /projectCompositeScore/);
  assert.doesNotMatch(elements, /masteryPercent/);
  assert.doesNotMatch(elements, /achievementLevel/);
  const model = readFileSync(new URL('./graph-snapshot-model.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(model, /function taskCompletion|\.reduce\(/);
  assert.doesNotMatch(model, /: 'P1T1-N01'/);
});

function studentActor(): AuthenticatedActor {
  return {
    userId: 'stu-01',
    username: 'student01',
    displayName: '学生一',
    role: 'student',
    classId: 'demo-class',
    studentId: 'stu-01',
  };
}

function teacherActor(): AuthenticatedActor {
  return {
    userId: 'teacher-01',
    username: 'teacher01',
    displayName: '张老师',
    role: 'teacher',
    classId: 'demo-class',
  };
}
