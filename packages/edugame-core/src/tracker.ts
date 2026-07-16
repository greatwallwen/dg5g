import type {
  GameConfig,
  LearningEvent,
  LearningEventType,
  LearningMistake,
  LearningRecord,
} from './types';

export class LearningTracker {
  private readonly startedAt = Date.now();
  private readonly events: LearningEvent[] = [];
  private readonly mistakes = new Map<string, LearningMistake>();

  constructor(private readonly config: GameConfig) {}

  record(eventType: LearningEventType, payload: Record<string, unknown> = {}, kp = ''): LearningEvent {
    const event: LearningEvent = {
      event_type: eventType,
      game_id: this.config.game_id,
      lesson_id: this.config.lesson_id,
      time: Math.round((Date.now() - this.startedAt) / 1000),
      payload,
    };
    if (kp) event.kp = kp;
    this.events.push(event);
    return event;
  }

  recordMistake(kp: string, reason: string): void {
    const key = kp || 'unknown';
    const current = this.mistakes.get(key);
    if (current) {
      current.count += 1;
      current.reason = reason || current.reason;
      return;
    }
    this.mistakes.set(key, { kp: key, count: 1, reason: reason || '需要复盘' });
  }

  complete(score: number, completed: boolean): LearningRecord {
    const [one = 60, two = 75, three = 90] = [...(this.config.reward_rule?.stars ?? [])].sort((a, b) => a - b);
    const stars = score >= three ? 3 : score >= two ? 2 : score >= one ? 1 : 0;
    this.record('game_complete', { score, stars, completed });
    return {
      game_id: this.config.game_id,
      lesson_id: this.config.lesson_id,
      score,
      stars,
      duration: Math.round((Date.now() - this.startedAt) / 1000),
      completed,
      mistakes: [...this.mistakes.values()],
      events: [...this.events],
    };
  }

  elapsedSeconds(): number {
    return Math.round((Date.now() - this.startedAt) / 1000);
  }

  snapshot(): LearningRecord {
    return {
      game_id: this.config.game_id,
      lesson_id: this.config.lesson_id,
      score: 0,
      stars: 0,
      duration: Math.round((Date.now() - this.startedAt) / 1000),
      completed: false,
      mistakes: [...this.mistakes.values()],
      events: [...this.events],
    };
  }
}
