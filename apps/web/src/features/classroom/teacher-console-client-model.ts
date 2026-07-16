import type { SkillProgress } from '@/platform/models';
import type { SessionPatch } from './use-class-session';

export function projectSelectedStudentReview(
  studentId: string,
  reviewNodeId: string,
  progress: SkillProgress,
  durationSeconds: number | undefined,
  action: string,
): NonNullable<SessionPatch['studentProgress']> {
  return {
    studentId,
    activeNodeId: reviewNodeId,
    firstGameScore: progress.firstGameScore,
    bestGameScore: progress.bestGameScore,
    latestGameScore: progress.latestGameScore,
    attemptCount: progress.attemptCount,
    gameDurationSeconds: durationSeconds,
    mistakeKnowledgePointIds: progress.mistakeKnowledgePointIds,
    evidenceReviewStatus: progress.evidenceReviewStatus,
    evidenceText: progress.evidenceText,
    teacherFeedback: progress.teacherFeedback,
    teacherVerified: progress.teacherVerified,
    submissionState: progress.evidenceReviewStatus === 'submitted' ? 'submitted' : 'reviewed',
    lastAction: action,
  };
}

export function formatDuration(durationSeconds: number | undefined): string {
  return durationSeconds === undefined ? '-' : `${durationSeconds} 秒`;
}

export function reviewStatusLabel(status: SkillProgress['evidenceReviewStatus']): string {
  if (status === 'submitted') return '待复核';
  if (status === 'returned') return '已退回';
  if (status === 'verified') return '已认证';
  return '未提交';
}
