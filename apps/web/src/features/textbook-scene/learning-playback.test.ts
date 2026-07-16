import assert from 'node:assert/strict';
import test from 'node:test';
import type { DemoUnit } from '@/features/platform/deep-textbook-demo-data.ts';
import { playbackSceneForLearningUnit } from './learning-playback.ts';

const unit: DemoUnit = {
  id: 'P01-ku-02',
  capabilityNodeId: 'P1T1-N02',
  kind: 'concept',
  title: '设备拓扑',
  question: '照片怎样证明设备、槽位与端口属于同一条链？',
  summary: '识别设备、板卡、端口及连接方向。',
  points: ['机柜全景显示设备位置', '铭牌近景确认设备身份', '端口标签和走线方向同时入镜'],
  steps: ['定位机柜', '核对设备铭牌', '追踪端口与走线'],
  visualId: 'indoor-topology',
  counterexample: '只有设备近景，没有柜号和端口去向。',
  correction: '使用全景定位、铭牌确认、端口追踪三联证据。',
  action: '核对设备与端口标签',
  output: '设备拓扑',
  requiredEvidence: '机柜全景、设备铭牌和端口近景',
};

test('learning playback follows the twelve-page two-lesson teaching package', () => {
  const scene = playbackSceneForLearningUnit(unit, 'P01');
  assert.equal(scene.presenterId, 'teacher-zhang');
  assert.equal(scene.title, 'P01 · 设备拓扑');
  assert.deepEqual(
    scene.actions.filter((action) => action.type === 'speech').map((action) => action.targetId),
    [
      'P01-L1-P01', 'P01-L1-P02', 'P01-L1-P03', 'P01-L1-P04', 'P01-L1-P05', 'P01-L1-P06',
      'P01-L2-P01', 'P01-L2-P02', 'P01-L2-P03', 'P01-L2-P04', 'P01-L2-P05', 'P01-L2-P06',
    ],
  );
  assert.ok(scene.actions.every((action) => action.caption && action.spokenText));
  assert.ok(scene.actions.every((action) => action.durationMs >= 2_600));
});
