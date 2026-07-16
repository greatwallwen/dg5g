import assert from 'node:assert/strict';
import test from 'node:test';
import type { GameAttemptSummary } from './models.ts';
import {
  calculateProjectCompositeScore,
  calculateTaskCompositeScore,
  deriveAchievementLevel,
  summarizeFormalAttempts,
} from './learning-mastery.ts';

test('deriveAchievementLevel separates learned, passed, mastered and excellent', () => {
  assert.equal(deriveAchievementLevel({ lessonComplete: false, hasFormalTest: true }), 'available');
  assert.equal(deriveAchievementLevel({ lessonComplete: true, hasFormalTest: true }), 'learned');
  assert.equal(deriveAchievementLevel({ lessonComplete: true, hasFormalTest: true, bestFormalScore: 60 }), 'passed');
  assert.equal(deriveAchievementLevel({ lessonComplete: true, hasFormalTest: true, bestFormalScore: 80 }), 'mastered');
  assert.equal(deriveAchievementLevel({ lessonComplete: true, hasFormalTest: true, bestFormalScore: 90 }), 'excellent');
  assert.equal(deriveAchievementLevel({ lessonComplete: true, hasFormalTest: false }), 'learned');
});

test('summarizeFormalAttempts ignores practice and preserves every formal attempt without a permanent cap', () => {
  const summary = summarizeFormalAttempts([
    attempt('practice-1', 100, false, '2026-07-11T09:00:00.000Z', 120),
    attempt('formal-1', 64, true, '2026-07-11T10:00:00.000Z', 390),
    attempt('formal-2', 86, true, '2026-07-11T11:00:00.000Z', 360),
    attempt('formal-3', 78, true, '2026-07-11T12:00:00.000Z', 350),
    attempt('formal-4', 99, true, '2026-07-11T13:00:00.000Z', 200),
  ]);
  assert.equal(summary.attemptCount, 4);
  assert.equal(summary.attempts.length, 4);
  assert.equal(summary.firstScore, 64);
  assert.equal(summary.bestScore, 99);
  assert.equal(summary.latestScore, 99);
  assert.equal(summary.bestDurationSeconds, 200);
});

test('an empty formal-attempt summary keeps score and duration facts unformed', () => {
  const summary = summarizeFormalAttempts([]);

  assert.equal(summary.attemptCount, 0);
  assert.equal(summary.firstScore, undefined);
  assert.equal(summary.bestScore, undefined);
  assert.equal(summary.latestScore, undefined);
  assert.equal(summary.bestDurationSeconds, undefined);
});

test('task composite score forms only from the N02 highest score and N04 rubric score at 40/60', () => {
  assert.deepEqual(calculateTaskCompositeScore({
    nodeTestHighestScore: 80,
    outputRubricScore: 90,
  }), {
    nodeTestHighestScore: 80,
    outputRubricScore: 90,
    taskCompositeScore: 86,
  });

  assert.equal(calculateTaskCompositeScore({ nodeTestHighestScore: 80 }).taskCompositeScore, undefined);
  assert.equal(calculateTaskCompositeScore({ outputRubricScore: 90 }).taskCompositeScore, undefined);
});

test('project composite score is unavailable until P01 P02 and P03 are teacher verified', () => {
  assert.equal(calculateProjectCompositeScore([90, 84, 87]), 87);
  assert.equal(calculateProjectCompositeScore([90, 84, undefined]), undefined);
});

function attempt(attemptId: string, score: number, formal: boolean, completedAt: string, durationSeconds: number): GameAttemptSummary {
  return {
    attemptId,
    gameId: 'P1T1-N02-topology-repair',
    nodeId: 'P1T1-N02',
    score,
    durationSeconds,
    formal,
    completedAt,
    mistakeKnowledgePointIds: [],
  };
}
