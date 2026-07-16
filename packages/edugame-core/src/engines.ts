import type { GameConfig, GameItem, LearningMistake } from './types';

export class ScoreEngine {
  constructor(private readonly config: GameConfig) {}

  correct(score: number, combo: number): number {
    const rule = this.config.score_rule;
    const comboBonus = rule.combo_bonus ? Math.min(combo * 2, 12) : 0;
    return Math.min(100, score + rule.correct + comboBonus);
  }

  wrong(score: number): number {
    return Math.max(0, score - this.config.score_rule.wrong_penalty);
  }

  hint(score: number): number {
    const penalty = Math.max(4, Math.ceil(this.config.score_rule.wrong_penalty * 0.75));
    return Math.max(0, score - penalty);
  }

  final(score: number, elapsedSeconds: number, completed: boolean): number {
    if (!completed || !this.config.score_rule.time_bonus) return score;
    const duration = Math.max(1, this.config.duration);
    const remainingRatio = Math.max(0, duration - elapsedSeconds) / duration;
    return Math.min(100, Math.round(score + remainingRatio * 10));
  }
}

export class RuleEngine {
  answerChoice(item: GameItem, answer: string): boolean {
    if (item.answer) return item.answer === answer;
    if (typeof item.correct === 'boolean') return item.correct === (answer === 'true');
    return item.target_id === answer;
  }

  matchItem(item: GameItem, targetId: string): boolean {
    return item.target_id === targetId;
  }

  memoryMatch(a: GameItem, b: GameItem): boolean {
    return Boolean(a.target_id && a.target_id === b.target_id && a.id !== b.id);
  }

  sequenceMatch(item: GameItem, expectedOrder: number): boolean {
    return (item.order ?? Number.NaN) === expectedOrder;
  }
}

export class SceneManager {
  private index = 0;

  constructor(private readonly config: GameConfig) {}

  currentLevel() {
    return this.config.levels[this.index] ?? this.config.levels[0];
  }

  levelIndex(): number {
    return this.index;
  }

  nextLevel(): boolean {
    if (this.index + 1 >= this.config.levels.length) return false;
    this.index += 1;
    return true;
  }
}

export class KnowledgeBinder {
  constructor(private readonly config: GameConfig) {}

  labelFor(kp = ''): string {
    return this.config.knowledge_points.find((point) => point.id === kp)?.name ?? kp;
  }
}

export class AssetLoader {
  constructor(private readonly assetPack = 'default') {}

  iconFor(object: string): string {
    return `${this.assetPack}:icon:${object}`;
  }
}

export function compactMistakes(mistakes: LearningMistake[]): string {
  if (mistakes.length === 0) return '没有明显薄弱点';
  return mistakes.map((item) => `${item.kp} x${item.count}`).join('、');
}
