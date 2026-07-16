import type { ClassSession, PlaybackScene, StudentProgress, TeacherSlide } from '../models';
import { activeDemoNodeId, activeDemoSessionIds } from './ids';
import { nodes, tasks } from './base-fixtures';
import { sessionProfiles } from './session-profiles';
import { getNodeLearningPolicy } from '../learning-policy';

export const p1TeacherSlides: TeacherSlide[] = teacherSlidesForSession(activeDemoNodeId);

export const p1PlaybackScene: PlaybackScene = playbackSceneForSession(activeDemoNodeId);

export class ClassSessionAccessError extends Error {
  constructor(sessionId: string) {
    super(`Class session is not open: ${sessionId}`);
    this.name = 'ClassSessionAccessError';
  }
}

export class ClassSessionRosterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClassSessionRosterError';
  }
}

export function isP1ClassSession(sessionId: string): boolean {
  return Boolean(openSessionNodeId(sessionId));
}

export function normalizeClassSessionId(sessionId: string): string {
  if (!isP1ClassSession(sessionId)) throw new ClassSessionAccessError(sessionId);
  return sessionId;
}

export function initialClassSessionFor(
  sessionId: string,
  studentRoster: readonly StudentProgress[],
): ClassSession {
  const normalizedSessionId = normalizeClassSessionId(sessionId);
  return buildClassSession(nodeIdForSession(normalizedSessionId), normalizedSessionId, studentRoster);
}

export function nodeIdForSession(sessionId: string): string {
  const nodeId = openSessionNodeId(sessionId);
  if (!nodeId) throw new ClassSessionAccessError(sessionId);
  return nodeId;
}

export function taskIdForSession(sessionId: string): string {
  return profileForSession(sessionId).taskId;
}

export function teacherSlidesForSession(sessionId: string): TeacherSlide[] {
  const nodeId = nodeIdForSession(sessionId);
  const profile = profileForSession(nodeId);
  return profile.slides.map(([title, subtitle, focus], index) => ({
    slideId: `${nodeId}-S0${index + 1}`,
    nodeId,
    pageIndex: index + 1,
    title,
    subtitle,
    focus,
    visualTitle: profile.visualTitle,
    script: [
      `先用本页问题框定：${title}。`,
      `把“${subtitle}”对应到页面图形、证据卡和学生任务。`,
      `收束到判断口径：${focus}`,
    ],
    questions: [{ id: `${nodeId}-q${index + 1}`, prompt: `如果缺少“${title}”，后续复核会出现什么风险？`, thinkingTime: index === 2 ? '60秒' : '30秒' }],
  }));
}

export function playbackSceneForSession(sessionId: string): PlaybackScene {
  const nodeId = nodeIdForSession(sessionId);
  const profile = profileForSession(nodeId);
  const prefix = canonicalTaskIdForNode(nodeId);
  const [s1, s2, s3, s4, s5] = profile.slides;
  return {
    sceneId: `${nodeId}-playback`,
    title: profile.sceneTitle,
    presenterId: 'teacher-zhang',
    actions: [
      { id: `${nodeId}-a1`, type: 'speech', targetId: 'collection-flow', audioId: `${prefix}-stage-speech-001`, caption: s1[0], spokenText: s1[2], durationMs: 1400, layer: 'content' },
      { id: `${nodeId}-a2`, type: 'spotlight', targetId: 'collection-flow', caption: s1[1], durationMs: 1800, layer: 'content' },
      { id: `${nodeId}-a3`, type: 'laser', targetId: 'site-room', caption: s2[1], durationMs: 2200, layer: 'content' },
      { id: `${nodeId}-a4`, type: 'speech', targetId: 'site-room', audioId: `${prefix}-stage-speech-004`, caption: s2[0], spokenText: s2[2], durationMs: 1400, layer: 'content', focusKind: 'laser' },
      { id: `${nodeId}-a5`, type: 'laser', targetId: 'device-kit', caption: s3[1], durationMs: 2200, layer: 'content' },
      { id: `${nodeId}-a6`, type: 'speech', targetId: 'device-kit', audioId: `${prefix}-stage-speech-007`, caption: s3[0], spokenText: s3[2], durationMs: 1400, layer: 'content', focusKind: 'laser' },
      { id: `${nodeId}-a7`, type: 'spotlight', targetId: 'device-kit', caption: s3[1], durationMs: 1800, layer: 'content' },
      { id: `${nodeId}-a8`, type: 'speech', targetId: 'photo-log', audioId: `${prefix}-stage-speech-010`, caption: s4[0], spokenText: s4[2], durationMs: 1500, layer: 'content', focusKind: 'laser' },
      { id: `${nodeId}-a9`, type: 'laser', targetId: 'photo-log', caption: s4[1], durationMs: 2200, layer: 'content' },
      { id: `${nodeId}-a10`, type: 'speech', targetId: 'review-chain', audioId: `${prefix}-stage-speech-012`, caption: s5[0], spokenText: s5[2], durationMs: 1600, layer: 'content', focusKind: 'laser' },
      { id: `${nodeId}-a11`, type: 'laser', targetId: 'review-chain', caption: s5[1], durationMs: 2200, layer: 'content' },
      { id: `${nodeId}-a12`, type: 'laser', targetId: 'collection-conclusion', caption: '结论要说明能否进入复核。', durationMs: 2200, layer: 'content' },
    ],
  };
}

