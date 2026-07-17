import assert from 'node:assert/strict';
import test from 'node:test';
import { getNodeLearningPolicy } from './learning-policy.ts';
import {
  arePrerequisitesMet,
  deriveNodeLearningProjection,
  deriveNodeStateAxes,
  type LearningFacts,
  type PrerequisiteProgress,
} from './learning-projection.ts';
import { nodeLearningStateLabel } from './learning-status.ts';

const inactiveFacts: LearningFacts = {
  hasActivity: false,
  microPracticePassed: false,
  evidenceReviewStatus: 'not-submitted',
};

test('all learning states expose precise Chinese labels', () => {
  assert.equal(nodeLearningStateLabel.locked, '未解锁');
  assert.equal(nodeLearningStateLabel['formal-test-passed'], '正式测试达标');
  assert.equal(nodeLearningStateLabel['awaiting-review'], '待教师复核');
  assert.equal(nodeLearningStateLabel.achieved, '能力达成');
});

test('same-task and cross-task prerequisites require their explicit user facts', () => {
  const sameTask = getNodeLearningPolicy('P1T1-N02')!;
  const crossTask = getNodeLearningPolicy('P1T2-N01')!;

  assert.equal(arePrerequisitesMet(sameTask.prerequisites, [progress('P1T1-N01', {
    microPracticePassed: false,
  })]), false);
  assert.equal(arePrerequisitesMet(sameTask.prerequisites, [progress('P1T1-N01', {
    microPracticePassed: true,
  })]), true);

  assert.equal(arePrerequisitesMet(crossTask.prerequisites, [progress('P1T1-N04', {
    professionalOutputSubmittedOnce: true,
  })]), false);
  assert.equal(arePrerequisitesMet(crossTask.prerequisites, [
    progress('P1T1-N02', { formalTestPassed: true }),
    progress('P1T1-N04', { professionalOutputSubmittedOnce: true }),
  ]), true);
});

test('task output ignores formal scores and waits for the professional output', () => {
  const policy = getNodeLearningPolicy('P1T1-N04')!;
  const projection = deriveNodeLearningProjection(policy, {
    hasActivity: true,
    microPracticePassed: true,
    bestFormalTestScore: 100,
    evidenceReviewStatus: 'not-submitted',
  }, [progress('P1T1-N03', { microPracticePassed: true })]);

  assert.equal(projection.state, 'micro-practice-passed');
  assert.equal(projection.achieved, false);
  assert.equal(projection.stateTrail.includes('formal-test-passed'), false);
  assert.equal(projection.nextRequirement, '提交《室内设备与链路证据表》');
});

test('returned output keeps submission history and returns to review after resubmission', () => {
  const policy = getNodeLearningPolicy('P1T1-N04')!;
  const prerequisite = [progress('P1T1-N03', { microPracticePassed: true })];
  const facts = {
    hasActivity: true,
    microPracticePassed: true,
    bestFormalTestScore: 86,
  } as const;

  const returned = deriveNodeLearningProjection(policy, {
    ...facts,
    evidenceReviewStatus: 'returned',
  }, prerequisite);
  assert.equal(returned.state, 'returned');
  assert.deepEqual(returned.stateTrail.slice(-3), ['evidence-submitted', 'awaiting-review', 'returned']);

  const resubmitted = deriveNodeLearningProjection(policy, {
    ...facts,
    evidenceReviewStatus: 'submitted',
  }, prerequisite);
  assert.equal(resubmitted.state, 'awaiting-review');
  assert.equal(resubmitted.nextRequirement, '等待教师按量规复核');
});

