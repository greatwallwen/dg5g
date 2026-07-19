import type {
  SnapshotSubmissionMetrics,
  TeacherAuthoritativeSnapshot,
} from '@/platform/authoritative-snapshot.ts';
import type { StudentSyncState } from '@/platform/models.ts';
import { nodeLearningStateCompletionPercent } from '@/platform/learning-status.ts';
import type { TeacherSkillPulseProgress } from '@/features/skill-tree/teacher-skill-pulse.tsx';
import { teachingPageFor, type P1TeachingPage } from '@/features/textbook-scene/p1-teaching-package.ts';
import type { ClassroomLessonState } from '@/platform/models.ts';

export interface TeacherClassroomCut {
  lessonRunId: string;
  lessonId: NonNullable<TeacherAuthoritativeSnapshot['classroom']['activeLesson']>['lessonId'];
  revision: number;
  pageIndex: number;
  pageCount: number;
  page: P1TeachingPage;
  lessonState: ClassroomLessonState;
}

export function projectTeacherClassroomCut(
  snapshot: TeacherAuthoritativeSnapshot,
): TeacherClassroomCut | undefined {
  const activeLesson = snapshot.classroom.activeLesson;
  if (!activeLesson) return undefined;
  const cursor = activeLesson.cursor;
  const phase = cursor.phase === 'assessment' ? 'challenge' : cursor.phase;
  return {
    lessonRunId: activeLesson.runId,
    lessonId: activeLesson.lessonId,
    revision: activeLesson.revision,
    pageIndex: cursor.pageIndex,
    pageCount: activeLesson.pageCount,
    page: teachingPageFor(activeLesson.lessonId, cursor.pageIndex),
    lessonState: {
      phase,
      activeNodeId: cursor.nodeId,
      activeUnitId: cursor.unitId,
      revision: cursor.revision,
      playback: {
        sceneId: `${cursor.nodeId}-lesson`,
        actionId: cursor.actionId,
        actionIndex: cursor.actionIndex,
        status: cursor.playbackStatus,
        positionMs: cursor.positionMs,
        rate: cursor.rate,
        revision: cursor.revision,
        audioOwner: cursor.audioOwner,
      },
    },
  };
}

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
