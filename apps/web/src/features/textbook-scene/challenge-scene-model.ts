import { getNodeLearningPolicy } from '../../platform/learning-policy';
import type { SkillProgress } from '../../platform/models';

export type ChallengeSceneModel =
  | { kind: 'unavailable' }
  | {
    kind: 'challenge';
    formalPassScore: number;
    formalTestPassed: boolean;
    requiresProfessionalOutput: boolean;
    requiresTeacherVerification: boolean;
    achieved: boolean;
  };

export function projectChallengeScene(nodeId: string, progress?: SkillProgress): ChallengeSceneModel {
  const policy = getNodeLearningPolicy(nodeId);
  if (!policy || policy.publicationStatus !== 'published' || !policy.requiresFormalTest) {
    return { kind: 'unavailable' };
  }

  const stateTrail = progress?.learningStateTrail ?? [];
  return {
    kind: 'challenge',
    formalPassScore: policy.formalPassScore ?? 80,
    formalTestPassed: stateTrail.includes('formal-test-passed'),
    requiresProfessionalOutput: policy.requiresProfessionalOutput,
    requiresTeacherVerification: policy.requiresTeacherVerification,
    achieved: progress?.learningState === 'achieved',
  };
}
