import type { GameItem } from '@dgbook/edugame-core';
import { CLASSIFICATION_REJECT_TARGET_ID } from './ClassificationRunArcade';

export function uniqueTargets(items: GameItem[]): GameItem[] {
  const ids = new Set<string>();
  return items.map((item) => ({ id: item.target_id || item.id, label: item.definition || item.target_id || item.label })).filter((item) => item.id && !ids.has(item.id) && ids.add(item.id));
}

export function targetLabel(targetId: string, targets: GameItem[]): string {
  if (targetId === CLASSIFICATION_REJECT_TARGET_ID) return '干扰项回收';
  return targets.find((target) => target.id === targetId)?.label || targetId || '目标门';
}

export function expectedTargetLabel(item: GameItem, targets: GameItem[]): string {
  if (item.correct === false) return '避开干扰项';
  return targetLabel(item.target_id || item.id, targets) || item.definition || item.answer || '正确目标';
}

export function wrongFeedback(item: GameItem, expected: string, chosen?: string): string {
  const itemLabel = compactText(item.label || item.prompt || item.text || item.id, 18);
  const selected = chosen ? `你选了「${compactText(chosen, 18)}」，` : '';
  const explanation = item.explanation ? `原因：${compactText(item.explanation, 34)}` : '原因：这条证据不能支撑当前判断。';
  return `「${itemLabel}」${selected}正确应是「${compactText(expected, 18)}」。${explanation}`;
}

export function compactText(text: string, max = 48): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}
