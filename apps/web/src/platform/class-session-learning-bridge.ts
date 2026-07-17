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
      const latestAttempt = session.formalTest?.runId
        ? undefined
        : progress.gameAttempts?.filter((attempt) => (
            attempt.origin === 'user'
            && attempt.assessmentId === session.formalTest?.assessmentId
          )).at(-1);
      const { score: _score, durationSeconds: _durationSeconds, ...identity } = participant;
      if (!latestAttempt) return {
        ...identity,
        state: participant.state === 'playing' ? 'playing' as const : 'waiting' as const,
      };
      return {
        ...identity,
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
  const latestAttempt = progress.gameAttempts?.filter(({ origin }) => origin === 'user').at(-1);
  const {
    firstGameScore: _firstGameScore,
    bestGameScore: _bestGameScore,
    latestGameScore: _latestGameScore,
    attemptCount: _attemptCount,
    gameDurationSeconds: _gameDurationSeconds,
    mistakeKnowledgePointIds: _mistakeKnowledgePointIds,
    evidenceReviewStatus: _evidenceReviewStatus,
    evidenceText: _evidenceText,
    teacherFeedback: _teacherFeedback,
    teacherVerified: _teacherVerified,
    ...identity
  } = student;
  const selfStudyState = progress.completedSectionIds.length === 0
    ? 'not_started' as const
    : progress.completedSectionIds.length >= progress.requiredSectionIds.length
      ? 'completed' as const
      : 'in_progress' as const;
  const submissionState = progress.evidenceReviewStatus === 'not-submitted'
    ? 'draft' as const
    : progress.evidenceReviewStatus === 'submitted'
      ? 'submitted' as const
      : 'reviewed' as const;
  return {
    ...identity,
    activeNodeId: nodeId,
    selfStudyState,
    submissionState,
    evidenceCount: progress.evidenceSubmitted ? 1 : 0,
    risk: progress.bestGameScore === undefined
      ? 'watch'
      : progress.bestGameScore >= 80 ? 'ok' : progress.bestGameScore >= 60 ? 'watch' : 'help',
    ...(progress.firstGameScore === undefined ? {} : { firstGameScore: progress.firstGameScore }),
    ...(progress.bestGameScore === undefined ? {} : { bestGameScore: progress.bestGameScore }),
    ...(progress.latestGameScore === undefined ? {} : { latestGameScore: progress.latestGameScore }),
    attemptCount: progress.attemptCount ?? 0,
    ...(latestAttempt?.durationSeconds === undefined ? {} : { gameDurationSeconds: latestAttempt.durationSeconds }),
    mistakeKnowledgePointIds: progress.mistakeKnowledgePointIds,
    evidenceReviewStatus: progress.evidenceReviewStatus,
    ...(progress.evidenceText === undefined ? {} : { evidenceText: progress.evidenceText }),
    ...(progress.teacherFeedback === undefined ? {} : { teacherFeedback: progress.teacherFeedback }),
    teacherVerified: progress.teacherVerified,
    lastAction: describeLastAction(progress, '暂无真实学习记录'),
  };
}

function describeLastAction(progress: SkillProgress, fallback: string): string {
  if (progress.teacherVerified) return '教师已核验证据';
  if (progress.evidenceReviewStatus === 'returned') return '教师已退回证据';
  if (progress.evidenceReviewStatus === 'submitted') return '已提交学习证据';
  if (progress.latestGameScore !== undefined) return `完成测验，最新得分 ${progress.latestGameScore} 分`;
  if (progress.completedSectionIds.length) return `完成 ${progress.completedSectionIds.length} 个学习环节`;
  return fallback;
}
