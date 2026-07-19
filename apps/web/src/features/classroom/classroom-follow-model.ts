import type { StudentAuthoritativeSnapshot } from '@/platform/authoritative-snapshot.ts';
import {
  classroomLessonPageCountFromCatalog,
  resolveClassroomLessonPage,
} from '@/platform/classroom-lesson-page-catalog.ts';
import type { TeachingCursorPhase } from '@/platform/teaching-cursor.ts';
import type { ActivityPublicDto } from '../learning-activities/activity-definition.ts';
import type { P1NodeId } from '../platform/p1-content.ts';
import {
  p1TeachingPackage,
  teachingPageFor,
  type ClassroomPageVisualRenderer,
  type P1FormalAssessmentTarget,
  type P1ProfessionalOutputTarget,
  type P1TeachingLessonId,
  type P1TeachingTaskId,
} from '../textbook-scene/p1-teaching-package.ts';
import type { SceneVisualId } from '../textbook-scene/scene-visual-contract.ts';

export type ClassroomActivityCatalog = Record<string, ActivityPublicDto>;

export interface SelfStudyReturnTarget {
  href: `/learn/${P1NodeId}` | '/student/home';
  nodeId?: P1NodeId;
}

export interface ClassroomFollowCursorView {
  lessonRunId: string;
  lessonId: P1TeachingLessonId;
  taskId: P1TeachingTaskId;
  nodeId: P1NodeId;
  unitId: string;
  pageId: string;
  pageIndex: number;
  pageCount: number;
  phase: TeachingCursorPhase;
  actionId: string;
  actionIndex: number;
  revision: number;
}

export interface ClassroomFollowViewModel {
  sessionId: string;
  sessionStatus: StudentAuthoritativeSnapshot['classroom']['status'];
  readOnly: boolean;
  cursor: ClassroomFollowCursorView;
  currentPage: {
    title: string;
    projectorTitle: string;
    material: string;
    visualCallouts: string[];
    teacherExplanation: string;
    caseQuestion: string;
    studentAction: string;
    transition: string;
    visualRenderer: ClassroomPageVisualRenderer;
    visualId: SceneVisualId;
  };
  teacherTask: {
    label: '教师任务';
    instruction: string;
    phaseLabel: string;
  };
  classroomActivity?: {
    activity: ActivityPublicDto;
    level: 'foundation' | 'application' | 'transfer';
    levelLabel: string;
  };
  formalAssessment?: P1FormalAssessmentTarget;
  professionalOutput?: P1ProfessionalOutputTarget;
  returnToSelfStudy: SelfStudyReturnTarget & { label: '返回完整自学' | '返回学习首页' };
}

export type ClassroomFollowModelResult =
  | { ok: true; value: ClassroomFollowViewModel }
  | {
      ok: false;
      reason: 'no-active-lesson' | 'cursor-mismatch' | 'activity-missing';
    };

export type ClassroomStudentScreen =
  | { kind: 'entry'; returnTarget: SelfStudyReturnTarget }
  | { kind: 'follow'; teacherRevision: number; returnTarget: SelfStudyReturnTarget }
  | { kind: 'self'; teacherRevision: number; hasTeacherUpdate: boolean; returnTarget: SelfStudyReturnTarget };

export function createClassroomActivityCatalog(
  activities: readonly ActivityPublicDto[],
): ClassroomActivityCatalog {
  return Object.fromEntries(activities.map((activity) => [activity.id, activity]));
}

export function alignClassroomActivityDraft<T extends { activityId: string }>(
  current: T,
  activityId: string,
): T | { activityId: string; answer: string; feedback: string } {
  return current.activityId === activityId
    ? current
    : { activityId, answer: '', feedback: '' };
}

