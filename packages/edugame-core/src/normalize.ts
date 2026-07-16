import type { GameConfig, GameItem, GameType, LevelConfig } from './types';

const legacyMap: Record<string, GameType> = {
  'device-connect': 'drag-match',
  'evidence-chain': 'drag-match',
  'route-runner': 'quiz-rush',
  'threshold-guard': 'quiz-rush',
  'risk-gate': 'quiz-rush',
  'card-flow': 'memory-card',
  'signal-order': 'sort-flow',
  'fault-hunt': 'quick-hit',
};

export function normalizeGameConfig(raw: Record<string, unknown> | null | undefined): GameConfig {
  const source = raw ?? {};
  if (typeof source.game_id === 'string' && typeof source.game_type === 'string') {
    return normalizeCanonicalConfig(source);
  }

  const gameType = canonicalGameType(readString(source.gameType, 'quick-hit'));
  const items = legacyItems(source);
  const targets = legacyTargets(source);
  const levels: LevelConfig[] = [{
    level_id: 'level-01',
    type: gameType,
    goal: readString(source.objective, readString(source.challenge, '完成本轮知识挑战')),
    time_limit: readNumber(source.timeLimitSec, 90),
    items: buildItemsForTemplate(gameType, items, targets),
  }];

  return {
    game_id: readString(source.id, 'edugame-demo'),
    game_type: gameType,
    lesson_id: readString(source.projectId, 'demo'),
    title: readString(source.title, '专项演练'),
    duration: readNumber(source.timeLimitSec, 90),
    difficulty: 'normal',
    asset_pack: 'dgbook-5g-v1',
    knowledge_points: targets.slice(0, 6).map((target, index) => ({
      id: target.id,
      name: target.label || `知识点 ${index + 1}`,
      weight: 1,
      description: target.role,
    })),
    levels,
    score_rule: { base: 0, correct: 12, wrong_penalty: 6, combo_bonus: true, time_bonus: true },
    reward_rule: { stars: [60, 75, 90], badges: ['准确判断', '连续命中', '复盘完成'] },
    ui: {
      scenario: readString(source.scenario, ''),
      instruction: readString(source.instruction, ''),
      onboarding: legacyOnboarding(source),
    },
    mistake_limit: readNumber(source.mistakeLimit ?? readObject(source.pressureModel).failureBudget, 5),
    pass_score: readNumber(source.passScore, 0),
  };
}

function normalizeCanonicalConfig(source: Record<string, unknown>): GameConfig {
  const config = source as unknown as GameConfig;
  const pressure = readObject(source.pressureModel);
  const mistakeLimit = readOptionalNumber(source.mistake_limit ?? source.mistakeLimit ?? pressure.failureBudget);
  const passScore = readOptionalNumber(source.pass_score ?? source.passScore);

  return {
    ...config,
    duration: readNumber(source.duration ?? source.timeLimitSec, config.duration),
    levels: (config.levels ?? []).map((level) => ({
      ...level,
      mistake_limit: readOptionalNumber(level.mistake_limit) ?? mistakeLimit,
    })),
    reward_rule: {
      stars: config.reward_rule?.stars?.length
        ? config.reward_rule.stars
        : passScore
          ? [Math.max(0, passScore - 20), Math.max(0, passScore - 5), passScore]
          : [60, 75, 90],
      badges: config.reward_rule?.badges ?? [],
    },
    mistake_limit: mistakeLimit ?? config.mistake_limit,
    pass_score: passScore ?? config.pass_score,
  };
}

function canonicalGameType(value: string): GameType {
  return legacyMap[value] ?? value as GameType;
}

function buildItemsForTemplate(gameType: GameType, items: GameItem[], targets: GameItem[]): GameItem[] {
  if (gameType === 'quick-hit' || gameType === 'boss-review') {
    return [
      ...items.slice(0, 5).map((item) => ({ ...item, correct: true })),
      ...targets.slice(0, 3).map((item) => ({ ...item, id: `d-${item.id}`, correct: false })),
    ];
  }
  if (gameType === 'quiz-rush') {
    return items.slice(0, 8).map((item, index) => ({
      ...item,
      prompt: item.prompt || `${item.label} 应归入哪个判断对象？`,
      choices: targets.slice(0, 4).map((target) => target.label),
      answer: targets.find((target) => target.id === item.target_id)?.label ?? targets[index % Math.max(1, targets.length)]?.label,
    }));
  }
  if (gameType === 'memory-card') {
    return items.slice(0, 6).flatMap((item) => [
      { ...item, id: `${item.id}-a`, label: item.label, target_id: item.id },
      { ...item, id: `${item.id}-b`, label: item.definition || item.text || item.label, target_id: item.id },
    ]);
  }
  return items;
}

function legacyItems(source: Record<string, unknown>): GameItem[] {
  const input = readObject(source.inputModel);
  const options = readArray(input.options ?? source.evidenceTokens);
  return options.map((entry, index) => {
    const item = readObject(entry);
    return {
      id: readString(item.id, `item-${index + 1}`),
      label: readString(item.label, `对象 ${index + 1}`),
      text: readString(item.caseFact ?? item.feedback, ''),
      prompt: readString(item.challenge ?? item.hint, ''),
      definition: readString(item.role ?? item.feedback, ''),
      target_id: readString(item.expectedTargetId, ''),
      explanation: readString(item.successFeedback ?? item.feedback, ''),
      kp: readString(item.expectedTargetId, ''),
      order: index + 1,
    };
  });
}

function legacyTargets(source: Record<string, unknown>): GameItem[] {
  const input = readObject(source.inputModel);
  const targets = readArray(input.targets ?? source.targetGates);
  return targets.map((entry, index) => {
    const item = readObject(entry);
    return {
      id: readString(item.id, `target-${index + 1}`),
      label: readString(item.label, `目标 ${index + 1}`),
      role: readString(item.role, ''),
    };
  });
}

function legacyOnboarding(source: Record<string, unknown>): string[] {
  const experience = readObject(source.gameExperience);
  return readArray(experience.onboardingPath).map((entry) => readString(readObject(entry).body, '')).filter(Boolean);
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function readNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function readOptionalNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
