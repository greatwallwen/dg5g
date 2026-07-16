import assert from 'node:assert/strict';
import test from 'node:test';
import type { ClassroomPlaybackState, PlaybackScene } from '@/platform/models.ts';
import { followerFrame } from './classroom-playback-frame.ts';

const scene: PlaybackScene = {
  sceneId: 'P1T1-N02-lesson',
  title: 'P01 · 设备拓扑',
  presenterId: 'teacher-zhang',
  actions: ['case', 'visual', 'procedure', 'correction', 'practice', 'output'].map((suffix, index) => ({
    id: `P1T1-N02-lesson-${suffix}`,
    type: 'speech' as const,
    targetId: `learning-${suffix}`,
    caption: `第${index + 1}段`,
    spokenText: `第${index + 1}段`,
  })),
};

function playback(overrides: Partial<ClassroomPlaybackState> = {}): ClassroomPlaybackState {
  return {
    sceneId: scene.sceneId,
    actionId: scene.actions[0]!.id,
    actionIndex: 0,
    status: 'idle',
    positionMs: 0,
    rate: 1,
    revision: 0,
    audioOwner: 'teacher',
    ...overrides,
  };
}

test('maps the authoritative action to a silent follower frame', () => {
  const frame = followerFrame(scene, playback({
    actionId: 'P1T1-N02-lesson-correction',
    actionIndex: 3,
    status: 'playing',
    revision: 7,
  }));

  assert.equal(frame.targetId, 'learning-correction');
  assert.equal(frame.caption, '第4段');
  assert.equal(frame.actionIndex, 3);
  assert.equal(frame.progress, 67);
  assert.equal(frame.audioEnabled, false);
  assert.equal(frame.revision, 7);
});

test('clamps an invalid action index without inventing audio ownership', () => {
  const frame = followerFrame(scene, playback({ actionIndex: 99, actionId: 'missing' }));

  assert.equal(frame.actionIndex, 5);
  assert.equal(frame.targetId, 'learning-output');
  assert.equal(frame.audioEnabled, false);
});
