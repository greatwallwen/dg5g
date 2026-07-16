import assert from 'node:assert/strict';
import test from 'node:test';
import type { TeacherWorkbenchSnapshot } from '../home/role-home-types.ts';

test('projects the current three-student SQLite aggregate and one-click continue action', async () => {
  const { buildTeacherWorkbenchViewModel } = await workbenchModel();
  const model = buildTeacherWorkbenchViewModel(teacherSnapshot());

  assert.equal(model.kind, 'ready');
  if (model.kind !== 'ready') return;
  assert.equal(model.courseTitle, '5G网络优化（高级）');
  assert.equal(model.classroom.name, '5G 网络优化演示班');
  assert.equal(model.classroom.memberCount, 3);
  assert.equal(model.lastPosition?.nodeId, 'P1T1-N02');
  assert.deepEqual(model.continueAction, {
    label: '继续授课',
    href: '/teacher/sessions/demo-class',
    disabled: false,
  });
  assert.equal(model.classSummary.submissions.professionalOutputs.submittedAwaitingReviewCount, 1);
  assert.equal(model.classSummary.submissions.classroomActivity.submittedCount, 2);
  assert.equal(model.classSummary.submissions.classroomActivity.submissionPercent, 67);
  assert.equal(model.classSummary.submissions.activeAssessment.submittedCount, 1);
  assert.deepEqual(model.classSummary.weakPoints, [
    { id: 'P1T1-N02-kp-boundary', label: '设备边界判断', affectedCount: 1 },
  ]);
  assert.deepEqual(model.scoreCards.map((item: { label: string; value: string }) => [item.label, item.value]), [
    ['节点测试最高分', '92'],
    ['任务综合分', '83'],
    ['项目综合分', '尚未形成'],
  ]);
  assert.equal(JSON.stringify(model).includes('成绩'), false);
});

test('new lesson uses one trigger click and a second click reaches P1T1-N02', async () => {
  const { buildTeacherWorkbenchViewModel } = await workbenchModel();
  const model = buildTeacherWorkbenchViewModel(teacherSnapshot());

  assert.equal(model.kind, 'ready');
  if (model.kind !== 'ready') return;
  assert.deepEqual(model.newLesson.trigger, { label: '开始新课', clickStep: 1 });
  assert.equal(model.newLesson.sessionId, 'demo-class');
  assert.equal(model.newLesson.expectedRevision, 0);
  assert.deepEqual(
    model.newLesson.options.find((item: { nodeId: string }) => item.nodeId === 'P1T1-N02'),
    {
      nodeId: 'P1T1-N02',
      title: '设备拓扑',
      clickStep: 2,
    },
  );
  assert.equal(JSON.stringify(model.newLesson).includes('?nodeId='), false);
});

test('membership scales from three to 24 or more without clamping or hard-coded denominators', async () => {
  const { buildTeacherWorkbenchViewModel } = await workbenchModel();
  const model = buildTeacherWorkbenchViewModel(teacherSnapshot({
    classSummary: {
      memberCount: 27,
      joinedCount: 19,
      followingCount: 14,
      submissions: {
        classroomActivity: { submittedCount: 24, submissionPercent: 89 },
        activeAssessment: {
          status: 'running', eligibleCount: 27, submittedCount: 21, playingCount: 4,
          passedCount: 18, submissionPercent: 78, passRatePercent: 86,
        },
        professionalOutputs: { submittedAwaitingReviewCount: 6, returnedCount: 2, verifiedCount: 7 },
      },
      weakPoints: [{ id: 'kp-direction', label: '连接方向判断', affectedCount: 9 }],
    },
  }));

  assert.equal(model.kind, 'ready');
  if (model.kind !== 'ready') return;
  assert.equal(model.classroom.memberCount, 27);
  assert.equal(model.classSummary.submissions.classroomActivity.submittedCount, 24);
  assert.equal(model.classSummary.submissions.professionalOutputs.submittedAwaitingReviewCount, 6);
  assert.equal(model.classSummary.weakPoints[0]?.affectedCount, 9);
});

