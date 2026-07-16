import type { EduGameItem, EduGameLevel, EduGameModel, EduGameTarget } from './types';

type RawManifest = Record<string, unknown>;

export function buildEduGameModel(manifest: RawManifest | null, fallbackTitle = '工程挑战'): EduGameModel {
  const input = readObject(manifest?.inputModel);
  const answer = readObject(manifest?.answerModel);
  const gameplay = readObject(manifest?.gameplayModel);
  const scoring = readObject(manifest?.scoringRubric);
  const experience = readObject(manifest?.gameExperience);
  const rewardModel = readObject(experience.rewardModel);
  const review = readObject(manifest?.reviewSummary);
  const targets = readTargets(input.targets);
  const distractors = readDistractors(manifest?.distractors ?? input.distractors);
  const answerPairs = readObject(answer.pairs);
  const items = readItems(readArray(input.options), targets, answerPairs);
  const levels = readLevels(manifest?.challengeLevels ?? input.challengeLevels);
  const onboarding = readOnboarding(experience.onboardingPath ?? manifest?.tutorialSteps);
  const badges = readStrings(rewardModel.badges ?? experience.achievementBadges).slice(0, 4);

  return {
    id: readString(manifest?.id, 'edugame-demo'),
    gameType: readString(manifest?.gameType ?? input.kind, 'evidence-chain'),
    templateId: readString(manifest?.templateId ?? input.templateId, 'evidence-gate'),
    title: readString(manifest?.title, fallbackTitle),
    mechanic: readString(input.mechanicLabel ?? gameplay.mechanic, '证据链挑战'),
    scenario: readString(manifest?.scenario ?? gameplay.scenario, '现场案例正在进入处置队列。'),
    objective: readString(manifest?.objective ?? manifest?.learningObjective ?? gameplay.learningObjective ?? input.gameLoop?.premise, '把工程对象和证据门配成可复核闭环。'),
    instruction: readString(manifest?.instruction ?? input.instruction, '先读任务卡，再选择最能支撑结论的证据门。'),
    timeLimitSec: clampNumber(manifest?.timeLimitSec, 45, 600, 120),
    mistakeLimit: clampNumber(manifest?.mistakeLimit, 1, 10, 4),
    passScore: clampNumber(scoring.passScore ?? manifest?.passScore, 60, 100, 80),
    totalPoints: clampNumber(scoring.totalPoints ?? manifest?.totalPoints, 60, 200, 100),
    items,
    targets,
    distractors,
    levels,
    onboarding,
    badges: badges.length >= 3 ? badges : ['证据闭环', '连续命中', '达标交付'],
    feedbackHint: readString(manifest?.feedbackHint, '先看对象要证明什么，再选择能支撑结论的证据门。'),
    reviewPass: readString(review.pass, '证据链完整，可以进入案例复盘。'),
    reviewFail: readString(review.fail, '关键证据还不完整，请回到错误项重新判断。'),
  };
}

function readItems(options: unknown[], targets: EduGameTarget[], answerPairs: Record<string, unknown>): EduGameItem[] {
  const targetIds = targets.map((target) => target.id);
  return options.slice(0, 6).map((raw, index) => {
    const item = readObject(raw);
    const id = readString(item.id, `item-${index + 1}`);
    return {
      id,
      label: readString(item.label, `对象 ${index + 1}`),
      role: readString(item.role, '待判断对象'),
      severity: readString(item.severity, 'normal'),
      expectedTargetId: readString(item.expectedTargetId ?? answerPairs[id], targetIds[index % Math.max(1, targetIds.length)] ?? `target-${index + 1}`),
      hint: readString(item.hint, ''),
      caseFact: readString(item.caseFact, ''),
      challenge: readString(item.challenge, ''),
      feedback: readString(item.feedback, ''),
      successFeedback: readString(item.successFeedback, ''),
      errorFeedback: readString(item.errorFeedback, ''),
    };
  });
}

function readTargets(rawTargets: unknown): EduGameTarget[] {
  const targets = readArray(rawTargets).slice(0, 6).map((raw, index) => {
    const target = readObject(raw);
    return {
      id: readString(target.id, `target-${index + 1}`),
      label: readString(target.label, `证据 ${index + 1}`),
      role: readString(target.role, '证据目标'),
      gateType: readString(target.gateType, 'evidence'),
    };
  });
  return targets.length > 0 ? targets : [
    { id: 'target-1', label: '现象', role: '证据目标' },
    { id: 'target-2', label: '原因', role: '证据目标' },
    { id: 'target-3', label: '动作', role: '证据目标' },
  ];
}

function readDistractors(rawTargets: unknown): EduGameTarget[] {
  return readArray(rawTargets).slice(0, 4).map((raw, index) => {
    const target = readObject(raw);
    return {
      id: readString(target.id, `distractor-${index + 1}`),
      label: readString(target.label, `干扰项 ${index + 1}`),
      role: readString(target.role, '待判信息'),
      gateType: 'distractor',
      whyWrong: readString(target.whyWrong, '这条信息不能支撑当前交付结论。'),
    };
  });
}

function readLevels(raw: unknown): EduGameLevel[] {
  const levels = readArray(raw).slice(0, 4).map((entry, index) => {
    const level = readObject(entry);
    return {
      id: readString(level.id, `level-${index + 1}`),
      label: readString(level.label, `第 ${index + 1} 关`),
      goal: readString(level.goal, '完成本轮证据判断。'),
      constraint: readString(level.constraint, ''),
    };
  });
  return levels.length ? levels : [
    { id: 'level-1', label: '上手', goal: '完成 2 次正确配对。' },
    { id: 'level-2', label: '连击', goal: '连续命中 3 次获得加分。' },
    { id: 'level-3', label: '交付', goal: '在限定时间内达标。' },
  ];
}

function readOnboarding(raw: unknown): string[] {
  const steps = readArray(raw).map((entry) => {
    const step = readObject(entry);
    return readString(step.body ?? step.title, '');
  }).filter(Boolean);
  return steps.length >= 3 ? steps.slice(0, 4) : [
    '先观察当前任务和达标线。',
    '选择工程对象，再点击对应证据门。',
    '正确会连击加分，错误会给出修正提示。',
  ];
}

function readStrings(raw: unknown): string[] {
  return readArray(raw).map((item) => readString(item, '')).filter(Boolean);
}

function readObject(value: unknown): Record<string, any> {
  return value && typeof value === 'object' ? value as Record<string, any> : {};
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}
