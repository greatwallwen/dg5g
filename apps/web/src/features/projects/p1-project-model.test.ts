import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateDatabase } from '../../platform/db/migrations.ts';
import { seedDemo } from '../../platform/db/demo-seed.ts';
import { createTestDatabase } from '../../platform/db/test-database.ts';
import { readP1ProjectProjection } from '../../platform/p1-project-projection.ts';
import { buildP1ProjectViewModel } from './p1-project-model.ts';

test('turns the student project projection into a clear current task and next action', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const model = buildP1ProjectViewModel(readP1ProjectProjection('stu-01', fixture.database));

    assert.deepEqual(model.project, {
      id: 'P1',
      title: '5G网络信息采集',
      finalOutputTitle: '5G网络信息采集成果包',
    });
    assert.deepEqual(model.currentAction, {
      taskId: 'P01',
      nodeId: 'P1T1-N01',
      label: '继续 P01 · 室内资源边界',
      href: '/learn/P1T1-N01',
    });
    assert.equal(model.completedTaskCount, 0);
    assert.equal(model.taskCount, 3);
    assert.equal(model.projectCompositeScoreLabel, '尚未形成');
    assert.deepEqual(model.tasks.map(({ taskId }) => taskId), ['P01', 'P02', 'P03']);
    assert.equal(model.tasks[0].completionStandard, '完成 4 个能力节点，正式测试达到 80 分，提交《室内设备与链路证据表》并通过教师复核。');
    assert.equal(model.tasks[1].stateLabel, '待解锁');
    assert.equal(model.tasks[1].nextAction, undefined);
    assert.ok(model.tasks[1].nodes.every(({ href }) => href === undefined));
  } finally {
    fixture.cleanup();
  }
});

test('labels demo task evidence without letting it advance the truthful current action', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const model = buildP1ProjectViewModel(readP1ProjectProjection('stu-02', fixture.database));

    assert.equal(model.tasks[0].stateLabel, '产出处理中');
    assert.equal(model.tasks[0].output.statusLabel, '退回修订 · 演示数据');
    assert.equal(model.tasks[0].output.versionLabel, 'v1');
    assert.equal(model.currentAction?.nodeId, 'P1T1-N01');
  } finally {
    fixture.cleanup();
  }
});

test('labels seeded completion and scores as demonstration data instead of a real delivery', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const model = buildP1ProjectViewModel(readP1ProjectProjection('stu-03', fixture.database));

    assert.equal(model.portfolioStatus, 'demo-complete');
    assert.equal(model.portfolioStatusLabel, '演示成果包已形成');
    assert.match(model.projectCompositeScoreLabel, /演示数据/);
    assert.match(model.tasks[0]!.output.statusLabel, /演示数据/);
    assert.match(model.tasks[0]!.nodeTestHighestScoreLabel, /演示数据/);
    assert.match(model.tasks[0]!.taskCompositeScoreLabel, /演示数据/);
  } finally {
    fixture.cleanup();
  }
});
