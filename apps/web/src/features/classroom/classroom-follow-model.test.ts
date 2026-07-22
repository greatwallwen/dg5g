import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { loadSelfStudyCatalog } from '../textbook-scene/self-study-content.ts';

const sourceUrl = new URL('./classroom-follow-model.ts', import.meta.url);

async function loadModel(): Promise<any> {
  assert.equal(existsSync(sourceUrl), true, 'classroom follow model must exist');
  return import(sourceUrl.href);
}

test('projects all twelve generated nodes into client-safe classroom content', async () => {
  const model = await loadModel();
  const source = loadSelfStudyCatalog();
  const projection = model.createClassroomContentCatalog(source);

  assert.equal(Object.keys(projection).length, 12);
  for (const document of Object.values(source)) {
    const unit = projection[document.nodeId];
    assert.equal(unit.nodeId, document.nodeId);
    assert.equal(unit.unitId, document.sourceKnowledgeUnitId);
    assert.equal(unit.teacherInstruction, document.nodeGoal);
    const expectedPractice = document.content.kind === 'deep'
      ? document.content.practices.foundation[0]
      : document.content.microPractice[0];
    assert.equal(unit.activity.id, expectedPractice.id);
    assert.equal(unit.activity.nodeId, document.nodeId);
    assert.equal(unit.activity.prompt, expectedPractice.prompt);
    assert.deepEqual(unit.activity.expectedEvidence, expectedPractice.expectedEvidence);
  }
});

test('builds one current unit and fails closed for unknown or mismatched cursors', async () => {
  const model = await loadModel();
  const content = model.createClassroomContentCatalog(loadSelfStudyCatalog());
  const current = content['P1T1-N02'];
  const result = model.buildClassroomFollowViewModel({
    sessionId: 'demo-class',
    revision: 7,
    actionIndex: 7,
    phase: 'lecture',
    activeNodeId: current.nodeId,
    activeUnitId: current.unitId,
    activityState: 'pushed',
  }, content, { href: '/learn/P1T3-N02', nodeId: 'P1T3-N02' });

  assert.equal(result.ok, true);
  assert.equal(result.value.actionIndex, 7);
  assert.equal(result.value.currentUnit.nodeId, 'P1T1-N02');
  assert.equal(result.value.classroomActivity.state, 'open');
  assert.equal(result.value.returnToSelfStudy.href, '/learn/P1T3-N02');

  for (const cursor of [
    { ...result.value, activeNodeId: 'P9T9-N99', activeUnitId: 'missing' },
    { ...result.value, activeNodeId: 'P1T1-N02', activeUnitId: 'wrong-unit' },
  ]) {
    const unavailable = model.buildClassroomFollowViewModel({
      sessionId: 'demo-class',
      revision: 8,
      actionIndex: 8,
      phase: 'lecture',
      activeNodeId: cursor.activeNodeId,
      activeUnitId: cursor.activeUnitId,
      activityState: 'not_pushed',
    }, content, undefined);
    assert.equal(unavailable.ok, false);
    assert.notEqual(unavailable.reason, 'fallback');
  }
});

test('self mode preserves its return target and only announces a newer teacher revision', async () => {
  const model = await loadModel();
  const returnTarget = { href: '/learn/P1T2-N03', nodeId: 'P1T2-N03' };
  const screen = model.selectClassroomStudentScreen({
    participation: { state: 'joined', mode: 'self', lastFollowedRevision: 4 },
    teacherRevision: 5,
    returnTarget,
  });

  assert.equal(screen.kind, 'self');
  assert.equal(screen.hasTeacherUpdate, true);
  assert.deepEqual(screen.returnTarget, returnTarget);
  assert.equal('currentUnit' in screen, false);
});

test('activity draft resets whenever the generated activity identity changes', async () => {
  const model = await loadModel();
  const answered = { activityId: 'P1T1-N02-foundation-1', answer: '旧答案', feedback: '旧反馈' };
  assert.deepEqual(model.alignClassroomActivityDraft(answered, answered.activityId), answered);
  assert.deepEqual(model.alignClassroomActivityDraft(answered, 'P1T1-N03-micro-1'), {
    activityId: 'P1T1-N03-micro-1',
    answer: '',
    feedback: '',
  });
});

test('paused and closed sessions never render a teacher unit even for an existing follower', async () => {
  const model = await loadModel();
  for (const sessionStatus of ['paused', 'closed']) {
    const screen = model.selectClassroomStudentScreen({
      participation: { state: 'joined', mode: 'follow', lastFollowedRevision: 4 },
      teacherRevision: 5,
      returnTarget: { href: '/learn/P1T1-N02', nodeId: 'P1T1-N02' },
      sessionStatus,
    });
    assert.equal(screen.kind, 'entry');
  }
});
