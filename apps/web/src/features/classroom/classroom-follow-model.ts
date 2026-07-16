import type { ActivityState, LessonPhase } from '@/platform/models';
import type { P1NodeId, P1TaskId } from '../platform/p1-content.ts';
import type { SelfStudyCatalog } from '../textbook-scene/self-study-types.ts';

export type ClassroomActivityViewState = 'waiting' | 'open' | 'submitted';

export interface ClassroomContentUnit {
  taskId: P1TaskId;
  nodeId: P1NodeId;
  unitId: string;
  title: string;
  question: string;
  summary: string;
  points: string[];
  visualId: string;
  teacherInstruction: string;
  activity: {
    id: string;
    nodeId: P1NodeId;
    prompt: string;
    expectedEvidence: string[];
  };
}

export type ClassroomContentCatalog = Record<P1NodeId, ClassroomContentUnit>;

export interface ClassroomSharedCursor {
  sessionId: string;
  revision: number;
  phase: LessonPhase;
  activeNodeId: string;
  activeUnitId: string;
  activityState: ActivityState;
}

export interface SelfStudyReturnTarget {
  href: `/learn/${P1NodeId}` | '/student/home';
  nodeId?: P1NodeId;
}

export interface ClassroomFollowViewModel {
  sessionId: string;
  revision: number;
  phase: LessonPhase;
  currentUnit: Omit<ClassroomContentUnit, 'teacherInstruction' | 'activity'>;
  teacherTask: {
    label: '教师任务';
    instruction: string;
    phaseLabel: string;
  };
  classroomActivity: ClassroomContentUnit['activity'] & { state: ClassroomActivityViewState };
  returnToSelfStudy: SelfStudyReturnTarget & { label: '返回完整自学' | '返回学习首页' };
}

export type ClassroomFollowModelResult =
  | { ok: true; value: ClassroomFollowViewModel }
  | { ok: false; reason: 'unknown-node' | 'unit-mismatch' };

export type ClassroomStudentScreen =
  | { kind: 'entry'; returnTarget: SelfStudyReturnTarget }
  | { kind: 'follow'; teacherRevision: number; returnTarget: SelfStudyReturnTarget }
  | { kind: 'self'; teacherRevision: number; hasTeacherUpdate: boolean; returnTarget: SelfStudyReturnTarget };

export interface ClassroomActivityDraft {
  activityId: string;
  answer: string;
  feedback: string;
}

export function createClassroomContentCatalog(catalog: SelfStudyCatalog): ClassroomContentCatalog {
  return Object.fromEntries(Object.values(catalog).map((document) => {
    const practice = document.content.kind === 'deep'
      ? document.content.practices.foundation[0]
      : document.content.microPractice[0];
    if (!practice) throw new Error(`Generated classroom activity is unavailable for ${document.nodeId}.`);
    const points = document.content.kind === 'deep'
      ? document.content.evidenceRules.map((rule) => `${rule.claim}：${rule.requiredEvidence.join('、')}`)
      : document.content.relationshipFigure.evidenceLabels;
    return [document.nodeId, {
      taskId: document.taskId,
      nodeId: document.nodeId,
      unitId: document.sourceKnowledgeUnitId,
      title: document.nodeTitle,
      question: document.content.kind === 'deep' ? document.content.taskQuestion : document.nodeGoal,
      summary: document.content.caseBackground.join(''),
      points,
      visualId: classroomVisualId(document),
      teacherInstruction: document.nodeGoal,
      activity: {
        id: practice.id,
        nodeId: document.nodeId,
        prompt: practice.prompt,
        expectedEvidence: [...practice.expectedEvidence],
      },
    } satisfies ClassroomContentUnit];
  })) as ClassroomContentCatalog;
}

export function buildClassroomFollowViewModel(
  cursor: ClassroomSharedCursor,
  catalog: ClassroomContentCatalog,
  requestedReturnTarget?: SelfStudyReturnTarget,
): ClassroomFollowModelResult {
  const unit = catalog[cursor.activeNodeId as P1NodeId];
  if (!unit) return { ok: false, reason: 'unknown-node' };
  if (unit.unitId !== cursor.activeUnitId) return { ok: false, reason: 'unit-mismatch' };
  const { teacherInstruction, activity, ...currentUnit } = unit;
  return {
    ok: true,
    value: {
      sessionId: cursor.sessionId,
      revision: cursor.revision,
      phase: cursor.phase,
      currentUnit,
      teacherTask: {
        label: '教师任务',
        instruction: teacherInstruction,
        phaseLabel: classroomPhaseLabel(cursor.phase),
      },
      classroomActivity: { ...activity, state: activityViewState(cursor.activityState) },
      returnToSelfStudy: returnTargetFor(requestedReturnTarget, catalog),
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
  if (input.sessionStatus && input.sessionStatus !== 'active') return { kind: 'entry', returnTarget };
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

export function alignClassroomActivityDraft(
  current: ClassroomActivityDraft,
  activityId: string,
): ClassroomActivityDraft {
  return current.activityId === activityId
    ? current
    : { activityId, answer: '', feedback: '' };
}

function returnTargetFor(
  target: SelfStudyReturnTarget | undefined,
  catalog: ClassroomContentCatalog,
): ClassroomFollowViewModel['returnToSelfStudy'] {
  if (target?.nodeId && catalog[target.nodeId] && target.href === `/learn/${target.nodeId}`) {
    return { ...target, label: '返回完整自学' };
  }
  return { href: '/student/home', label: '返回学习首页' };
}

function activityViewState(state: ActivityState): ClassroomActivityViewState {
  if (state === 'submitted') return 'submitted';
  if (state === 'pushed' || state === 'reviewing') return 'open';
  return 'waiting';
}

function classroomPhaseLabel(phase: LessonPhase): string {
  return {
    prepare: '课前准备', lecture: '教师讲解', question: '课堂提问', practice: '学生练习',
    challenge: '正式测试', review: '教师讲评', close: '本课完成',
  }[phase];
}

function classroomVisualId(document: SelfStudyCatalog[P1NodeId]): string {
  const kind = document.content.kind === 'deep'
    ? document.content.annotatedFigures[0]?.kind
    : document.content.relationshipFigure.kind;
  const visualIds: Record<string, string> = {
    topology: 'indoor-topology', antenna: 'antenna-posture', complaint: 'complaint-reproduction',
    'operating-conditions': 'indoor-condition', 'evidence-archive': 'indoor-evidence',
    'obstacle-evidence': 'outdoor-obstacle',
  };
  return visualIds[kind ?? ''] ?? kind ?? 'relationship-evidence';
}
