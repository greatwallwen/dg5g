import type { GameConfig } from '@dgbook/edugame-core';

export type EduGameItem = {
  id: string;
  label: string;
  role: string;
  severity?: string;
  expectedTargetId: string;
  hint?: string;
  caseFact?: string;
  challenge?: string;
  feedback?: string;
  successFeedback?: string;
  errorFeedback?: string;
};

export type EduGameTarget = {
  id: string;
  label: string;
  role: string;
  gateType?: string;
  whyWrong?: string;
};

export type EduGameLevel = {
  id: string;
  label: string;
  goal: string;
  constraint?: string;
};

export type EduGameModel = {
  id: string;
  title: string;
  gameType: string;
  templateId: string;
  mechanic: string;
  scenario: string;
  objective: string;
  instruction: string;
  timeLimitSec: number;
  mistakeLimit: number;
  passScore: number;
  totalPoints: number;
  items: EduGameItem[];
  targets: EduGameTarget[];
  distractors: EduGameTarget[];
  levels: EduGameLevel[];
  onboarding: string[];
  badges: string[];
  feedbackHint: string;
  reviewPass: string;
  reviewFail: string;
};

export type EduGameInteractiveProps = {
  indexUrl?: string;
  manifestUrl?: string;
  configUrl?: string;
  title?: string;
  height?: number;
  posterUrl?: string;
  gameConfig?: GameConfig | Record<string, unknown>;
  variant?: 'full' | 'embedded';
  primaryAction?: boolean;
};