test('missing last teaching position disables continue instead of inventing an N01 fallback', async () => {
  const { buildTeacherWorkbenchViewModel } = await workbenchModel();
  const model = buildTeacherWorkbenchViewModel(teacherSnapshot({ lastPosition: undefined }));

  assert.equal(model.kind, 'ready');
  if (model.kind !== 'ready') return;
  assert.deepEqual(model.continueAction, {
    label: '继续授课',
    href: undefined,
    disabled: true,
  });
  assert.doesNotMatch(JSON.stringify(model.continueAction), /P1T1-N01/);
});

test('a closed classroom never exposes continue even when a stale last position remains', async () => {
  const { buildTeacherWorkbenchViewModel } = await workbenchModel();
  const model = buildTeacherWorkbenchViewModel(teacherSnapshot({
    classroom: { id: 'demo-class', name: '5G 网络优化演示班', status: 'closed', revision: 0 },
  }));

  assert.equal(model.kind, 'ready');
  if (model.kind !== 'ready') return;
  assert.deepEqual(model.continueAction, {
    label: '继续授课',
    href: undefined,
    disabled: true,
  });
  assert.equal(model.newLesson.options.some((option) => option.nodeId === 'P1T1-N02'), true);
});

test('score cards distinguish a real zero from a score that has not formed', async () => {
  const { buildTeacherWorkbenchViewModel } = await workbenchModel();
  const model = buildTeacherWorkbenchViewModel(teacherSnapshot({
    classScores: {
      activeNodeTestHighestScore: 0,
      activeNodeTestAverageScore: 0,
      activeTaskCompositeAverageScore: 0,
      distribution: [
        { range: '90-100', count: 0 },
        { range: 'pass-89', count: 0 },
        { range: '60-below-pass', count: 0 },
        { range: 'below-60', count: 1 },
      ],
    },
  }));

  assert.equal(model.kind, 'ready');
  if (model.kind !== 'ready') return;
  assert.deepEqual(model.scoreCards.map(({ value }) => value), ['0', '0', '尚未形成']);
});

function teacherSnapshot(overrides: Partial<TeacherWorkbenchSnapshot> = {}): TeacherWorkbenchSnapshot {
  return {
    displayName: '张老师',
    courseTitle: '5G网络优化（高级）',
    classroom: { id: 'demo-class', name: '5G 网络优化演示班', status: 'paused', revision: 0 },
    lastPosition: {
      projectId: 'P1',
      projectTitle: '5G网络信息采集',
      taskId: 'P01',
      taskTitle: '室内信息采集',
      nodeId: 'P1T1-N02',
      nodeTitle: '设备拓扑',
      unitId: 'P01-ku-02',
    },
    classSummary: {
      memberCount: 3,
      joinedCount: 0,
      followingCount: 0,
      submissions: {
        classroomActivity: { submittedCount: 2, submissionPercent: 67 },
        activeAssessment: {
          status: 'running', eligibleCount: 3, submittedCount: 1, playingCount: 1,
          passedCount: 1, submissionPercent: 33, passRatePercent: 100,
        },
        professionalOutputs: { submittedAwaitingReviewCount: 1, returnedCount: 0, verifiedCount: 2 },
      },
      weakPoints: [{ id: 'P1T1-N02-kp-boundary', label: '设备边界判断', affectedCount: 1 }],
    },
    classScores: {
      activeNodeTestHighestScore: 92,
      activeNodeTestAverageScore: 81,
      activeTaskCompositeAverageScore: 83,
      distribution: [
        { range: '90-100', count: 1 },
        { range: 'pass-89', count: 1 },
        { range: '60-below-pass', count: 1 },
        { range: 'below-60', count: 0 },
      ],
    },
    lessonOptions: [
      { nodeId: 'P1T1-N01', title: '室内资源边界' },
      { nodeId: 'P1T1-N02', title: '设备拓扑' },
      { nodeId: 'P1T1-N03', title: '运行条件' },
      { nodeId: 'P1T1-N04', title: '证据与归档' },
    ],
    ...overrides,
  };
}

async function workbenchModel() {
  try {
    return await import('./teacher-workbench-model.ts');
  } catch (error) {
    assert.fail(`teacher workbench model is not implemented: ${String(error)}`);
  }
}
