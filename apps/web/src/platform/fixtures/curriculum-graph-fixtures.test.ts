import assert from 'node:assert/strict';
import test from 'node:test';
import {
  curriculumGraphNodes,
  curriculumSemanticEdges,
} from './curriculum-graph-fixtures.ts';

test('P1 graph exposes three equal-weight tasks and twelve unique learning nodes', () => {
  const tasks = ['P01', 'P02', 'P03'].map((id) => curriculumGraphNodes.find((node) => node.id === id));
  assert.ok(tasks.every(Boolean));
  assert.deepEqual(tasks.map((node) => [node!.width, node!.height]), [
    [210, 58],
    [210, 58],
    [210, 58],
  ]);

  const p1Nodes = curriculumGraphNodes.filter((node) => /^P1T[123]-N0[1234]$/.test(node.id));
  assert.equal(p1Nodes.length, 12);
  assert.equal(new Set(p1Nodes.map((node) => node.id)).size, 12);
  assert.ok(p1Nodes.every((node) => node.revealAt === 'route'));
});

test('P1 task and node prerequisites form complete P01 to P02 to P03 chains', () => {
  const edgeIds = new Set(curriculumSemanticEdges.map((edge) => edge.edgeId));
  assert.ok(edgeIds.has('P01->P02'));
  assert.ok(edgeIds.has('P02->P03'));
  assert.equal(
    curriculumSemanticEdges.find((edge) => edge.edgeId === 'cap-survey->P03')?.label,
    '课程承载',
  );

  for (const task of [1, 2, 3]) {
    assert.ok(edgeIds.has(`P0${task}->P1T${task}-N01`));
    for (const node of [1, 2, 3]) {
      assert.ok(edgeIds.has(`P1T${task}-N0${node}->P1T${task}-N0${node + 1}`));
    }
  }
});

test('P2+ outline is explicitly future-open and never fabricates navigation or scores', () => {
  const futureNodes = curriculumGraphNodes.filter((node) => /^P(?:0[4-9]|1[0-8])$/.test(node.id));
  assert.equal(futureNodes.length, 15);
  for (const node of futureNodes) {
    assert.equal(node.locked, true, node.id);
    assert.equal(node.subtitle, '后续开放', node.id);
    assert.equal(node.score, undefined, node.id);
    assert.equal('href' in node, false, node.id);
  }

  assert.equal(curriculumGraphNodes.some((node) => /成绩\s*\d/.test(node.title)), false);
});

test('every semantic edge connects two real graph nodes', () => {
  const ids = new Set(curriculumGraphNodes.map((node) => node.id));
  for (const edge of curriculumSemanticEdges) {
    assert.ok(ids.has(edge.from), `${edge.edgeId} source`);
    assert.ok(ids.has(edge.to), `${edge.edgeId} target`);
    assert.notEqual(edge.from, edge.to);
  }
});

test('P01 P02 and P03 each close formal-test, professional-output and task-score loops', () => {
  const loops = [
    { task: 1, formal: 'game-topology', output: 'game-evidence', achievement: 'achievement-p01' },
    { task: 2, formal: 'game-beam', output: 'game-route', achievement: 'achievement-p02' },
    { task: 3, formal: 'game-complaint', output: 'evidence-p03', achievement: 'achievement-p03' },
  ];
  const edgesById = new Map(curriculumSemanticEdges.map((edge) => [edge.edgeId, edge]));
  const nodesById = new Map(curriculumGraphNodes.map((node) => [node.id, node]));

  for (const loop of loops) {
    const nodePrefix = `P1T${loop.task}`;
    const formal = edgesById.get(`${nodePrefix}-N02->${loop.formal}`);
    const output = edgesById.get(`${nodePrefix}-N04->${loop.output}`);
    const scoreReturn = edgesById.get(`${loop.formal}->${loop.achievement}`);
    const outputReturn = edgesById.get(`${loop.output}->${loop.achievement}`);
    assert.deepEqual([formal?.label, formal?.kind], ['正式测试', 'assessment'], `${nodePrefix} formal test`);
    assert.deepEqual([output?.label, output?.kind], ['形成成果', 'output'], `${nodePrefix} output`);
    assert.deepEqual([scoreReturn?.label, scoreReturn?.kind], ['成绩回流', 'assessment'], `${nodePrefix} score return`);
    assert.deepEqual([outputReturn?.label, outputReturn?.kind], ['任务综合分', 'output'], `${nodePrefix} output return`);
    assert.equal(nodesById.get(loop.achievement)?.taskId, `P0${loop.task}`);
    assert.equal(
      curriculumSemanticEdges.some((edge) => edge.from === `${nodePrefix}-N04` && edge.label === '正式测试'),
      false,
      `${nodePrefix}-N04 is output-only`,
    );
  }
});

test('N04 legacy activity links are professional outputs rather than formal tests', () => {
  const edge = (edgeId: string) => curriculumSemanticEdges.find((item) => item.edgeId === edgeId);
  assert.deepEqual([edge('P1T1-N04->game-evidence')?.label, edge('P1T1-N04->game-evidence')?.kind], ['形成成果', 'output']);
  assert.deepEqual([edge('P1T2-N04->game-route')?.label, edge('P1T2-N04->game-route')?.kind], ['形成成果', 'output']);
});
