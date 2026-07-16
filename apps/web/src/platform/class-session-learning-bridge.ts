import type { ClassSession, SkillProgress, StudentProgress } from './models.ts';
import { getSkillProgress } from './skill-progress-store.ts';

export function hydrateClassSessionLearning(session: ClassSession): ClassSession {
  const nodeId = session.formalTest?.nodeId ?? session.activeNodeId;
  if (!nodeId) return session;

  const studentRoster = session.studentRoster.map((student) => hydrateStudent(student, nodeId));
  const studentProgress = session.studentProgress
    ? studentRoster.find((student) => student.studentId === session.studentProgress?.studentId)
      ?? hydrateStudent(session.studentProgress, nodeId)
    : undefined;
  const formalTest = session.formalTest && {
    ...session.formalTest,
    participants: session.formalTest.participants.map((participant) => {
      const progress = getSkillProgress(participant.studentId, nodeId);
      const latestAttempt = progress.gameAttempts?.at(-1);
      if (!latestAttempt) return participant;
      return {
        ...participant,
        state: 'submitted' as const,
        score: latestAttempt.score,
        durationSeconds: latestAttempt.durationSeconds,
      };
    }),
  };

  return { ...session, studentRoster, studentProgress, formalTest: formalTest ?? undefined };
}

function hydrateStudent(student: StudentProgress, nodeId: string): StudentProgress {
  const progress = getSkillProgress(student.studentId, nodeId);
  if (!hasLiveActivity(progress)) return student;

  const latestAttempt = progress.gameAttempts?.at(-1);
  return {
    ...student,
    activeNodeId: nodeId,
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
    lastAction: describeLastAction(progress, student.lastAction),
  };
}

function hasLiveActivity(progress: SkillProgress): boolean {
  return Boolean(
    progress.updatedAt
    || progress.attemptCount
    || progress.completedSectionIds.length
    || progress.classroomSubmitted
    || progress.evidenceSubmitted
    || progress.evidenceReviewStatus !== 'not-submitted',
  );
}

function describeLastAction(progress: SkillProgress, fallback: string): string {
  if (progress.teacherVerified) return '教师已核验证据';
  if (progress.evidenceReviewStatus === 'returned') return '教师已退回证据';
  if (progress.evidenceReviewStatus === 'submitted') return '已提交学习证据';
  if (progress.latestGameScore !== undefined) return `完成测验，最新得分 ${progress.latestGameScore} 分`;
  if (progress.completedSectionIds.length) return `完成 ${progress.completedSectionIds.length} 个学习环节`;
  return fallback;
}
