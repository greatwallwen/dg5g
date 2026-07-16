import type { TeachingAction } from '@dgbook/animation';
import type { ClassSession, PlaybackAction, PlaybackScene } from '@/platform/models';

export type WebPlaybackCursor = NonNullable<ClassSession['playbackCursor']>;

export function buildPlaybackCursor(scene: PlaybackScene, action: PlaybackAction, actionIndex: number): WebPlaybackCursor {
  const targetId = action.targetId ?? action.elementId;
  return {
    sceneId: scene.sceneId,
    actionId: action.id,
    actionIndex,
    actionType: action.type,
    targetId,
    caption: action.caption ?? action.spokenText ?? scene.title,
    updatedAt: new Date().toISOString(),
  };
}

export function toTeachingAction(action: PlaybackAction): TeachingAction {
  const target = action.targetId ?? action.elementId;
  return {
    id: action.id,
    type: action.type === 'caption' ? 'speech' : action.type,
    elementId: target,
    target,
    text: action.spokenText ?? action.caption ?? '',
    spokenText: action.spokenText ?? action.caption,
    caption: action.caption,
    displayText: action.caption,
    widgetId: action.widgetId,
    audioUrl: action.audioUrl,
    durationMs: action.durationMs,
    focusPolicy: target ? 'hold' : 'none',
  };
}
