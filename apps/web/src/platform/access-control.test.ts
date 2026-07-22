import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === './fixtures') return nextResolve('./fixtures/index.ts', context);
    if (specifier.startsWith('.') && !specifier.endsWith('.ts')) return nextResolve(`${specifier}.ts`, context);
    return nextResolve(specifier, context);
  },
});

const {
  canReadClassLearning,
  canReadStudentLearning,
  canWriteStudentLearning,
  classifyNodeRoute,
  classifyNodeRouteFromPolicy,
} = await import('./access-control.ts');
const { getNodeLearningPolicy } = await import('./learning-policy.ts');

test('node route classification never silently falls back to P1T1-N01', () => {
  assert.deepEqual(classifyNodeRoute('does-not-exist'), { kind: 'not-found', nodeId: 'does-not-exist' });
  assert.deepEqual(classifyNodeRoute('P4T2-N04'), { kind: 'not-open', nodeId: 'P4T2-N04' });
});

test('locked active node returns explicit prerequisites instead of textbook content', () => {
  assert.deepEqual(classifyNodeRoute('P1T1-N04', 'locked'), {
    kind: 'locked',
    nodeId: 'P1T1-N04',
    prerequisiteNodeIds: ['P1T1-N03'],
  });
  assert.deepEqual(classifyNodeRoute('P1T1-N02', 'available'), { kind: 'open', nodeId: 'P1T1-N02' });
});

test('an explicitly not-open known policy is never classified as open', () => {
  const publishedPolicy = getNodeLearningPolicy('P1T3-N01');
  assert.ok(publishedPolicy);

  assert.deepEqual(
    classifyNodeRouteFromPolicy(
      'P1T3-N01',
      { ...publishedPolicy, publicationStatus: 'not-open' },
    ),
    { kind: 'not-open', nodeId: 'P1T3-N01' },
  );
});

test('learning authority is derived only from the authenticated actor and class scope', () => {
  const student = { userId: 'stu-01', studentId: 'stu-01', username: 'student01', displayName: '学生一', role: 'student' as const, classId: 'demo-class' };
  const teacher = { userId: 'teacher-01', username: 'teacher01', displayName: '教师', role: 'teacher' as const, classId: 'demo-class' };

  assert.equal(canReadStudentLearning(student, 'stu-01', 'demo-class'), true);
  assert.equal(canReadStudentLearning(student, 'stu-02', 'demo-class'), false);
  assert.equal(canWriteStudentLearning(student, 'stu-01'), true);
  assert.equal(canWriteStudentLearning(student, 'stu-02'), false);
  assert.equal(canReadStudentLearning(teacher, 'stu-02', 'demo-class'), true);
  assert.equal(canReadStudentLearning(teacher, 'stu-02', 'other-class'), false);
  assert.equal(canWriteStudentLearning(teacher, 'stu-02'), false);
  assert.equal(canReadClassLearning(teacher, 'demo-class'), true);
  assert.equal(canReadClassLearning(teacher, 'other-class'), false);
  assert.equal(canReadClassLearning(student, 'demo-class'), false);
});

test('the real student learning page uses the same actor-scoped SQLite gate before loading graph content', () => {
  const page = readFileSync(new URL('../app/learn/[nodeId]/page.tsx', import.meta.url), 'utf8');
  const notice = readFileSync(new URL('../features/textbook-scene/textbook-scene-support.tsx', import.meta.url), 'utf8');

  assert.match(page, /requireNodeAccess\(actor, params\.nodeId\)/);
  assert.match(page, /routeState=\{destination\.kind\}/);
  assert.match(notice, /data-node-route-state=\{routeState\}/);
  assert.doesNotMatch(page, /redirect\(['"]\/learn\/P1T1-N01['"]\)/);
  assert.ok(page.indexOf('requireNodeAccess(actor, params.nodeId)') < page.indexOf('getCapabilityGraph(params.nodeId)'));
});
