import type {
  AnimationPPTElement,
  AnimationSlideBackground,
  AnimationSlideScene,
  LessonAnimationArtifact,
  LessonAnimationTarget,
  TeachingAction,
  TeachingScene,
} from '@dgbook/animation';

export type GenerationSceneType = 'slide' | 'quiz' | 'interactive' | 'pbl';

export interface DGBookGenerationContext {
  projectId: string;
  title: string;
  topic?: string;
  chapterTitle?: string;
  unitTitle?: string;
  sourceText: string;
  widgetId: string;
  existingTargets?: LessonAnimationTarget[];
}

export interface SceneOutline {
  id: string;
  type: GenerationSceneType;
  title: string;
  description: string;
  keyPoints: string[];
  teachingObjective?: string;
  estimatedDuration?: number;
  order: number;
  languageNote?: string;
}

export interface GeneratedSlideContent {
  elements: AnimationPPTElement[];
  background?: AnimationSlideBackground;
  remark?: string;
}

export interface GenerationModelOptions {
  modelString?: string;
  apiKey?: string;
  baseUrl?: string;
  providerType?: 'openai-compatible' | 'openai' | 'anthropic' | 'google';
  thinking?: ThinkingConfig;
}

export interface ThinkingConfig {
  enabled?: boolean;
  mode?: 'auto' | 'disabled' | 'effort' | 'budget' | 'level';
  effort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  budgetTokens?: number;
  level?: 'low' | 'medium' | 'high';
}

export interface LLMCall {
  system: string;
  user: string;
  source?: string;
}

export interface LLMClient {
  call(input: LLMCall): Promise<string>;
}

export interface GenerationOptions {
  model?: GenerationModelOptions;
  llm?: LLMClient;
  useLLM?: boolean;
}

export interface GeneratedAnimationDraft {
  outlines: SceneOutline[];
  selectedOutline: SceneOutline;
  content: GeneratedSlideContent;
  actions: TeachingAction[];
  artifact: LessonAnimationArtifact;
  targets: LessonAnimationTarget[];
  playbackScenes: TeachingScene[];
  scene: AnimationSlideScene;
  sources: Array<{ label: string; href: string; note?: string }>;
}

export interface PromptMessagePair {
  system: string;
  user: string;
}

export type PromptId = 'requirements-to-outlines' | 'slide-content' | 'slide-actions';
