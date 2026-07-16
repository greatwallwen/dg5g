export const learningOrigins = ['demo', 'user'] as const;

export type LearningOrigin = (typeof learningOrigins)[number];
