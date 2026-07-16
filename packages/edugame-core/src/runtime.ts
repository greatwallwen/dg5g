import { AssetLoader, KnowledgeBinder, RuleEngine, SceneManager, ScoreEngine } from './engines';
import { LearningTracker } from './tracker';
import type { GameConfig, LearningEventType, RuntimeSnapshot } from './types';

export class GameRuntime {
  readonly sceneManager: SceneManager;
  readonly ruleEngine = new RuleEngine();
  readonly scoreEngine: ScoreEngine;
  readonly assetLoader: AssetLoader;
  readonly knowledgeBinder: KnowledgeBinder;
  readonly learningTracker: LearningTracker;

  private score = 0;
  private combo = 0;
  private completed = false;
  private failed = false;
  private mistakeCount = 0;
  private readonly closedLevels = new Set<string>();

  constructor(readonly config: GameConfig) {
    this.sceneManager = new SceneManager(config);
    this.scoreEngine = new ScoreEngine(config);
    this.assetLoader = new AssetLoader(config.asset_pack);
    this.knowledgeBinder = new KnowledgeBinder(config);
    this.learningTracker = new LearningTracker(config);
    this.score = config.score_rule.base;
  }

  start(): void {
    this.learningTracker.record('game_start');
    this.learningTracker.record('level_start', { level: this.sceneManager.currentLevel()?.level_id });
  }

  applyCorrect(payload: Record<string, unknown> = {}, eventType: LearningEventType = 'answer_correct'): RuntimeSnapshot {
    this.combo += 1;
    this.score = this.scoreEngine.correct(this.score, this.combo);
    this.learningTracker.record(eventType, { ...payload, score: this.score, combo: this.combo }, String(payload.kp ?? ''));
    if (this.combo > 1) this.learningTracker.record('combo', { combo: this.combo });
    return this.snapshot();
  }

  applyWrong(payload: Record<string, unknown> = {}, eventType: LearningEventType = 'answer_wrong'): RuntimeSnapshot {
    this.combo = 0;
    this.score = this.scoreEngine.wrong(this.score);
    this.mistakeCount += 1;
    const kp = String(payload.kp ?? 'unknown');
    this.learningTracker.recordMistake(kp, String(payload.reason ?? '判断错误'));
    this.learningTracker.record(eventType, { ...payload, score: this.score }, kp);
    if (this.isOverLimit()) {
      this.failed = true;
      this.closeCurrentLevel('level_failed', {
        mistakes: this.mistakeCount,
      });
    }
    return this.snapshot();
  }

  applyHint(payload: Record<string, unknown> = {}): RuntimeSnapshot {
    this.combo = 0;
    this.score = this.scoreEngine.hint(this.score);
    this.learningTracker.record('hint_used', { ...payload, score: this.score }, String(payload.kp ?? ''));
    return this.snapshot();
  }

  advanceLevel(): RuntimeSnapshot {
    this.closeCurrentLevel('level_complete');
    if (this.sceneManager.nextLevel()) {
      this.learningTracker.record('level_start', { level: this.sceneManager.currentLevel()?.level_id });
    }
    return this.snapshot();
  }

  complete(completed = true): ReturnType<LearningTracker['complete']> {
    const finalScore = this.scoreEngine.final(this.score, this.learningTracker.elapsedSeconds(), completed);
    const passed = completed && finalScore >= (this.config.pass_score ?? 0);
    this.score = finalScore;
    this.completed = passed;
    if (passed) {
      this.closeCurrentLevel('level_complete');
    } else {
      this.failed = true;
      this.closeCurrentLevel('level_failed', { mistakes: this.mistakeCount });
    }
    return this.learningTracker.complete(this.score, passed);
  }

  snapshot(): RuntimeSnapshot {
    return {
      config: this.config,
      level_index: this.sceneManager.levelIndex(),
      score: this.score,
      combo: this.combo,
      mistakes: this.learningTracker.snapshot().mistakes,
      completed: this.completed,
      mistake_count: this.mistakeCount,
      phase: this.failed ? 'failed' : this.completed ? 'passed' : 'playing',
    };
  }

  private isOverLimit(): boolean {
    const levelLimit = this.sceneManager.currentLevel()?.mistake_limit;
    const configLimit = this.config.mistake_limit;
    const limit = typeof levelLimit === 'number' ? levelLimit : typeof configLimit === 'number' ? configLimit : 5;
    return this.mistakeCount >= limit;
  }

  private closeCurrentLevel(eventType: 'level_complete' | 'level_failed', payload: Record<string, unknown> = {}): void {
    const level = this.sceneManager.currentLevel()?.level_id ?? `level-${this.sceneManager.levelIndex() + 1}`;
    if (this.closedLevels.has(level)) return;
    this.closedLevels.add(level);
    this.learningTracker.record(eventType, { level, ...payload });
  }
}
