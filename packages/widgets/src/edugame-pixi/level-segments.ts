import type { GameItem, GameType } from '@dgbook/edugame-core';

export function targetCount(gameType: GameType, items: GameItem[]): number {
  const progressable = items.filter((item) => item.correct !== false).length;
  if (gameType === 'match-3') return Math.max(15, progressable * 2);
  if (gameType === 'classification-run') return Math.max(1, items.length);
  return gameType === 'memory-card' ? items.length : Math.max(1, progressable);
}

export function splitIntoLevels(gameType: GameType, items: GameItem[]): GameItem[][] {
  if (gameType === 'boss-review') return splitBossWaves(items);
  if (gameType === 'memory-card' || gameType === 'quick-hit' || gameType === 'match-3' || items.length < 6) return [items];
  const half = Math.ceil(items.length / 2);
  const a = items.slice(0, half);
  const b = items.slice(half);
  const progressable = (seg: GameItem[]) => seg.filter((item) => item.correct !== false).length;
  if (a.length < 3 || b.length < 3 || progressable(a) < 1 || progressable(b) < 1) return [items];
  return [a, b];
}

export function progressForSegments(
  gameType: GameType,
  segmentTargets: number[],
  levelStep: number,
  doneCount: number,
  fallbackTarget: number,
): number {
  if (gameType !== 'boss-review') return Math.min(1, doneCount / Math.max(1, fallbackTarget));
  const total = segmentTargets.reduce((sum, count) => sum + count, 0);
  const completedBefore = segmentTargets.slice(0, levelStep).reduce((sum, count) => sum + count, 0);
  return Math.min(1, (completedBefore + doneCount) / Math.max(1, total));
}

function splitBossWaves(items: GameItem[]): GameItem[][] {
  const progressable = items.filter((item) => item.correct !== false);
  const decoys = items.filter((item) => item.correct === false);
  if (progressable.length < 3) return [items];
  const waveCount = Math.min(3, Math.max(1, Math.ceil(progressable.length / 2)));
  return Array.from({ length: waveCount }, (_, wave) => [
    ...progressable.filter((_, index) => index % waveCount === wave),
    ...decoys.filter((_, index) => index % waveCount === wave).slice(0, 2),
  ]).filter((wave) => wave.some((item) => item.correct !== false));
}