export function buildClassroomFollowViewModel(
  snapshot: StudentAuthoritativeSnapshot,
  activityCatalog: ClassroomActivityCatalog,
  requestedReturnTarget?: SelfStudyReturnTarget,
): ClassroomFollowModelResult {
  const activeLesson = snapshot.classroom.activeLesson;
  if (!activeLesson) return { ok: false, reason: 'no-active-lesson' };
  const cursor = activeLesson.cursor;
  if (snapshot.classroom.revision !== activeLesson.revision
    || activeLesson.revision !== cursor.revision
    || activeLesson.runId !== cursor.lessonRunId
    || activeLesson.lessonId !== cursor.lessonId
    || snapshot.classroom.activeNodeId !== cursor.nodeId
    || snapshot.classroom.activeUnitId !== cursor.unitId) {
    return { ok: false, reason: 'cursor-mismatch' };
  }
  const resolvedPage = resolveClassroomLessonPage(cursor);
  if (!resolvedPage
    || activeLesson.pageCount !== classroomLessonPageCountFromCatalog(cursor.lessonId)
    || activeLesson.pageCount <= cursor.pageIndex) {
    return { ok: false, reason: 'cursor-mismatch' };
  }
  const page = teachingPageFor(cursor.lessonId, cursor.pageIndex);
  if (page.id !== cursor.pageId
    || page.nodeId !== cursor.nodeId
    || page.taskId !== cursor.taskId
    || resolvedPage.canonicalActivityIds.length > 1) {
    return { ok: false, reason: 'cursor-mismatch' };
  }
  const activityId = resolvedPage.canonicalActivityIds[0];
  const activity = activityId ? activityCatalog[activityId] : undefined;
  if (activityId && (!activity || activity.nodeId !== cursor.nodeId)) {
    return { ok: false, reason: 'activity-missing' };
  }
  const classroomActivity = activity ? activityView(activity) : undefined;
  return {
    ok: true,
    value: {
      sessionId: snapshot.classroom.sessionId,
      sessionStatus: snapshot.classroom.status,
      readOnly: snapshot.classroom.status === 'paused' || activeLesson.status === 'paused',
      cursor: {
        lessonRunId: activeLesson.runId,
        lessonId: cursor.lessonId,
        taskId: cursor.taskId,
        nodeId: cursor.nodeId as P1NodeId,
        unitId: cursor.unitId,
        pageId: cursor.pageId,
        pageIndex: cursor.pageIndex,
        pageCount: activeLesson.pageCount,
        phase: cursor.phase,
        actionId: cursor.actionId,
        actionIndex: cursor.actionIndex,
        revision: cursor.revision,
      },
      currentPage: {
        title: page.title,
        projectorTitle: page.projectorContent.title,
        material: page.projectorContent.material,
        visualCallouts: [...page.projectorContent.visualCallouts],
        teacherExplanation: page.teacherExplanation,
        caseQuestion: page.caseQuestion,
        studentAction: page.studentAction,
        transition: page.transition,
        visualRenderer: resolvedPage.visualRenderer,
        visualId: resolvedPage.visualId,
      },
      teacherTask: {
        label: '教师任务',
        instruction: page.teacherExplanation,
        phaseLabel: classroomPhaseLabel(cursor.phase),
      },
      ...(classroomActivity ? { classroomActivity } : {}),
      ...(resolvedPage.formalAssessment ? { formalAssessment: resolvedPage.formalAssessment } : {}),
      ...(resolvedPage.professionalOutput ? { professionalOutput: resolvedPage.professionalOutput } : {}),
      returnToSelfStudy: returnTargetFor(requestedReturnTarget),
    },
  };
}

export function selectClassroomStudentScreen(input: {
  participation: { state: 'missing' | 'left' | 'joined'; mode?: 'follow' | 'self'; lastFollowedRevision?: number };
  teacherRevision: number;
  returnTarget?: SelfStudyReturnTarget;
  sessionStatus?: 'preparing' | 'active' | 'paused' | 'closed';
}): ClassroomStudentScreen {
  const returnTarget = input.returnTarget ?? { href: '/student/home' };
  if (input.sessionStatus === 'closed' || input.sessionStatus === 'preparing') {
    return { kind: 'entry', returnTarget };
  }
  if (input.participation.state !== 'joined') return { kind: 'entry', returnTarget };
  if (input.participation.mode === 'self') {
    return {
      kind: 'self',
      teacherRevision: input.teacherRevision,
      hasTeacherUpdate: input.teacherRevision > (input.participation.lastFollowedRevision ?? 0),
      returnTarget,
    };
  }
  return { kind: 'follow', teacherRevision: input.teacherRevision, returnTarget };
}

function activityView(activity: ActivityPublicDto): NonNullable<ClassroomFollowViewModel['classroomActivity']> {
  if (activity.id.includes('-application-')) {
    return { activity, level: 'application', levelLabel: '应用练习' };
  }
  if (activity.id.includes('-transfer-')) {
    return { activity, level: 'transfer', levelLabel: '迁移练习' };
  }
  return { activity, level: 'foundation', levelLabel: activity.id.includes('-micro-') ? '课堂练习' : '基础练习' };
}

const publishedNodeIds = new Set(
  p1TeachingPackage.flatMap(({ pages }) => pages.map(({ nodeId }) => nodeId)),
);

function returnTargetFor(
  target: SelfStudyReturnTarget | undefined,
): ClassroomFollowViewModel['returnToSelfStudy'] {
  if (target?.nodeId
    && publishedNodeIds.has(target.nodeId)
    && target.href === `/learn/${target.nodeId}`) {
    return { ...target, label: '返回完整自学' };
  }
  return { href: '/student/home', label: '返回学习首页' };
}

function classroomPhaseLabel(phase: TeachingCursorPhase): string {
  return {
    lecture: '教师讲解',
    question: '课堂提问',
    practice: '学生练习',
    assessment: '正式测试',
    review: '教师讲评',
    close: '本课完成',
  }[phase];
}