test('ordinary nodes skip stages only because policy explicitly disables them', () => {
  const policy = getNodeLearningPolicy('P1T1-N01')!;
  assert.equal(policy.assessmentRole, 'none');
  assert.equal(policy.requiresProfessionalOutput, false);
  assert.equal(policy.requiresTeacherVerification, false);

  const available = deriveNodeLearningProjection(policy, inactiveFacts, []);
  assert.equal(available.state, 'available');

  const achieved = deriveNodeLearningProjection(policy, {
    ...inactiveFacts,
    hasActivity: true,
    microPracticePassed: true,
  }, []);
  assert.equal(achieved.state, 'achieved');
  assert.deepEqual(achieved.stateTrail, ['learning', 'micro-practice-passed', 'achieved']);
});

test('five state axes keep task advancement separate from current certification', () => {
  const policy = getNodeLearningPolicy('P1T1-N04')!;
  const prerequisite = [progress('P1T1-N03', { microPracticePassed: true })];
  const base = {
    hasActivity: true,
    microPracticePassed: true,
    evidenceReviewStatus: 'returned' as const,
  };

  assert.deepEqual(deriveNodeStateAxes(policy, base, prerequisite), {
    access: 'open',
    learning: 'practice-passed',
    formalTest: 'not-required',
    output: 'returned',
    certification: 'pending-review',
  });
  const revising = deriveNodeLearningProjection(policy, {
    ...base,
    evidenceReviewStatus: 'not-submitted',
    outputState: 'revising',
  }, prerequisite);
  assert.equal(revising.state, 'returned');
  assert.equal(revising.nextRequirement, '按教师反馈修订并重新提交');

  const resubmitted = deriveNodeLearningProjection(policy, {
    ...base,
    evidenceReviewStatus: 'submitted',
    outputState: 'resubmitted',
  }, prerequisite);
  assert.equal(resubmitted.state, 'awaiting-review');
  assert.equal(resubmitted.axes.output, 'resubmitted');
  const verifiedWithoutCertification = deriveNodeLearningProjection(policy, {
    ...base,
    evidenceReviewStatus: 'verified',
    teacherVerified: false,
  }, prerequisite);
  assert.equal(verifiedWithoutCertification.axes.output, 'verified');
  assert.equal(verifiedWithoutCertification.axes.certification, 'pending-review');
  assert.equal(verifiedWithoutCertification.achieved, false);

  const certified = deriveNodeLearningProjection(policy, {
    ...base,
    evidenceReviewStatus: 'verified',
    teacherVerified: true,
  }, prerequisite);
  assert.equal(certified.axes.certification, 'achieved');
  assert.equal(certified.achieved, true);
});

test('formal-test axis projects a catalog-validated score boundary without inventing lifecycle states', () => {
  const policy = getNodeLearningPolicy('P1T1-N02')!;
  const prerequisite = [progress('P1T1-N01', { microPracticePassed: true })];
  const facts = {
    hasActivity: true,
    microPracticePassed: true,
    evidenceReviewStatus: 'not-submitted' as const,
  };

  assert.equal(deriveNodeStateAxes(policy, { ...facts, bestFormalTestScore: 79 }, prerequisite).formalTest, 'failed');
  assert.equal(deriveNodeStateAxes(policy, {
    ...facts,
    bestFormalTestScore: 79,
    formalAssessmentState: 'paused',
  }, prerequisite).formalTest, 'paused');
  assert.equal(deriveNodeStateAxes(policy, {
    ...facts,
    bestFormalTestScore: 79,
    formalAssessmentState: 'expired',
  }, prerequisite).formalTest, 'failed');
  assert.equal(deriveNodeStateAxes(policy, { ...facts, bestFormalTestScore: 80 }, prerequisite).formalTest, 'passed');
  assert.equal(deriveNodeStateAxes(policy, {
    ...facts,
    bestFormalTestScore: 80,
    formalAssessmentState: 'paused',
  }, prerequisite).formalTest, 'passed');
});

function progress(nodeId: string, overrides: Partial<PrerequisiteProgress>): PrerequisiteProgress {
  return {
    nodeId,
    microPracticePassed: false,
    formalTestPassed: false,
    professionalOutputSubmittedOnce: false,
    teacherVerified: false,
    ...overrides,
  };
}
