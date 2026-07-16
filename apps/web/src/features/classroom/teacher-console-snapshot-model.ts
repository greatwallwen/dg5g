import type {
  SnapshotSubmissionMetrics,
  TeacherAuthoritativeSnapshot,
} from '@/platform/authoritative-snapshot.ts';
import type { StudentSyncState } from '@/platform/models.ts';
import { nodeLearningStateCompletionPercent } from '@/platform/learning-status.ts';
import type { TeacherSkillPulseProgress } from '@/features/skill-tree/teacher-skill-pulse.tsx';

export interface TeacherConsoleSnapshotModel {
  rosterStats: {
    total: number;
    follow: number;
    self: number;
    submitted: number;
    needsHelp: number;
  };
  controlMode: 'forced' | 'mixed' | 'follow';
  classroomActivity: SnapshotSubmissionMetrics['classroomActivity'];
  formalAssessment: SnapshotSubmissionMetrics['activeAssessment'];
  professionalOutputs: SnapshotSubmissionMetrics['professionalOutputs'];
  classScores: TeacherAuthoritativeSnapshot['classScores'];
  helper: TeacherAuthoritativeSnapshot['helper'];
}

export function projectTeacherConsoleSnapshot(
  snapshot: TeacherAuthoritativeSnapshot,
  studentSyncState: StudentSyncState | undefined,
): TeacherConsoleSnapshotModel {
  const selfCount = Math.max(0, snapshot.membership.joinedCount - snapshot.membership.followingCount);
  const activeWeakPoint = snapshot.weakPoints.find(({ nodeId }) => (
    nodeId === snapshot.classroom.activeNodeId
  ));
  return {
    rosterStats: {
      total: snapshot.membership.classSize,
      follow: snapshot.membership.followingCount,
      self: selfCount,
      submitted: snapshot.submissions.classroomActivity.submittedCount,
      needsHelp: activeWeakPoint?.attentionCount ?? 0,
    },
    controlMode: studentSyncState === 'forced'
      ? 'forced'
      : selfCount > 0
        ? 'mixed'
        : 'follow',
    classroomActivity: snapshot.submissions.classroomActivity,
    formalAssessment: snapshot.submissions.activeAssessment,
    professionalOutputs: snapshot.submissions.professionalOutputs,
    classScores: snapshot.classScores,
    helper: snapshot.helper,
  };
}

export function projectTeacherSkillPulse(
  snapshot: TeacherAuthoritativeSnapshot,
  nodeId: string,
): TeacherSkillPulseProgress | undefined {
  const node = snapshot.students[0]?.nodes.find((candidate) => candidate.nodeId === nodeId);
  if (!node) return undefined;
  return {
    learningState: node.state,
    stateCompletionPercent: nodeLearningStateCompletionPercent[node.state],
    ...(node.nodeTestHighestScore === undefined ? {} : {
      nodeTestHighestScore: node.nodeTestHighestScore,
    }),
  };
}
