import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import type { SkillProgress } from '../../platform/models.ts';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) return nextResolve(new URL(`../../${specifier.slice(2)}.ts`, import.meta.url).href, context);
    if (specifier.startsWith('.') && !specifier.endsWith('.ts')) return nextResolve(`${specifier}.ts`, context);
    return nextResolve(specifier, context);
  },
});

const { projectTeacherReviewUi } = await import('./teacher-review-ui-model.ts');

test('P1T1 teaching context resolves review to canonical N04 rather than N02', () => {
  const model = projectTeacherReviewUi('P1T1-N02', progress({
    nodeId: 'P1T1-N04',
    learningState: 'awaiting-review',
    learningStateTrail: ['learning', 'micro-practice-passed', 'formal-test-passed', 'evidence-submitted', 'awaiting-review'],
    professionalOutputId: 'output-01',
    professionalOutputVersion: 2,
  }), { serverActorReady: true });

  assert.equal(model.reviewNodeId, 'P1T1-N04');
  assert.equal(model.canReturn, true);
  assert.equal(model.canVerify, true);
  assert.deepEqual(model.reviewTarget, { outputId: 'output-01', expectedVersion: 2 });
});

test('teacher review controls stay disabled until the server actor resolver is wired', () => {
  const model = projectTeacherReviewUi('P1T1-N02', progress({
    nodeId: 'P1T1-N04',
    learningState: 'awaiting-review',
    professionalOutputId: 'output-01',
    professionalOutputVersion: 2,
  }));

  assert.equal(model.canReturn, false);
  assert.equal(model.canVerify, false);
  assert.equal(model.authorizationMessage, '系统登录身份尚未接入，当前不能执行教师复核。');
});

test('N02 evidence-shaped data cannot create a teacher review target', () => {
  const model = projectTeacherReviewUi('P1T1-N02', progress({
    nodeId: 'P1T1-N02',
    learningState: 'formal-test-passed',
    learningStateTrail: ['learning', 'micro-practice-passed', 'formal-test-passed'],
    professionalOutputId: 'forged-n02-output',
    professionalOutputVersion: 1,
  }));

  assert.equal(model.reviewNodeId, 'P1T1-N04');
  assert.equal(model.canReturn, false);
  assert.equal(model.canVerify, false);
  assert.equal(model.reviewTarget, undefined);
});

function progress(overrides: Partial<SkillProgress>): SkillProgress {
  return {
    studentId: 'stu-01',
    nodeId: 'P1T1-N04',
    state: 'learning',
    masteryPercent: 80,
    completedSectionIds: [],
    requiredSectionIds: [],
    classroomSubmitted: false,
    gameScore: 80,
    gameStars: 0,
    mistakeKnowledgePointIds: [],
    evidenceSubmitted: true,
    evidenceReviewStatus: 'submitted',
    teacherVerified: false,
    ...overrides,
  };
}
