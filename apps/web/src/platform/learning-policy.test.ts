import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deriveNodeLearningProjection,
  getNodeLearningPolicy,
  nodeLearningPolicies,
} from './learning-policy.ts';

test('P1 exposes twelve policies with N02 tests and N04 output review gates', () => {
  assert.equal(nodeLearningPolicies.length, 12);
  assert.equal(nodeLearningPolicies.every((item) => item.publicationStatus === 'published'), true);
  assert.deepEqual(nodeLearningPolicies.filter((item) => item.assessmentRole === 'node-test').map((item) => item.nodeId), [
    'P1T1-N02',
    'P1T2-N02',
    'P1T3-N02',
  ]);
  assert.deepEqual(nodeLearningPolicies.filter((item) => item.assessmentRole === 'task-pixi').map((item) => item.nodeId), []);
  assert.deepEqual(nodeLearningPolicies.filter((item) => item.requiresTeacherVerification).map((item) => item.nodeId), [
    'P1T1-N04',
    'P1T2-N04',
    'P1T3-N04',
  ]);
  for (const prefix of ['P1T1', 'P1T2', 'P1T3']) {
    const testPolicy = getNodeLearningPolicy(`${prefix}-N02`)!;
    assert.equal(testPolicy.assessmentRole, 'node-test');
    assert.equal(testPolicy.requiresFormalTest, true);
    assert.equal(testPolicy.formalPassScore, 80);

    const outputPolicy = getNodeLearningPolicy(`${prefix}-N04`)!;
    assert.equal(outputPolicy.assessmentRole, 'none');
    assert.equal(outputPolicy.requiresFormalTest, false);
    assert.equal(outputPolicy.formalPassScore, undefined);
    assert.equal(outputPolicy.requiresProfessionalOutput, true);
    assert.equal(outputPolicy.requiresTeacherVerification, true);
  }
  assert.deepEqual(getNodeLearningPolicy('P1T3-N01')?.prerequisiteNodeIds, ['P1T2-N04']);
  assert.deepEqual(getNodeLearningPolicy('P1T3-N01')?.prerequisites, [{
    nodeId: 'P1T2-N04',
    condition: 'achieved',
  }]);
});

test('task-end state records output submission and certification without a second formal test', () => {
  const policy = getNodeLearningPolicy('P1T1-N04')!;

  const tested = deriveNodeLearningProjection(policy, {
    prerequisiteMet: true,
    hasActivity: true,
    microPracticePassed: true,
    evidenceReviewStatus: 'not-submitted',
  });
  assert.equal(tested.state, 'micro-practice-passed');
  assert.equal(tested.achieved, false);
  assert.equal(tested.stateTrail.includes('formal-test-passed'), false);

  const submitted = deriveNodeLearningProjection(policy, {
    prerequisiteMet: true,
    hasActivity: true,
    microPracticePassed: true,
    evidenceReviewStatus: 'submitted',
  });
  assert.equal(submitted.state, 'awaiting-review');
  assert.deepEqual(submitted.stateTrail.slice(-2), ['evidence-submitted', 'awaiting-review']);

  const returned = deriveNodeLearningProjection(policy, {
    prerequisiteMet: true,
    hasActivity: true,
    microPracticePassed: true,
    evidenceReviewStatus: 'returned',
  });
  assert.equal(returned.state, 'returned');

  const verified = deriveNodeLearningProjection(policy, {
    prerequisiteMet: true,
    hasActivity: true,
    microPracticePassed: true,
    evidenceReviewStatus: 'verified',
  });
  assert.equal(verified.state, 'achieved');
  assert.deepEqual(verified.stateTrail.slice(-2), ['teacher-verified', 'achieved']);
});

test('ordinary node skips output review only because its policy says so', () => {
  const policy = getNodeLearningPolicy('P1T1-N01')!;
  const projection = deriveNodeLearningProjection(policy, {
    prerequisiteMet: true,
    hasActivity: true,
    microPracticePassed: true,
    evidenceReviewStatus: 'not-submitted',
  });
  assert.equal(projection.state, 'achieved');
  assert.equal(projection.achieved, true);
});
