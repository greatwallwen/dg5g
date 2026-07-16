import assert from 'node:assert/strict';
import test from 'node:test';
import type { LearningContextSnapshot, StudentHomeSnapshot } from './role-home-types.ts';

test('answers the four novice questions and resumes the independent cursor when no class is active', async () => {
  const { buildStudentHomeViewModel } = await studentModel();
  const input = studentSnapshot();

  const model = buildStudentHomeViewModel(input);

  assert.equal(model.kind, 'ready');
  if (model.kind !== 'ready') return;
  assert.deepEqual(model.current, {
    project: { id: 'P1', title: '5G网络信息采集' },
    task: { id: 'P01', title: '室内信息采集' },
    node: { id: 'P1T1-N02', title: '设备拓扑' },
    why: '为室内网络测试建立可复核的设备与连接证据。',
    completionStandard: '完成微练习，正式测试达到 80 分，并说明位置、身份和连接方向的证据依据。',
  });
  assert.deepEqual(model.primaryAction, {
    label: '继续学习',
    href: '/learn/P1T1-N02',
    mode: 'self-study',
  });
  assert.deepEqual(
    model.secondaryActions.map((action: { label: string; href: string }) => [action.label, action.href]),
    [
      ['查看其他任务', '/student/projects/p1'],
      ['课程能力图谱', '/course'],
    ],
  );
  assert.equal(model.progress.stateLabel, '学习中');
  assert.equal(model.progress.nextRequirement, '完成微练习');
});

test('an active classroom becomes primary without overwriting the independent cursor', async () => {
  const { buildStudentHomeViewModel } = await studentModel();
  const input = studentSnapshot({
    selfStudy: learningContext('P1T1-N01', '室内资源边界', '/learn/P1T1-N01'),
    activeClassroom: {
      className: '5G 网络优化演示班',
      routeSessionId: 'demo-class',
      participation: { state: 'not-joined', mode: 'self' },
      context: learningContext('P1T1-N02', '设备拓扑', '/learn/P1T1-N02'),
    },
  });

  const model = buildStudentHomeViewModel(input);

  assert.equal(model.kind, 'ready');
  if (model.kind !== 'ready') return;
  assert.equal(model.current.node.id, 'P1T1-N02');
  assert.deepEqual(model.primaryAction, {
    label: '继续学习',
    href: '/classroom/demo-class',
    mode: 'classroom-follow',
  });
  assert.deepEqual(
    model.secondaryActions.find((action: { label: string }) => action.label === '自主学习'),
    { label: '自主学习', href: '/learn/P1T1-N01', icon: 'book' },
  );
  assert.equal(input.selfStudy?.node.id, 'P1T1-N01');
});

test('missing or locked personal state fails closed and never falls back to P1T1-N01', async () => {
  const { buildStudentHomeViewModel } = await studentModel();
  const missing = buildStudentHomeViewModel(studentSnapshot({ selfStudy: undefined }));
  const locked = buildStudentHomeViewModel(studentSnapshot({
    selfStudy: {
      ...learningContext('P1T1-N02', '设备拓扑', '/learn/P1T1-N02'),
      access: { kind: 'locked', label: '未解锁', requiredNodeIds: ['P1T1-N01'] },
    },
  }));

  assert.equal(missing.kind, 'blocked');
  assert.equal(locked.kind, 'blocked');
  if (missing.kind === 'blocked') {
    assert.equal(missing.primaryAction, undefined);
    assert.doesNotMatch(JSON.stringify(missing), /\/learn\/P1T1-N01/);
    assert.match(missing.blocker.detail, /学习位置/);
  }
  if (locked.kind === 'blocked') {
    assert.deepEqual(locked.blocker.requiredNodeIds, ['P1T1-N01']);
    assert.equal(locked.primaryAction, undefined);
  }
});

function studentSnapshot(overrides: Partial<StudentHomeSnapshot> = {}): StudentHomeSnapshot {
  return {
    displayName: '学生一',
    selfStudy: learningContext('P1T1-N02', '设备拓扑', '/learn/P1T1-N02'),
    activeClassroom: undefined,
    ...overrides,
  };
}

function learningContext(nodeId: string, nodeTitle: string, href: string): LearningContextSnapshot {
  return {
    project: { id: 'P1', title: '5G网络信息采集', finalOutput: '5G网络信息采集成果包' },
    task: {
      id: 'P01',
      title: '室内信息采集',
      why: '为室内网络测试建立可复核的设备与连接证据。',
      outputTitle: '室内设备与链路证据表',
    },
    node: { id: nodeId, title: nodeTitle, goal: '识别设备、槽位与连接关系。' },
    completionStandard: '完成微练习，正式测试达到 80 分，并说明位置、身份和连接方向的证据依据。',
    href,
    access: { kind: 'open', label: '学习中', requiredNodeIds: [] },
    progress: {
      stateLabel: '学习中',
      completionPercent: 20,
      nextRequirement: '完成微练习',
      nodeTestHighestScore: undefined,
      taskCompositeScore: undefined,
      projectCompositeScore: undefined,
    },
  };
}

async function studentModel() {
  try {
    return await import('./student-home-model.ts');
  } catch (error) {
    assert.fail(`student home model is not implemented: ${String(error)}`);
  }
}
