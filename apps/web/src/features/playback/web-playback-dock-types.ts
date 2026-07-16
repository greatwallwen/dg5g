import type { ClassSession, ClassroomPlaybackState, PlaybackScene } from '@/platform/models';
import type { WebPlaybackCursor } from './web-playback-actions';

export type WebPlaybackDockProps = {
  scene: PlaybackScene;
  audioEnabled?: boolean;
  authoritativePlayback?: ClassroomPlaybackState;
  controlMode?: 'interactive' | 'display';
  variant?: 'dock' | 'track' | 'game-strip';
  pauseAfterActionIds?: string[];
  externalCursor?: ClassSession['playbackCursor'];
  onCursorChange?: (cursor: WebPlaybackCursor | null) => void;
  onPlaybackStateChange?: (change: WebPlaybackStateChange) => void;
};

export type WebPlaybackStateChange =
  | { status: 'playing'; actionId: string; actionIndex: number; rate: number }
  | { status: 'paused' }
  | { status: 'ended' };
