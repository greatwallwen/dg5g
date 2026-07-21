import type { PlaybackScene } from '@/platform/models';
import type { DemoTaskProfile, DemoUnit } from '@/features/platform/deep-textbook-demo-data';
import { p01TeachingPackage } from './classroom-lesson-model.ts';

type DemoTaskId = DemoTaskProfile['taskId'];

export function playbackSceneForLearningUnit(unit: DemoUnit, taskId: DemoTaskId): PlaybackScene {
  const prefix = `${unit.capabilityNodeId}-lesson`;
  if (unit.capabilityNodeId === 'P1T1-N02') {
    return {
      sceneId: prefix,
      title: `${taskId} · ${unit.title}`,
      presenterId: 'teacher-zhang',
      actions: p01TeachingPackage.flatMap(({ pages }) => pages).map((page) => {
        const narration = p01AcceptedNarration[page.id];
        return speech(
          `${prefix}-${page.id.toLowerCase()}`,
          page.id,
          page.title,
          narration?.spokenText ?? page.teacherExplanation,
          narration ? {
            audioId: narration.audioId,
            audioUrl: `/media/tts/qwen-cherry/${narration.audioId.toLowerCase()}.wav`,
          } : undefined,
        );
      }),
    };
  }
  return {
    sceneId: prefix,
    title: `${taskId} · ${unit.title}`,
    presenterId: 'teacher-zhang',
    actions: [
      speech(`${prefix}-case`, 'learning-case', unit.question, `先看问题：${unit.question} 不要急着下结论，先明确这一步要判断什么。`),
      speech(`${prefix}-visual`, 'learning-visual', '看图建立对象关系', `${unit.summary} 请把图中的对象、位置和连接方向对应起来。`),
      speech(`${prefix}-procedure`, 'learning-procedure', '按工程顺序完成判断', `判断分三步：${unit.steps.join('；')}。顺序不能颠倒。`),
      speech(`${prefix}-correction`, 'learning-correction', '对照反例完成纠偏', `常见错误是：${unit.counterexample} 正确做法是：${unit.correction}`),
      speech(`${prefix}-practice`, 'learning-practice', '完成当前微练习', `现在完成一个短练习，检验你能否独立完成“${unit.action}”。`),
      speech(`${prefix}-output`, 'learning-output', '形成可复核学习成果', `本节点最终要形成“${unit.output}”，提交证据是：${unit.requiredEvidence}。`),
    ],
  };
}

const p01AcceptedNarration: Record<string, { audioId: string; spokenText: string }> = {
  'P01-L1-P01': {
    audioId: 'P01-story-speech-006',
    spokenText: '室内信息采集要先锁定资源边界：机房位置、机柜编号、BBU、AAU/RRU、电源、传输、接地和温控共同决定站点可用性。',
  },
  'P01-L1-P03': {
    audioId: 'P01-story-speech-011',
    spokenText: '设备记录不止列型号，还要说明端口、光纤、电源线和传输承载的连接关系，后续定位才知道从哪一段查起。',
  },
  'P01-L1-P04': {
    audioId: 'P01-story-speech-012',
    spokenText: '设备拓扑说明链路走到哪一步；端口、光纤、电源线、传输分别对应角色、接口、状态和约束。',
  },
  'P01-L2-P03': {
    audioId: 'P01-story-speech-014',
    spokenText: '不要把端口、光纤、电源线、传输中的单个事件当作完整流程；缺少前后文会误判断点。',
  },
  'P01-L2-P05': {
    audioId: 'P01-story-speech-021',
    spokenText: '现场证据要能对应机柜、端口和走线路径，表单字段要能追溯到实体对象，避免后续复核时只剩孤立图片。',
  },
  'P01-L2-P06': {
    audioId: 'P01-story-speech-023',
    spokenText: '把机柜、端口、走线、证据回连到照片、日志、表单或网管记录，确认每个结论都有来源。',
  },
};

function speech(id: string, targetId: string, caption: string, spokenText: string, audio?: { audioId: string; audioUrl: string }) {
  return {
    id,
    type: 'speech' as const,
    targetId,
    caption,
    spokenText,
    audioId: audio?.audioId,
    audioUrl: audio?.audioUrl,
    durationMs: Math.max(2600, spokenText.length * 115),
    layer: 'content' as const,
    focusKind: 'spotlight' as const,
  };
}
