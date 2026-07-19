import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { ClassroomLessonIntent } from '@/platform/classroom-state';
import type {
  ClassScoreSnapshot,
  SnapshotSubmissionMetrics,
  TeacherAuthoritativeSnapshot,
} from '@/platform/authoritative-snapshot';
import type { ClassSession, PlaybackScene } from '@/platform/models';
import type { AuthoritativeDomFacts } from '../snapshot/snapshot-dom-facts';
import type { P1TeachingPage } from '../textbook-scene/p1-teaching-package';

export interface TeacherConsoleViewProps {
  authoritativeFacts: AuthoritativeDomFacts;
  displayName: string;
  playbackOpen: boolean;
  setPlaybackOpen: Dispatch<SetStateAction<boolean>>;
  pageIndex: number;
  pageCount: number;
  pages: readonly P1TeachingPage[];
  controlMode: string;
  profile: any;
  unit: any;
  rosterStats: { total: number; follow: number; self: number; needsHelp: number; submitted: number };
  controlsAvailable: boolean;
  cursorControlsAvailable: boolean;
  connectionStatus: 'offline' | 'online' | 'degraded';
  onlineStudentDeviceCount: number;
  session: ClassSession;
  inspectorOpen: boolean;
  closeInspector: () => void;
  setInspectorOpen: Dispatch<SetStateAction<boolean>>;
  inspectorButtonRef: RefObject<HTMLButtonElement>;
  inspectorTab: 'script' | 'learning' | 'review';
  setInspectorTab: Dispatch<SetStateAction<'script' | 'learning' | 'review'>>;
  deliveryStats: { applied: number; failed: number; pending: number };
  teacherScript: string[];
  teachingPage: P1TeachingPage;
  formalAssessment: SnapshotSubmissionMetrics['activeAssessment'];
  classScores: ClassScoreSnapshot;
  submittedAnswers: string[];
  connection: { state: string };
  verificationActionState: string;
  activePlayback: PlaybackScene;
  submitIntent: (intent: ClassroomLessonIntent) => Promise<boolean>;
  go: (pageIndex: number) => void;
  startLesson: () => void;
  pauseLesson: () => void;
  resumeLesson: () => void;
  startFormalTest: () => void;
  pauseFormalTest: () => void;
  resumeFormalTest: () => void;
  collectFormalTest: () => void;
  beginReview: () => void;
  pushPage: () => void;
  endLesson: () => void;
  commandBusy: boolean;
  verificationMessage: string;
}

export function sessionFromTeacherSnapshot(
  snapshot: TeacherAuthoritativeSnapshot,
  lessonState: ClassSession['lessonState'],
): ClassSession {
  const activeLesson = snapshot.classroom.activeLesson;
  const cursor = activeLesson?.cursor;
  return {
    sessionId: snapshot.classroom.sessionId,
    sessionStatus: snapshot.classroom.status,
    ...(activeLesson ? {
      activeLessonRunId: activeLesson.runId,
      lessonRunStatus: activeLesson.status,
      teachingCursor: activeLesson.cursor,
    } : {}),
    ...(snapshot.classroom.activeTaskId ? { activeTaskId: snapshot.classroom.activeTaskId } : {}),
    ...(snapshot.classroom.activeNodeId ? { activeNodeId: snapshot.classroom.activeNodeId } : {}),
    ...(snapshot.classroom.activeUnitId ? { activeUnitId: snapshot.classroom.activeUnitId } : {}),
    ...(lessonState ? { lessonState } : {}),
    teacherSlideId: cursor?.actionId ?? 'waiting',
    teacherSlideIndex: (cursor?.pageIndex ?? 0) + 1,
    sceneMode: cursor?.phase === 'assessment' ? 'challenge' : cursor?.phase === 'review' ? 'review' : 'learning',
    studentMode: 'follow',
    playbackCursor: cursor ? {
      sceneId: `${cursor.nodeId}-lesson`, actionId: cursor.actionId,
      actionIndex: cursor.actionIndex, updatedAt: cursor.updatedAt,
    } : null,
    activityState: 'not_pushed',
    submissionState: 'draft',
    reviewState: snapshot.submissions.activeAssessment.status === 'reviewing' ? 'reviewing' : 'not_started',
    studentRoster: [],
  };
}

export interface AssessmentCountdownBaseline {
  snapshotVersion: number;
  serverNow: string;
  receivedAtMs: number;
}

export function synchronizeAssessmentCountdownBaseline(
  current: AssessmentCountdownBaseline | undefined,
  snapshotVersion: number,
  serverNow: string,
  receivedAtMs: number,
): AssessmentCountdownBaseline {
  if (current
    && current.snapshotVersion === snapshotVersion
    && current.serverNow === serverNow) return current;
  return { snapshotVersion, serverNow, receivedAtMs };
}
