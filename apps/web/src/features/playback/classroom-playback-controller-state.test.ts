import assert from 'node:assert/strict';
import test from 'node:test';
import type { ClassroomLessonState, PlaybackScene } from '@/platform/models.ts';
import { controllerFrame } from './classroom-playback-controller-state.ts';

const scene: PlaybackScene = {
  sceneId: 'P1T1-N02-lesson',
  title: 'P01 · 设备拓扑',
  actions: ['case', 'visual', 'procedure'].map((suffix) => ({
    id: `P1T1-N02-lesson-${suffix}`,
    type: 'speech' as const,
    targetId: `learning-${suffix}`,
    caption: suffix,
  })),
};

const lesson: ClassroomLessonState = {
  phase: 'lecture',
  activeNodeId: 'P1T1-N02',
  activeUnitId: 'P01-ku-02',
  revision: 8,
  playback: {
    sceneId: scene.sceneId,
    actionId: 'P1T1-N02-lesson-visual',
    actionIndex: 1,
    status: 'playing',
    startedAt: '2026-07-13T06:00:00.000Z',
    positionMs: 4200,
    rate: 1,
    revision: 8,
    audioOwner: 'teacher',
  },
};

test('hydrates the controller from the authoritative action and position', () => {
  const frame = controllerFrame(scene, lesson, 'teacher');

  assert.equal(frame.actionIndex, 1);
  assert.equal(frame.actionId, 'P1T1-N02-lesson-visual');
  assert.equal(frame.positionMs, 4200);
  assert.equal(frame.audioEnabled, true);
  assert.equal(frame.pauseStalePlaybackOnMount, true);
});

test('never grants audio to the non-owner surface', () => {
  const frame = controllerFrame(scene, lesson, 'projector');

  assert.equal(frame.audioEnabled, false);
  assert.equal(frame.pauseStalePlaybackOnMount, false);
});
