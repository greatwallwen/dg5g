import assert from 'node:assert/strict';
import test from 'node:test';
import type { P1ProjectProjection } from '../../platform/p1-project-projection.ts';
import { buildP1PortfolioViewModel } from './p1-portfolio-model.ts';

test('a returned v1 revised to v2 is current everywhere but the package remains unformed', () => {
  const model = buildP1PortfolioViewModel(projectFixture({
    outputs: {
      P01: {
        outputId: 'output-p01',
        currentOutputVersion: 2,
        outputStatus: 'returned',
        teacherFeedback: '补拍铭牌并补齐对端端口证据。',
        taskCompositeScore: undefined,
      },
      P02: {
        outputId: 'output-p02',
        currentOutputVersion: 1,
        outputStatus: 'verified',
        teacherFeedback: '方位角和挂高证据完整。',
        taskCompositeScore: 88,
        verifiedOutputReference: { outputId: 'output-p02', version: 1 },
      },
      P03: {
        outputId: 'output-p03',
        currentOutputVersion: 1,
        outputStatus: 'verified',
        teacherFeedback: '复现条件可追溯。',
        taskCompositeScore: 91,
        verifiedOutputReference: { outputId: 'output-p03', version: 1 },
      },
    },
  }));

  assert.equal(model.packageStatus, 'not-formed');
  assert.equal(model.packageStatusLabel, '尚未形成');
  assert.equal(model.projectCompositeScoreLabel, '尚未形成');
  assert.deepEqual(model.packageReferences, []);
  assert.deepEqual(model.items[0], {
    taskId: 'P01',
    detailHref: '/student/projects/p1/portfolio/P01',
    detailActionLabel: '查看成果与证据',
    taskTitle: '室内信息采集',
    outputTitle: '室内设备与链路证据表',
    versionLabel: 'v2',
    status: 'returned',
    statusLabel: '退回修订',
    teacherFeedback: '补拍铭牌并补齐对端端口证据。',
    taskCompositeScoreLabel: '尚未形成',
  });
});

test('the package is only three immutable verified references and scores them equally', () => {
  const model = buildP1PortfolioViewModel(projectFixture({
    outputs: {
      P01: {
        outputId: 'output-p01',
        currentOutputVersion: 2,
        outputStatus: 'verified',
        teacherFeedback: '修订后证据闭环。',
        taskCompositeScore: 86,
        verifiedOutputReference: { outputId: 'output-p01', version: 2 },
      },
      P02: {
        outputId: 'output-p02',
        currentOutputVersion: 3,
        outputStatus: 'verified',
        teacherFeedback: '天线姿态证据完整。',
        taskCompositeScore: 88,
        verifiedOutputReference: { outputId: 'output-p02', version: 3 },
      },
      P03: {
        outputId: 'output-p03',
        currentOutputVersion: 1,
        outputStatus: 'verified',
        teacherFeedback: '投诉复现记录完整。',
        taskCompositeScore: 91,
        verifiedOutputReference: { outputId: 'output-p03', version: 1 },
      },
    },
  }));

  assert.equal(model.packageStatus, 'complete');
  assert.equal(model.packageStatusLabel, '成果包已形成');
  assert.equal(model.projectCompositeScore, 88);
  assert.equal(model.projectCompositeScoreLabel, '88');
  assert.deepEqual(model.packageReferences, [
    { taskId: 'P01', outputId: 'output-p01', version: 2 },
    { taskId: 'P02', outputId: 'output-p02', version: 3 },
    { taskId: 'P03', outputId: 'output-p03', version: 1 },
  ]);
  assert.ok(model.packageReferences.every((reference) => !Object.hasOwn(reference, 'fields')));
  assert.equal(new Set(model.packageReferences.map(({ taskId }) => taskId)).size, 3);
  assert.deepEqual(model.items.map(({ detailHref }) => detailHref), [
    '/student/projects/p1/portfolio/P01',
    '/student/projects/p1/portfolio/P02',
    '/student/projects/p1/portfolio/P03',
  ]);
});

test('three verified demo outputs form only a labelled demonstration package', () => {
  const outputs = Object.fromEntries((['P01', 'P02', 'P03'] as const).map((taskId, index) => [taskId, {
    outputId: `demo-${taskId}`,
    currentOutputVersion: 1,
    outputStatus: 'verified' as const,
    outputOrigin: 'demo' as const,
    taskCompositeScore: 90 + index,
    taskScoreOrigin: 'demo' as const,
    verifiedOutputReference: { outputId: `demo-${taskId}`, version: 1 },
  }])) as Record<'P01' | 'P02' | 'P03', Partial<P1ProjectProjection['tasks'][number]>>;
  const model = buildP1PortfolioViewModel(projectFixture({ outputs }));

  assert.equal(model.packageStatus, 'demo-complete');
  assert.equal(model.packageStatusLabel, '演示成果包已形成');
  assert.match(model.projectCompositeScoreLabel, /演示数据/);
  assert.ok(model.items.every(({ statusLabel }) => statusLabel.includes('演示数据')));
});

test('an unformed task still links to its truthful reason instead of a silent fallback', () => {
  const model = buildP1PortfolioViewModel(projectFixture({
    outputs: { P01: {}, P02: {}, P03: {} },
  }));

  assert.equal(model.items[0]?.detailHref, '/student/projects/p1/portfolio/P01');
  assert.equal(model.items[0]?.detailActionLabel, '查看未形成原因');
});

function projectFixture({
  outputs,
}: {
  outputs: Record<'P01' | 'P02' | 'P03', Partial<P1ProjectProjection['tasks'][number]>>;
}): P1ProjectProjection {
  const definitions = [
    ['P01', 'P1T1', '室内信息采集', '室内设备与链路证据表'],
    ['P02', 'P1T2', '室外信息采集', '室外天线与覆盖证据表'],
    ['P03', 'P1T3', '投诉信息采集', '投诉复现与多源证据记录'],
  ] as const;
  return {
    projectId: 'P1',
    projectTitle: '5G网络信息采集',
    finalOutputTitle: '5G网络信息采集成果包',
    studentVersion: 12,
    snapshotVersion: 29,
    portfolioStatus: 'collecting',
    tasks: definitions.map(([taskId, runtimeTaskId, title, taskOutputTitle]) => ({
      taskId,
      runtimeTaskId,
      title,
      why: '形成可复核的职业证据。',
      taskOutputTitle,
      state: 'output-pending',
      nodes: [],
      outputStatus: 'not-started',
      outputOrigin: 'user',
      taskScoreOrigin: 'user',
      ...outputs[taskId],
    })),
  };
}
