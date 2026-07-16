export type GameType =
  | 'quick-hit'
  | 'memory-card'
  | 'drag-match'
  | 'sort-flow'
  | 'card-battle'
  | 'match-3'
  | 'boss-review'
  | 'quiz-rush'
  | 'pipe-connect'
  | 'device-assemble'
  | 'maze-troubleshoot'
  | 'tower-defense'
  | '2048-merge'
  | 'minesweeper-risk'
  | 'rhythm-tap'
  | 'timeline-build'
  | 'case-detective'
  | 'knowledge-map'
  | 'repair-sim'
  | 'lab-procedure'
  | 'classification-run'
  | 'resource-management'
  | 'scenario-choice'
  | 'checkpoint-adventure';

export type Difficulty = 'easy' | 'normal' | 'hard';
export type TemplateStatus = 'ready' | 'placeholder';
export type TemplateMechanicFamily = 'quick-hit' | 'quiz-rush' | 'memory-card' | 'drag-match' | 'sort-flow';

export interface KnowledgePoint {
  id: string;
  name: string;
  weight?: number;
  description?: string;
}

export interface GameItem {
  id: string;
  label: string;
  role?: string;
  text?: string;
  prompt?: string;
  definition?: string;
  target_id?: string;
  correct?: boolean;
  choices?: string[];
  answer?: string;
  explanation?: string;
  asset_id?: string;
  kp?: string;
  order?: number;
}

export interface LevelConfig {
  level_id: string;
  type?: GameType;
  goal: string;
  time_limit?: number;
  items: GameItem[];
  mistake_limit?: number;
}

export interface ScoreRule {
  base: number;
  correct: number;
  wrong_penalty: number;
  combo_bonus: boolean;
  time_bonus: boolean;
}

export interface RewardRule {
  stars: number[];
  badges: string[];
}

export interface GameConfig {
  game_id: string;
  game_type: GameType;
  lesson_id: string;
  title: string;
  duration: number;
  difficulty: Difficulty;
  asset_pack: string;
  knowledge_points: KnowledgePoint[];
  levels: LevelConfig[];
  score_rule: ScoreRule;
  reward_rule: RewardRule;
  ui?: Record<string, unknown>;
  mistake_limit?: number;
  pass_score?: number;
}

export type LearningEventType =
  | 'game_start'
  | 'level_start'
  | 'answer_correct'
  | 'answer_wrong'
  | 'drag_success'
  | 'drag_fail'
  | 'match_success'
  | 'match_fail'
  | 'combo'
  | 'hint_used'
  | 'mistake_drill_start'
  | 'level_complete'
  | 'level_failed'
  | 'game_complete';

export interface LearningEvent {
  event_type: LearningEventType;
  game_id: string;
  lesson_id: string;
  time: number;
  kp?: string;
  payload?: Record<string, unknown>;
}

export interface LearningMistake {
  kp: string;
  count: number;
  reason: string;
}

export interface LearningRecord {
  game_id: string;
  lesson_id: string;
  score: number;
  stars: number;
  duration: number;
  completed: boolean;
  mistakes: LearningMistake[];
  events: LearningEvent[];
}

export interface TemplateDefinition {
  game_type: GameType;
  title: string;
  description: string;
  status: TemplateStatus;
  mechanic_family: TemplateMechanicFamily;
  min_items: number;
  supports_drag: boolean;
}

export interface RuntimeSnapshot {
  config: GameConfig;
  level_index: number;
  score: number;
  combo: number;
  mistakes: LearningMistake[];
  completed: boolean;
  mistake_count: number;
  phase: 'playing' | 'passed' | 'failed';
}
