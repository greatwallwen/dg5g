import type { ClassroomPlaybackState, PlaybackScene } from '@/platform/models.ts';

export type ClassroomPlaybackFollowerFrame = {
  actionId: string;
  actionIndex: number;
  audioEnabled: false;
  caption: string;
  progress: number;
  revision: number;
  status: ClassroomPlaybackState['status'];
  targetId?: string;
};

export function followerFrame(
  scene: PlaybackScene,
  playback: ClassroomPlaybackState,
): ClassroomPlaybackFollowerFrame {
  const lastIndex = Math.max(0, scene.actions.length - 1);
  const actionIndex = Math.max(0, Math.min(lastIndex, Math.trunc(playback.actionIndex)));
  const action = scene.actions[actionIndex];

  return {
    actionId: action?.id ?? playback.actionId,
    actionIndex,
    audioEnabled: false,
    caption: action?.caption ?? action?.spokenText ?? scene.title,
    progress: scene.actions.length ? Math.round(((actionIndex + 1) / scene.actions.length) * 100) : 0,
    revision: playback.revision,
    status: playback.status,
    targetId: action?.targetId ?? action?.elementId,
  };
}
