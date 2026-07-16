import type { EngineMode, TeachingAction } from '@dgbook/animation';
import type { ClassroomPlaybackState, PlaybackAction, PlaybackScene } from '@/platform/models';
import type { PlaybackFocusKind } from './playback-focus-overlay';

export const DEFAULT_PLAYBACK_TRANSCRIPT = '课程讲解已就绪。';

export function getInitialTranscript(scene: PlaybackScene): string {
  return scene.actions[0]?.caption ?? DEFAULT_PLAYBACK_TRANSCRIPT;
}

export function getActionCaption(sourceAction: PlaybackAction | undefined, action: TeachingAction, fallback: string): string {
  return sourceAction?.caption ?? sourceAction?.displayText ?? action.caption ?? action.displayText ?? action.text ?? fallback;
}

export function getActionTarget(sourceAction: PlaybackAction | undefined, action: TeachingAction): string | undefined {
  return sourceAction?.targetId ?? sourceAction?.elementId ?? action.target ?? action.elementId;
}

export function getActionFocusKind(sourceAction: PlaybackAction | undefined, actionType: string): PlaybackFocusKind {
  return sourceAction?.focusKind ?? (actionType === 'laser' ? 'laser' : 'spotlight');
}

export function getPlaybackMode(mode: EngineMode): 'idle' | 'playing' | 'paused' {
  return mode === 'playing' ? 'playing' : mode === 'paused' ? 'paused' : 'idle';
}

export function getPlaybackStatus(mode: EngineMode): string {
  return mode === 'idle' ? '课程讲解已就绪。' : '正在讲解当前知识点。';
}

export function getAuthoritativeMode(playback: ClassroomPlaybackState): EngineMode {
  return playback.status === 'playing' ? 'playing' : playback.status === 'paused' ? 'paused' : 'idle';
}
