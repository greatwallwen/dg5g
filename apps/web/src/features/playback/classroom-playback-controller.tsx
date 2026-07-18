'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { ClassroomLessonIntent } from '@/platform/classroom-state';
import type {
  ClassroomAudioOwner,
  ClassroomLessonState,
  PlaybackScene,
} from '@/platform/models';
import { controllerFrame } from './classroom-playback-controller-state';
import {
  WebPlaybackDock,
  type WebPlaybackStateChange,
} from './web-playback-dock';

type SubmitIntent = (intent: ClassroomLessonIntent) => Promise<boolean>;

export function ClassroomPlaybackController({
  lesson,
  pauseAfterActionIds,
  scene,
  submitIntent,
  surface,
  variant = 'track',
}: {
  lesson: ClassroomLessonState;
  pauseAfterActionIds?: string[];
  scene: PlaybackScene;
  submitIntent: SubmitIntent;
  surface: ClassroomAudioOwner;
  variant?: 'dock' | 'track' | 'game-strip';
}) {
  const reconciledSceneRef = useRef<string>();
  const frame = controllerFrame(scene, lesson, surface);

  useEffect(() => {
    if (reconciledSceneRef.current === scene.sceneId) return;
    reconciledSceneRef.current = scene.sceneId;
    if (frame.pauseStalePlaybackOnMount) void submitIntent({ type: 'playback_paused' });
  }, [frame.pauseStalePlaybackOnMount, scene.sceneId, submitIntent]);

  const handlePlaybackState = useCallback(async (change: WebPlaybackStateChange) => {
    if (!frame.audioEnabled) return;
    if (change.status === 'playing') {
      const phase = lesson.phase;
      if (phase === 'challenge') await submitIntent({ type: 'phase_changed', phase: 'review' });
      if (phase !== 'lecture' && phase !== 'close') {
        await submitIntent({ type: 'phase_changed', phase: 'lecture' });
      }
      await submitIntent({
        type: 'playback_started',
        actionId: change.actionId,
        actionIndex: change.actionIndex,
        rate: change.rate,
      });
      return;
    }
    await submitIntent({ type: change.status === 'ended' ? 'playback_ended' : 'playback_paused' });
  }, [frame.audioEnabled, lesson.phase, submitIntent]);

  return (
    <WebPlaybackDock
      audioEnabled={frame.audioEnabled}
      authoritativePlayback={lesson.playback}
      controlMode={frame.audioEnabled ? 'interactive' : 'display'}
      onPlaybackStateChange={handlePlaybackState}
      pauseAfterActionIds={pauseAfterActionIds}
      scene={scene}
      variant={variant}
    />
  );
}
