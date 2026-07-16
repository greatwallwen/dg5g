import type { SkillProgress, StudentProgress } from '@/platform/models';

export const fallbackStudent: StudentProgress = {
  studentId: 'stu-01',
  name: '陈一鸣',
  group: 'A组',
  mode: 'follow',
  currentSlideIndex: 1,
  handledSyncRequestId: 'initial',
  selfStudyState: 'not_started',
  submissionState: 'draft',
  evidenceCount: 0,
  lastAction: '进入课堂跟随端。',
  risk: 'watch',
};

export function buildStudentProgress(
  student: StudentProgress,
  mode: StudentProgress['mode'],
  currentSlideIndex: number,
  evidenceCount: number,
  submissionState: StudentProgress['submissionState'],
  lastAction: string,
): StudentProgress {
  return {
    ...student,
    mode,
    currentSlideIndex,
    evidenceCount,
    submissionState,
    selfStudyState: evidenceCount >= 3 ? 'completed' : evidenceCount > 0 ? 'in_progress' : student.selfStudyState,
    lastAction,
    risk: submissionState === 'submitted' ? 'ok' : evidenceCount === 0 ? 'help' : mode === 'self' ? 'watch' : 'ok',
  };
}

export function buildFormalTestProgress(student: StudentProgress, progress: SkillProgress, lastAction: string): StudentProgress {
  const latestAttempt = progress.gameAttempts?.at(-1);
  return {
    ...student,
    activeNodeId: progress.nodeId,
    firstGameScore: progress.firstGameScore,
    bestGameScore: progress.bestGameScore,
    latestGameScore: progress.latestGameScore,
    attemptCount: progress.attemptCount,
    gameDurationSeconds: latestAttempt?.durationSeconds,
    mistakeKnowledgePointIds: progress.mistakeKnowledgePointIds,
    evidenceReviewStatus: progress.evidenceReviewStatus,
    evidenceText: progress.evidenceText,
    teacherFeedback: progress.teacherFeedback,
    teacherVerified: progress.teacherVerified,
    lastAction,
  };
}
