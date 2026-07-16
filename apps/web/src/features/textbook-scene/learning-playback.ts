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
      actions: p01TeachingPackage.flatMap(({ pages }) => pages).map((page) => speech(
        `${prefix}-${page.id.toLowerCase()}`,
        page.id,
        page.title,
        page.teacherExplanation,
      )),
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
      speech(`${prefix}-output`, 'learning-output', '形成可复核学习产出', `本节点最终要形成“${unit.output}”，提交证据是：${unit.requiredEvidence}。`),
    ],
  };
}

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
