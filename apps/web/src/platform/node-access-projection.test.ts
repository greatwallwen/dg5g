import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !specifier.endsWith('.ts')) return nextResolve(`${specifier}.ts`, context);
    return nextResolve(specifier, context);
  },
});

const { projectFutureContentAccess, projectNodeAccess, projectTaskAccess } = await import('./node-access-projection.ts');

test('future course outline uses an explicit non-clickable publication projection', () => {
  assert.equal(typeof projectFutureContentAccess, 'function');
  assert.deepEqual(projectFutureContentAccess('P04'), {
    nodeId: 'P04',
    kind: 'unavailable',
    label: '后续开放',
    disabled: true,
    canNavigate: false,
    prerequisiteNodeIds: [],
  });
});

test('missing node progress is never interpreted as an available node', () => {
  assert.deepEqual(projectNodeAccess('P1T2-N01', undefined), {
    nodeId: 'P1T2-N01',
    kind: 'loading',
    label: '正在读取学习状态',
    disabled: true,
    canNavigate: false,
    prerequisiteNodeIds: ['P1T1-N04'],
  });
  assert.deepEqual(projectNodeAccess('P1T2-N01', []), {
    nodeId: 'P1T2-N01',
    kind: 'unavailable',
    label: '学习状态不可用',
    disabled: true,
    canNavigate: false,
    prerequisiteNodeIds: ['P1T1-N04'],
  });
});

test('P02 and P03 entries stay disabled until their upstream projected facts unlock them', () => {
  const progress = [
    { nodeId: 'P1T1-N01', learningState: 'available' as const },
    { nodeId: 'P1T2-N01', learningState: 'locked' as const },
    { nodeId: 'P1T3-N01', learningState: 'locked' as const },
  ];

  assert.deepEqual(projectNodeAccess('P1T1-N01', progress), {
    nodeId: 'P1T1-N01',
    kind: 'open',
    label: '可学习',
    disabled: false,
    canNavigate: true,
    prerequisiteNodeIds: [],
    state: 'available',
  });
  for (const nodeId of ['P1T2-N01', 'P1T3-N01']) {
    const access = projectNodeAccess(nodeId, progress);
    assert.equal(access.kind, 'locked');
    assert.equal(access.label, '未解锁');
    assert.equal(access.disabled, true);
    assert.equal(access.canNavigate, true);
    assert.equal(access.state, 'locked');
  }
});

test('task entry access is the same authoritative projection as its N01 node', () => {
  assert.equal(projectTaskAccess('P02', undefined).kind, 'loading');
  assert.deepEqual(
    projectTaskAccess('P02', [{ nodeId: 'P1T2-N01', learningState: 'locked' }]),
    projectNodeAccess('P1T2-N01', [{ nodeId: 'P1T2-N01', learningState: 'locked' }]),
  );
  assert.deepEqual(
    projectTaskAccess('P03', [{ nodeId: 'P1T3-N01', learningState: 'locked' }]),
    projectNodeAccess('P1T3-N01', [{ nodeId: 'P1T3-N01', learningState: 'locked' }]),
  );
});
