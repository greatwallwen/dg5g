import { getNodeLearningPolicy, nodeLearningPolicies } from '../../platform/learning-policy';
import type { SkillProgress } from '../../platform/models';

export interface TeacherReviewUiModel {
  reviewNodeId?: string;
  formalPassScore?: number;
  canReturn: boolean;
  canVerify: boolean;
  reviewTarget?: { outputId: string; expectedVersion: number };
  authorizationMessage?: string;
}

export function projectTeacherReviewUi(activeNodeId: string, progress?: SkillProgress, options: { serverActorReady?: boolean } = {}): TeacherReviewUiModel {
  const activePolicy = getNodeLearningPolicy(activeNodeId);
  if (!activePolicy) return { canReturn: false, canVerify: false };

  const reviewPolicy = nodeLearningPolicies.find((policy) =>
    policy.taskId === activePolicy.taskId
    && policy.requiresProfessionalOutput
    && policy.requiresTeacherVerification,
  );
  if (!reviewPolicy) return { canReturn: false, canVerify: false };

  const isCurrentSubmittedOutput = progress?.nodeId === reviewPolicy.nodeId
    && progress.learningState === 'awaiting-review'
    && progress.evidenceReviewStatus === 'submitted'
    && !progress.teacherVerified
    && Boolean(progress.professionalOutputId)
    && Number.isInteger(progress.professionalOutputVersion)
    && (progress.professionalOutputVersion ?? 0) > 0;
  const reviewTarget = isCurrentSubmittedOutput ? {
    outputId: progress!.professionalOutputId!,
    expectedVersion: progress!.professionalOutputVersion!,
  } : undefined;

  return {
    reviewNodeId: reviewPolicy.nodeId,
    formalPassScore: activePolicy.formalPassScore,
    canReturn: Boolean(reviewTarget) && options.serverActorReady === true,
    canVerify: Boolean(reviewTarget) && options.serverActorReady === true,
    reviewTarget,
    authorizationMessage: options.serverActorReady === true ? undefined : '系统登录身份尚未接入，当前不能执行教师复核。',
  };
}
