import {
  activeDemoSessionId,
  activities,
  assessments,
  chapterCapabilityMaps,
  graphData,
  nodeIdForSession,
  nodes,
  playbackSceneForSession,
  projects,
  resources,
  teacherSlidesForSession,
  tasks,
} from './fixtures';
import {
  isActiveDemoNode as isActiveDemoNodeAccess,
  isActiveDemoProject as isActiveDemoProjectAccess,
  isActiveDemoSession as isActiveDemoSessionAccess,
  isActiveDemoTask as isActiveDemoTaskAccess,
  resolveNodeId,
  resolveProjectId,
  resolveSessionId,
  resolveTaskId,
} from './access-control';
import { withManifestAudioUrls } from './audio-manifest-adapter';
import { getClassSession } from './class-session-store';
import { projectClassSession } from './class-session-projection';
import type {
  AbilityNode,
  CapabilityMapModel,
  ClassSession,
  GraphData,
  LearningRecord,
  PlaybackScene,
  Project,
  ResourceCard,
  Task,
  TeacherSlide,
} from './models';
import type { GameConfig } from '@dgbook/edugame-core';
import { skillGameForNode } from './fixtures/skill-game-fixtures';

export async function getStudentSelfStudy(nodeId: string, sessionId = activeDemoSessionId): Promise<{
  node: AbilityNode;
  task: Task;
  resources: ResourceCard[];
  activities: typeof activities;
  assessments: typeof assessments;
  playback: PlaybackScene;
  session: ClassSession;
  gameConfig?: GameConfig;
}> {
  const effectiveNodeId = resolveNodeId(nodeId);
  const node = mustFind(nodes, (item) => item.nodeId === effectiveNodeId, `node ${effectiveNodeId}`);
  const task = mustFind(tasks, (item) => item.taskId === node.taskId, `task ${node.taskId}`);
  const effectiveSessionId = resolveSessionId(sessionId === activeDemoSessionId ? effectiveNodeId : sessionId);
  return {
    node,
    task,
    resources: resources.filter((item) => item.nodeId === effectiveNodeId),
    activities: activities.filter((item) => item.nodeId === effectiveNodeId),
    assessments: assessments.filter((item) => item.nodeId === effectiveNodeId),
    playback: withManifestAudioUrls(playbackSceneForSession(effectiveNodeId)),
    session: getClassSession(effectiveSessionId),
    gameConfig: skillGameForNode(node, task),
  };
}

export async function getCapabilityGraph(focusNodeId = 'P1T1-N01'): Promise<GraphData> {
  const effectiveFocusNodeId = resolveNodeId(focusNodeId);
  return {
    ...graphData,
    views: graphData.views.map((item) => ({ ...item, focusNodeId: effectiveFocusNodeId })),
  };
}

export async function getTeacherSession(sessionId: string): Promise<{
  session: ClassSession;
  slides: TeacherSlide[];
  task: Task;
  playback: PlaybackScene;
}> {
  const session = getClassSession(sessionId);
  const activeNodeId = resolveNodeId(session.activeNodeId ?? '');
  const node = mustFind(nodes, (item) => item.nodeId === activeNodeId, activeNodeId);
  const task = mustFind(tasks, (item) => item.taskId === node.taskId, node.taskId);
  return {
    session,
    slides: teacherSlidesForSession(activeNodeId),
    task,
    playback: withManifestAudioUrls(playbackSceneForSession(activeNodeId)),
  };
}

export async function getProjectorState(sessionId: string) {
  const teacher = await getTeacherSession(sessionId);
  return {
    ...teacher,
    slides: teacher.slides.map((slide) => ({
      ...slide,
      focus: '',
      script: [],
      questions: [],
    })),
    session: projectClassSession(teacher.session, 'projector'),
  };
}

export async function getStudentFollowState(sessionId: string, studentId: string) {
  const teacher = await getTeacherSession(sessionId);
  const nodeId = nodeIdForSession(sessionId);
  return {
    ...teacher,
    session: projectClassSession(teacher.session, 'student', studentId),
    slides: teacher.slides.map((slide) => ({
      ...slide,
      script: [],
      questions: [],
    })),
    node: mustFind(nodes, (item) => item.nodeId === nodeId, nodeId),
    activity: activities.find((item) => item.nodeId === nodeId),
  };
}

export async function getPlaybackScene(_sceneId: string): Promise<PlaybackScene> {
  return withManifestAudioUrls(playbackSceneForSession(_sceneId));
}

export async function updateTeacherSlide(sessionId: string, slideId: string): Promise<ClassSession> {
  const effectiveSessionId = resolveSessionId(sessionId);
  const slides = teacherSlidesForSession(effectiveSessionId);
  const slide = mustFind(slides, (item) => item.slideId === slideId, `slide ${slideId}`);
  return { ...getClassSession(effectiveSessionId), teacherSlideId: slideId, teacherSlideIndex: slide.pageIndex };
}

export async function setStudentMode(sessionId: string, mode: ClassSession['studentMode']): Promise<ClassSession> {
  return { ...getClassSession(resolveSessionId(sessionId)), studentMode: mode };
}

export async function submitActivity(record: LearningRecord): Promise<void> {
  void record;
}

function mustFind<T>(items: T[], predicate: (item: T) => boolean, label: string): T {
  const found = items.find(predicate);
  if (!found) throw new Error(`Mock data missing: ${label}`);
  return found;
}

export function isActiveDemoProject(projectId: string): boolean {
  return isActiveDemoProjectAccess(projectId);
}

export function isActiveDemoTask(taskId: string): boolean {
  return isActiveDemoTaskAccess(taskId);
}

export function isActiveDemoNode(nodeId: string): boolean {
  return isActiveDemoNodeAccess(nodeId);
}

export function isActiveDemoSession(sessionId: string): boolean {
  return isActiveDemoSessionAccess(sessionId);
}
