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

const { projectChallengeScene } = await import('./challenge-scene-model.ts');

test('N02 challenge never invents professional output or teacher verification requirements', () => {
  const model = projectChallengeScene('P1T1-N02', progress({
    bestGameScore: 100,
    learningState: 'learning',
    learningStateTrail: ['learning'],
  }));

  assert.equal(model.kind, 'challenge');
  assert.equal(model.formalTestPassed, false);
  assert.equal(model.requiresProfessionalOutput, false);
  assert.equal(model.requiresTeacherVerification, false);
  assert.equal(model.formalPassScore, 80);
});

test('N04 is not projected as a formal challenge because it is an output-only node', () => {
  const model = projectChallengeScene('P1T3-N04', progress({
    nodeId: 'P1T3-N04',
    bestGameScore: 80,
    learningState: 'awaiting-review',
    learningStateTrail: ['learning', 'micro-practice-passed', 'formal-test-passed', 'evidence-submitted', 'awaiting-review'],
  }));

  assert.deepEqual(model, { kind: 'unavailable' });
});

test('unknown nodes fail closed instead of receiving a challenge policy', () => {
  assert.deepEqual(projectChallengeScene('P1T9-N99'), { kind: 'unavailable' });
});

function progress(overrides: Partial<SkillProgress>): SkillProgress {
  return {
    studentId: 'stu-01',
    nodeId: 'P1T1-N02',
    state: 'learning',
    masteryPercent: 20,
    completedSectionIds: [],
    requiredSectionIds: [],
    classroomSubmitted: false,
    gameScore: 0,
    gameStars: 0,
    mistakeKnowledgePointIds: [],
    evidenceSubmitted: false,
    evidenceReviewStatus: 'not-submitted',
    teacherVerified: false,
    ...overrides,
  };
}