function sessionBaseId(sessionId: string): string | undefined {
  return activeDemoSessionIds.find((id) => sessionId === id || sessionId.startsWith(`${id}-`));
}

function openSessionNodeId(sessionId: string): string | undefined {
  const nodeId = sessionBaseId(sessionId);
  if (!nodeId) return undefined;
  return getNodeLearningPolicy(nodeId)?.publicationStatus === 'published' ? nodeId : undefined;
}

function profileForSession(sessionId: string) {
  const nodeId = nodeIdForSession(sessionId);
  return sessionProfiles[nodeId as keyof typeof sessionProfiles] ?? genericSessionProfile(nodeId);
}

function buildClassSession(
  nodeId: string,
  sessionId: string,
  suppliedRoster: readonly StudentProgress[],
): ClassSession {
  if (suppliedRoster.length === 0) {
    throw new ClassSessionRosterError(`Class session has no active students: ${sessionId}`);
  }
  const uniqueStudentIds = new Set(suppliedRoster.map(({ studentId }) => studentId));
  if (uniqueStudentIds.size !== suppliedRoster.length) {
    throw new ClassSessionRosterError(`Class session roster contains duplicate students: ${sessionId}`);
  }
  const nodeIndex = Number(nodeId.slice(-1)) || 1;
  const slideId = `${nodeId}-S0${nodeIndex}`;
  const activeTaskId = canonicalTaskIdForNode(nodeId);
  const studentRoster = suppliedRoster.map((student) => ({ ...student, activeNodeId: nodeId }));
  return {
    sessionId,
    currentPageId: 'P1-TEACH-CONSOLE-N01',
    currentSlideId: slideId,
    teacherSlideId: slideId,
    teacherSlideIndex: nodeIndex,
    sceneMode: 'learning',
    activeTaskId,
    activeNodeId: nodeId,
    activeUnitId: `${activeTaskId}-ku-0${nodeIndex}`,
    studentMode: 'follow',
    studentSyncState: 'idle',
    syncRequestId: 'initial',
    playbackCursor: { sceneId: `${nodeId}-playback`, actionId: `${nodeId}-a1`, actionIndex: 0 },
    lastUpdatedAt: '2026-07-02T00:00:00.000Z',
    activityState: 'pushed',
    submissionState: 'draft',
    submissionAnswers: [],
    reviewState: 'not_started',
    selfStudyState: 'not_started',
    selfStudyAnswers: [],
    studentRoster,
    formalTest: {
      assessmentId: `AS-${nodeId}`,
      gameId: `${nodeId}-formal-test`,
      nodeId,
      status: 'idle',
      durationSeconds: 360,
      extendedSeconds: 0,
      participants: studentRoster.map((student) => ({
        studentId: student.studentId,
        state: student.latestGameScore === undefined ? 'waiting' : 'submitted',
        ...(student.latestGameScore === undefined ? {} : { score: student.latestGameScore }),
        ...(student.gameDurationSeconds === undefined ? {} : { durationSeconds: student.gameDurationSeconds }),
      })),
    },
  };
}

function canonicalTaskIdForNode(nodeId: string): 'P01' | 'P02' | 'P03' {
  const policy = getNodeLearningPolicy(nodeId);
  if (policy?.publicationStatus !== 'published') throw new ClassSessionAccessError(nodeId);
  if (policy.taskId === 'P01' || policy.taskId === 'P02' || policy.taskId === 'P03') {
    return policy.taskId;
  }
  throw new ClassSessionAccessError(nodeId);
}

function genericSessionProfile(nodeId: string) {
  const node = nodes.find((item) => item.nodeId === nodeId);
  if (!node) throw new ClassSessionAccessError(nodeId);
  const task = tasks.find((item) => item.taskId === node.taskId);
  if (!task) throw new ClassSessionAccessError(nodeId);
  return {
    taskId: node.taskId,
    visualTitle: `${node.nodeId} ${node.title}：${node.goal}`,
    sceneTitle: `${node.title}重点讲解`,
    slides: [
      [`先定位${node.shortTitle}`, node.goal, `先把${node.title}放回${task.title}的工程场景，确认它解决什么问题。`],
      ['读取输入证据', task.evidenceFrom, `本节点的判断不能只看一句描述，要回到${task.evidenceFrom}这些证据来源。`],
      ['核对复核标准', task.standards.join('、'), `用${task.standards.join('、')}检查资料是否能进入下一步复核。`],
      ['形成节点判断', node.output, `把证据和标准连起来，形成${node.title}的可交付判断。`],
      ['服务任务闭环', task.conclusion, `最后把本节点结论放回任务闭环，支撑${task.conclusion}`],
    ],
  };
}
