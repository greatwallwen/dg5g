import type { TeacherWorkbenchSnapshot } from '../home/role-home-types.ts';

export type TeacherWorkbenchViewModel = TeacherWorkbenchReadyViewModel | TeacherWorkbenchBlockedViewModel;

export interface TeacherWorkbenchReadyViewModel {
  kind: 'ready';
  displayName: string;
  courseTitle: string;
  classroom: TeacherWorkbenchSnapshot['classroom'] & { memberCount: number };
  lastPosition?: TeacherWorkbenchSnapshot['lastPosition'];
  continueAction: { label: '继续授课'; href?: string; disabled: boolean };
  newLesson: {
    sessionId: string;
    expectedRevision: number;
    trigger: { label: '开始新课'; clickStep: 1 };
    options: Array<{ nodeId: string; title: string; clickStep: 2 }>;
  };
  classSummary: TeacherWorkbenchSnapshot['classSummary'];
  scoreCards: Array<{ label: string; value: string; tone: 'current' | 'review' | 'muted' }>;
  graphAction: { label: '课程能力图谱'; href: '/course' };
}

export interface TeacherWorkbenchBlockedViewModel {
  kind: 'blocked';
  displayName: string;
  blocker: { title: string; detail: string };
}

export function buildTeacherWorkbenchViewModel(snapshot: TeacherWorkbenchSnapshot): TeacherWorkbenchViewModel {
  if (snapshot.dataIssue) {
    return {
      kind: 'blocked',
      displayName: snapshot.displayName,
      blocker: { title: '授课工作台暂不可用', detail: snapshot.dataIssue },
    };
  }
  const canContinue = Boolean(snapshot.lastPosition?.nodeId) && snapshot.classroom.status !== 'closed';
  return {
    kind: 'ready',
    displayName: snapshot.displayName,
    courseTitle: snapshot.courseTitle,
    classroom: { ...snapshot.classroom, memberCount: snapshot.classSummary.memberCount },
    ...(snapshot.lastPosition ? { lastPosition: snapshot.lastPosition } : {}),
    continueAction: {
      label: '继续授课',
      href: canContinue ? `/teacher/sessions/${snapshot.classroom.id}` : undefined,
      disabled: !canContinue,
    },
    newLesson: {
      sessionId: snapshot.classroom.id,
      expectedRevision: snapshot.classroom.revision,
      trigger: { label: '开始新课', clickStep: 1 },
      options: snapshot.lessonOptions.map((option) => ({
        ...option,
        clickStep: 2,
      })),
    },
    classSummary: snapshot.classSummary,
    scoreCards: [
      scoreCard('节点测试最高分', snapshot.classScores.activeNodeTestHighestScore, 'current', snapshot.classScores.demoData),
      scoreCard('任务综合分', snapshot.classScores.activeTaskCompositeAverageScore, 'review', snapshot.classScores.demoData),
      scoreCard('项目综合分', snapshot.classScores.projectCompositeAverageScore, 'muted', snapshot.classScores.demoData),
    ],
    graphAction: { label: '课程能力图谱', href: '/course' },
  };
}

function scoreCard(
  label: string,
  value: number | undefined,
  tone: 'current' | 'review' | 'muted',
  demoData?: boolean,
) {
  return {
    label,
    value: value === undefined ? '尚未形成' : `${Math.round(value)}${demoData ? ' · 演示数据' : ''}`,
    tone,
  };
}
