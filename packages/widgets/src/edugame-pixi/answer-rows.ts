import type { GameItem, GameType } from '@dgbook/edugame-core';

export interface AnswerRow {
  source: string;
  target: string;
}

export function buildAnswerRows(gameType: GameType, items: GameItem[], current?: GameItem): AnswerRow[] {
  if (gameType === 'match-3') {
    const groups = new Map<string, string[]>();
    for (const item of items.filter((entry) => entry.correct !== false)) {
      const label = item.definition || item.target_id || item.kp || '同类知识点';
      const values = groups.get(label) ?? [];
      values.push(item.label);
      groups.set(label, values);
    }
    return [...groups.entries()].slice(0, 8).map(([target, labels]) => ({
      source: target,
      target: labels.slice(0, 4).join(' / '),
    }));
  }
  if (gameType === 'quick-hit') {
    return items
      .filter((item) => item.correct !== false)
      .slice(0, 8)
      .map((item) => ({ source: item.label, target: item.definition || item.explanation || '应点击的目标' }));
  }
  if (gameType === 'quiz-rush' && current) {
    return [{
      source: current.label,
      target: current.definition || current.answer || current.target_id || current.explanation || '匹配的证据门',
    }];
  }
  if (gameType === 'memory-card') {
    return items.slice(0, 8).map((item) => ({
      source: item.label,
      target: item.definition || item.explanation || item.prompt || '对应定义',
    }));
  }
  if (gameType === 'sort-flow') {
    return [...items]
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
      .slice(0, 8)
      .map((item) => ({ source: `第 ${item.order ?? '-'} 步`, target: item.label }));
  }
  return items
    .slice(0, 8)
    .map((item) => ({
      source: item.label,
      target: item.correct === false ? '拦截干扰' : item.definition || item.target_id || item.explanation || '匹配目标',
    }));
}
