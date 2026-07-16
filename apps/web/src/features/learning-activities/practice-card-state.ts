export type PracticeCardState = 'idle' | 'wrong' | 'correct';

const practiceCardClassNames: Record<PracticeCardState, string> = {
  idle: 'self-study-practice-card is-idle',
  wrong: 'self-study-practice-card is-wrong',
  correct: 'self-study-practice-card is-correct',
};

export function practiceCardClassName(state: PracticeCardState): string {
  return practiceCardClassNames[state];
}

export function activityPracticeCardState({ persistedPassed, result }: {
  persistedPassed: boolean;
  result: { passed: boolean } | null;
}): PracticeCardState {
  if (persistedPassed || result?.passed) return 'correct';
  if (result) return 'wrong';
  return 'idle';
}
