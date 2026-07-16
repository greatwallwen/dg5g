import type {
  ClassroomAudioOwner,
  ClassroomLessonState,
  PlaybackScene,
} from '@/platform/models.ts';

export type ClassroomPlaybackControllerFrame = {
  actionId: string;
  actionIndex: number;
  audioEnabled: boolean;
  pauseStalePlaybackOnMount: boolean;
  positionMs: number;
  revision: number;
};

export function controllerFrame(
  scene: PlaybackScene,
  lesson: ClassroomLessonState,
  surface: ClassroomAudioOwner,
): ClassroomPlaybackControllerFrame {
  const playback = lesson.playback;
  const sceneMatches = playback.sceneId === scene.sceneId;
  const lastIndex = Math.max(0, scene.actions.length - 1);
  const actionIndex = sceneMatches
    ? Math.max(0, Math.min(lastIndex, Math.trunc(playback.actionIndex)))
    : 0;
  const action = scene.actions[actionIndex];
  const audioEnabled = sceneMatches && playback.audioOwner === surface;

  return {
    actionId: action?.id ?? playback.actionId,
    actionIndex,
    audioEnabled,
    pauseStalePlaybackOnMount: audioEnabled && playback.status === 'playing',
    positionMs: sceneMatches ? Math.max(0, playback.positionMs) : 0,
    revision: lesson.revision,
  };
}
