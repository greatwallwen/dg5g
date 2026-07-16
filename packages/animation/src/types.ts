import type { ProjectId, WidgetStatus } from '@dgbook/shared/types';

export type AnimationDiagnosticLevel = 'error' | 'warning' | 'info';

export interface AnimationDiagnostic {
  id: string;
  level: AnimationDiagnosticLevel;
  code?: string;
  title: string;
  detail: string;
  message?: string;
  targetId?: string;
  sceneId?: string;
  blocking?: boolean;
}

export type AnimationSceneType = 'slide' | 'quiz' | 'interactive' | 'pbl';

export type AnimationSlideBackground =
  | { type: 'solid'; color: string }
  | { type: 'gradient'; gradient: AnimationGradient }
  | { type: 'image'; src: string; opacity?: number };

export interface AnimationGradient {
  type: 'linear' | 'radial';
  colors: Array<{ pos: number; color: string }>;
  rotate?: number;
}

export interface AnimationSlideTheme {
  colors?: string[];
  fonts?: string[];
  backgroundColor?: string;
}

export interface AnimationSlideCanvas {
  id: string;
  width: 1000;
  height: 562;
  background?: AnimationSlideBackground;
  theme?: AnimationSlideTheme;
  elements: AnimationPPTElement[];
}

export interface AnimationSlideContent {
  type: 'slide';
  canvas: AnimationSlideCanvas;
}

export interface AnimationSlideScene {
  id: string;
  title: string;
  type: AnimationSceneType;
  content: AnimationSlideContent;
  actions?: TeachingAction[];
  timeline?: AnimationTimeline;
  description?: string;
}

export type AnimationPPTElementType =
  | 'text'
  | 'image'
  | 'shape'
  | 'line'
  | 'chart'
  | 'table'
  | 'latex'
  | 'video'
  | 'audio'
  | 'code';

export interface AnimationPPTBaseElement {
  id: string;
  type: AnimationPPTElementType;
  left: number;
  top: number;
  width: number;
  height: number;
  rotate?: number;
  opacity?: number;
  name?: string;
  lock?: boolean;
  groupId?: string;
  phase?: number;
  layer?: 'base' | 'concept' | 'process' | 'evidence' | 'metric' | 'summary' | string;
  animation?: AnimationTrack;
  role?: 'title' | 'subtitle' | 'diagram' | 'model' | 'step' | 'metric' | 'caption' | 'decor';
}

export interface AnimationTextElement extends AnimationPPTBaseElement {
  type: 'text';
  content: string;
  defaultFontName?: string;
  defaultColor?: string;
  fill?: string;
  lineHeight?: number;
  wordSpace?: number;
  paragraphSpace?: number;
  textBudget?: number;
  maxLines?: number;
  minFontSize?: number;
  fit?: 'scale' | 'clamp';
}

export interface AnimationShapeElement extends AnimationPPTBaseElement {
  type: 'shape';
  path: string;
  viewBox: [number, number];
  fill: string;
  gradient?: AnimationGradient;
  pattern?: {
    kind: 'dots' | 'grid' | 'diagonal' | 'circuit';
    color?: string;
    opacity?: number;
    size?: number;
  };
  label?: string;
  labelColor?: string;
  fixedRatio?: boolean;
  outline?: { style?: 'solid' | 'dashed' | 'dotted'; width?: number; color?: string };
  shadow?: { h: number; v: number; blur: number; color: string };
}

export interface AnimationLineElement extends AnimationPPTBaseElement {
  type: 'line';
  start: [number, number];
  end: [number, number];
  color: string;
  style?: 'solid' | 'dashed' | 'dotted';
  points?: ['', 'arrow'] | ['arrow', ''] | ['arrow', 'arrow'] | ['', ''] | ['', 'dot'] | ['dot', ''];
  broken?: [number, number];
  broken2?: [number, number];
  curve?: [number, number];
  cubic?: [[number, number], [number, number]];
}

export interface AnimationImageElement extends AnimationPPTBaseElement {
  type: 'image';
  src: string;
  alt?: string;
  objectFit?: 'cover' | 'contain' | 'fill';
  clipPath?: 'circle' | 'rounded' | 'hexagon' | 'diamond' | string;
  filter?: string;
  radius?: number;
  colorMask?: string;
  fixedRatio?: boolean;
  outline?: { style?: 'solid' | 'dashed' | 'dotted'; width?: number; color?: string };
  shadow?: { h: number; v: number; blur: number; color: string };
}

export interface AnimationVideoElement extends AnimationPPTBaseElement {
  type: 'video';
  src: string;
  poster?: string;
  muted?: boolean;
}

export interface AnimationGenericElement extends AnimationPPTBaseElement {
  type: Exclude<AnimationPPTElementType, 'text' | 'shape' | 'line' | 'image' | 'video'>;
  content?: string;
  src?: string;
  data?: unknown;
  language?: string;
  columns?: Array<{ key: string; label: string; width?: number }>;
  rows?: Array<Record<string, string | number>>;
  chartType?: 'bar' | 'line' | 'pie' | 'gauge' | 'flow';
  series?: Array<{ label: string; value: number; color?: string }>;
}

export type AnimationPPTElement =
  | AnimationTextElement
  | AnimationShapeElement
  | AnimationLineElement
  | AnimationImageElement
  | AnimationVideoElement
  | AnimationGenericElement;

export type TeachingStageElement = AnimationPPTElement;

export interface AnimationTrack {
  preset?:
    | 'fade'
    | 'rise'
    | 'scale'
    | 'draw'
    | 'flow'
    | 'pulse'
    | 'metric'
    | 'none';
  delayMs?: number;
  durationMs?: number;
  repeat?: boolean;
}

export type AnimationTimelineEffect =
  | 'enter'
  | 'exit'
  | 'draw'
  | 'flow'
  | 'packetMove'
  | 'pathFlow'
  | 'cameraZoom'
  | 'cameraPan'
  | 'spotlight'
  | 'laser'
  | 'captionUpdate'
  | 'sceneTransition'
  | 'tableRowReveal'
  | 'countUp'
  | 'typeText'
  | 'highlight'
  | 'whiteboardText'
  | 'whiteboardLine'
  | 'whiteboardShape'
  | 'whiteboardChart'
  | 'whiteboardTable'
  | 'whiteboardCode'
  | 'whiteboardFormula'
  | 'whiteboardClear';

export interface AnimationTimelineCue {
  id: string;
  atMs?: number;
  after?: string;
  durationMs?: number;
  holdMs?: number;
  targets?: string[];
  effect: AnimationTimelineEffect;
  blocking?: boolean;
  easing?: string;
  speechId?: string;
  beatId?: string;
  startPolicy?: 'absolute' | 'speech-progress' | 'after-action';
  exitPolicy?: 'auto' | 'hold' | 'clear-on-next';
  spokenTextRef?: string;
  captionRef?: string;
  payload?: Record<string, unknown>;
}

export interface AnimationTimeline {
  cues: AnimationTimelineCue[];
  durationMs?: number;
}

export interface AnimationMediaTrack {
  id: string;
  kind: 'manim' | 'video' | 'poster';
  layer?: 'background' | 'diagram' | 'overlay';
  beatIds?: string[];
  startMs?: number;
  durationMs?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  videoUrl?: string;
  posterUrl?: string;
  manifestUrl?: string;
  fit?: 'cover' | 'contain';
  opacity?: number;
}

export interface AnimationInteractiveRef {
  id: string;
  kind: 'edugame-config' | 'html';
  title?: string;
  widgetType?: string;
  manifestUrl?: string;
  indexUrl?: string;
  height?: number;
  projectId?: ProjectId | string;
}

export interface AnimationStagePage {
  id: string;
  phase: number;
  title: string;
  startMs: number;
  durationMs: number;
  summary?: string;
  focusElementId?: string;
}

export type LessonAnimationArtifact = {
  type: 'animation-slide';
  version?: 1 | 2;
  aspectRatio?: '16:9';
  durationMs?: number;
  minDurationMs?: number;
  pages?: AnimationStagePage[];
  timeline?: AnimationTimeline;
  mediaTracks?: AnimationMediaTrack[];
  interactiveRefs?: AnimationInteractiveRef[];
  scene: AnimationSlideScene;
  diagnostics?: AnimationDiagnostic[];
};

export interface LessonAnimationTarget {
  id: string;
  label: string;
  selector?: string;
  description?: string;
}

export interface AnimationReviewEntry {
  status: WidgetStatus | 'approved' | 'rejected';
  at: string;
  by: string;
  comment?: string;
}

export type AnimationCueReviewStatus = 'unreviewed' | 'pass' | 'issue' | 'skip';

export interface AnimationCueReview {
  status: AnimationCueReviewStatus;
  note?: string;
  updatedAt?: string;
  by?: string;
}

export interface AnimationReviewState {
  status: WidgetStatus | 'approved' | 'rejected';
  checklist?: Record<string, boolean>;
  history: AnimationReviewEntry[];
  cueReviews?: Record<string, AnimationCueReview>;
  sources?: Array<{ label: string; href: string; note?: string }>;
}

export interface LessonAnimationProps {
  instanceId?: string;
  title: string;
  artifact: LessonAnimationArtifact;
  targets?: LessonAnimationTarget[];
  sources?: Array<{ label: string; href: string; note?: string }>;
  review?: AnimationReviewState;
  readOnly?: boolean;
}

export type TeachingActionType =
  | 'speech'
  | 'spotlight'
  | 'laser'
  | 'widget_highlight'
  | 'widget_setState'
  | 'widget_timelineCue'
  | 'widget_annotation'
  | 'widget_reveal'
  | 'play_video';

export type TeachingActionFocusPolicy = 'hold' | 'clear-on-next' | 'clear-on-end' | 'none';

export interface TeachingAction {
  id: string;
  type: TeachingActionType;
  title?: string;
  description?: string;
  speakerId?: string;
  text?: string;
  elementId?: string;
  widgetId?: string;
  target?: string;
  state?: Record<string, unknown>;
  content?: string;
  label?: string;
  color?: string;
  dimOpacity?: number;
  timeoutMs?: number;
  delayMs?: number;
  holdMs?: number;
  audioId?: string;
  audioUrl?: string;
  durationMs?: number;
  voiceProfileId?: string;
  displayText?: string;
  spokenText?: string;
  caption?: string;
  focusPolicy?: TeachingActionFocusPolicy;
  clearFocusOnEnd?: boolean;
}

export interface TeachingScene {
  id: string;
  title: string;
  type: 'content' | 'animation' | 'network-visual' | 'slide' | 'video';
  order: number;
  stageId?: string;
  description?: string;
  actions: TeachingAction[];
}

export type RuntimeTTSProviderId =
  | 'browser-native-tts'
  | 'qwen-tts'
  | 'voxcpm-tts'
  | 'kokoro-tts'
  | 'custom-openai-compatible-tts';

export type VoxCPMBackend = 'vllm-omni' | 'python-api' | 'nano-vllm';

export interface VoxCPMProviderOptions {
  voiceMode?: 'auto' | 'prompt' | 'clone';
  backend?: VoxCPMBackend;
  voicePrompt?: string;
  promptText?: string;
  referenceAudioBase64?: string;
  referenceAudioMimeType?: string;
  referenceAudioName?: string;
  cfgValue?: number;
  inferenceTimesteps?: number;
  normalize?: boolean;
  denoise?: boolean;
}

export interface RuntimeTTSProviderOptions extends VoxCPMProviderOptions {
  languageType?: 'Chinese' | 'English' | string;
  sse?: boolean;
  [key: string]: unknown;
}

export interface RuntimeTTSConfig {
  providerId: RuntimeTTSProviderId;
  baseUrl?: string;
  modelId?: string;
  voice?: string;
  speed?: number;
  apiKey?: string;
  responseFormat?: 'mp3' | 'wav' | 'opus' | 'aac' | 'flac';
  fallbackProviderId?: 'browser-native-tts';
  providerOptions?: RuntimeTTSProviderOptions;
}

export type PresenterAvatarKind = 'preset' | 'uploaded' | 'generated' | 'photo-to-cartoon' | 'initials';

export interface PresenterProfile {
  id: string;
  name: string;
  role: 'teacher' | 'assistant' | 'engineer' | 'analyst';
  title?: string;
  avatarUrl: string;
  avatarKind?: PresenterAvatarKind;
  color: string;
  language?: string;
  voiceURI?: string;
  voiceProfileId?: string;
  voicePrompt?: string;
  voiceConfig?: RuntimeTTSConfig;
}

export type TeachingPresenter = PresenterProfile & {
  title: string;
  avatar: string;
  lang?: string;
};

export interface TeachingVoiceProfile {
  id: string;
  providerId: RuntimeTTSProviderId;
  kind: 'preset' | 'prompt' | 'clone' | 'browser';
  name: string;
  voiceId?: string;
  voicePrompt?: string;
  promptText?: string;
  referenceAudioName?: string;
  referenceAudioMimeType?: string;
  referenceAudioBase64?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SpeechProviderConfig {
  id: RuntimeTTSProviderId;
  label: string;
  defaultBaseUrl?: string;
  defaultModelId?: string;
  defaultVoice?: string;
  defaultResponseFormat?: RuntimeTTSConfig['responseFormat'];
  supportsLivePreview: boolean;
  supportsReferenceAudio?: boolean;
  supportsVoicePrompt?: boolean;
}

export interface SpeechGenerationRequest {
  text: string;
  audioId?: string;
  providerId: RuntimeTTSProviderId;
  baseUrl?: string;
  apiKey?: string;
  modelId?: string;
  voice?: string;
  speed?: number;
  responseFormat?: RuntimeTTSConfig['responseFormat'];
  providerOptions?: RuntimeTTSProviderOptions;
}

export interface SpeechGenerationResult {
  providerId: RuntimeTTSProviderId;
  audioId: string;
  base64?: string;
  audioUrl?: string;
  mimeType?: string;
  format?: RuntimeTTSConfig['responseFormat'];
  durationMs?: number;
  browserNative?: boolean;
  fallbackUsed?: boolean;
}

export interface SpeechAudioManifest {
  version: 1;
  generatedAt: string;
  items: Record<string, {
    audioId: string;
    url: string;
    providerId: RuntimeTTSProviderId;
    voice?: string;
    modelId?: string;
    durationMs?: number;
    textHash?: string;
  }>;
}

export interface VisualSceneTemplate {
  id: string;
  label: string;
  description: string;
  elementRoles: Array<TeachingStageElement['role']>;
  recommendedActions: TeachingActionType[];
}

export type TeachingStageArtifact = LessonAnimationArtifact;

export interface CueWindow {
  id: string;
  startMs: number;
  endMs: number;
  beatId?: string;
  speechId?: string;
  description?: string;
}

export interface VisualBeat {
  id: string;
  title: string;
  startMs?: number;
  durationMs?: number;
  speechId?: string;
  cueWindow?: CueWindow;
  summary?: string;
  elementIds?: string[];
  actionIds?: string[];
  cueIds?: string[];
}

export type StageRendererCapability =
  | 'text-fit'
  | 'shape-gradient'
  | 'shape-pattern'
  | 'line-marker'
  | 'line-curve'
  | 'image-clip'
  | 'image-filter'
  | 'video-placeholder'
  | 'chart-bar'
  | 'chart-line'
  | 'chart-pie'
  | 'chart-gauge'
  | 'chart-flow'
  | 'table-row-reveal'
  | 'latex'
  | 'code'
  | 'spotlight'
  | 'laser'
  | 'highlight'
  | 'camera'
  | 'packet-motion'
  | 'count-up'
  | 'caption-sync'
  | 'manim-media'
  | 'edugame-interactive';

export interface VisualScript {
  id: string;
  title: string;
  template: string;
  beats?: VisualBeat[];
  cueWindows?: CueWindow[];
  elements?: TeachingStageElement[];
  actions: TeachingAction[];
  timeline?: AnimationTimeline;
  mediaTracks?: AnimationMediaTrack[];
  interactiveRefs?: AnimationInteractiveRef[];
  minDurationMs?: number;
  capabilities?: StageRendererCapability[];
  presenterId?: string;
  voiceProfileId?: string;
}

export interface MarkdownLessonAst {
  version: 1;
  sourcePath: string;
  book: {
    id: string;
    title: string;
    language?: string;
    defaultPresenterId?: string;
    defaultVoiceProfileId?: string;
  };
  lessons: Array<{
    id: string;
    title: string;
    markdown: string;
    scenes: Array<{
      id: string;
      title: string;
      speech?: string;
      visual?: VisualScript;
      assets?: Array<{ id: string; src: string; kind: 'image' | 'video' | 'audio' | 'table' | 'code' | 'formula' }>;
    }>;
  }>;
}

export interface AnimationDraft {
  id: string;
  project: ProjectId;
  widgetId: string;
  title: string;
  topic: string;
  props: LessonAnimationProps;
  playbackScenes?: TeachingScene[];
  diagnostics?: AnimationDiagnostic[];
  review: AnimationReviewState;
  createdAt: string;
  updatedAt: string;
}

export interface PublishedAnimationManifest {
  version: 2;
  projects: Record<string, string[]>;
  updatedAt: string;
}

export const DEFAULT_TEACHING_PRESENTERS: TeachingPresenter[] = [
  {
    id: 'teacher',
    name: '张老师',
    role: 'teacher',
    title: '5G 网优讲师',
    avatarUrl: '/avatars/teacher.png',
    avatar: '/avatars/teacher.png',
    avatarKind: 'preset',
    color: '#0891b2',
    language: 'zh-CN',
    lang: 'zh-CN',
    voiceProfileId: 'qwen:Cherry',
    voicePrompt: '自然、清晰、有现场工程经验的中文女讲师声音，语速适中。',
    voiceConfig: { providerId: 'qwen-tts', voice: 'Cherry', speed: 1, responseFormat: 'wav', providerOptions: { languageType: 'Chinese', sse: true } },
  },
  {
    id: 'engineer',
    name: '工程讲师',
    role: 'engineer',
    title: '现场优化指导',
    avatarUrl: '/avatars/assist.png',
    avatar: '/avatars/assist.png',
    avatarKind: 'preset',
    color: '#0f766e',
    language: 'zh-CN',
    lang: 'zh-CN',
    voiceProfileId: 'kokoro:zf_xiaoxiao',
    voicePrompt: '沉稳、耐心、工程讲解风格的中文声音。',
    voiceConfig: { providerId: 'kokoro-tts', voice: 'zf_xiaoxiao', speed: 1 },
  },
  {
    id: 'analyst',
    name: '指标讲师',
    role: 'analyst',
    title: '性能与信令分析',
    avatarUrl: '/avatars/thinker.png',
    avatar: '/avatars/thinker.png',
    avatarKind: 'preset',
    color: '#7c3aed',
    language: 'zh-CN',
    lang: 'zh-CN',
    voiceProfileId: 'kokoro:zf_xiaobei',
    voicePrompt: '清晰、理性、偏数据分析口吻的中文声音。',
    voiceConfig: { providerId: 'kokoro-tts', voice: 'zf_xiaobei', speed: 1 },
  },
  {
    id: 'curious',
    name: '林老师',
    role: 'assistant',
    title: '信令引导讲师',
    avatarUrl: '/avatars/curious.png',
    avatar: '/avatars/curious.png',
    avatarKind: 'preset',
    color: '#2563eb',
    language: 'zh-CN',
    lang: 'zh-CN',
    voiceProfileId: 'qwen:Serena',
    voicePrompt: '明快、亲和、善于追问关键证据的中文女讲师声音。',
    voiceConfig: { providerId: 'qwen-tts', voice: 'Serena', speed: 1, responseFormat: 'wav', providerOptions: { languageType: 'Chinese', sse: true } },
  },
  {
    id: 'notetaker',
    name: '记录讲师',
    role: 'analyst',
    title: '证据链整理',
    avatarUrl: '/avatars/note-taker.png',
    avatar: '/avatars/note-taker.png',
    avatarKind: 'preset',
    color: '#ca8a04',
    language: 'zh-CN',
    lang: 'zh-CN',
    voiceProfileId: 'kokoro:zf_xiaoyi',
    voicePrompt: '稳定、清楚、偏步骤复盘的中文声音。',
    voiceConfig: { providerId: 'kokoro-tts', voice: 'zf_xiaoyi', speed: 1 },
  },
];

export const DEFAULT_RUNTIME_TTS: RuntimeTTSConfig = {
  providerId: 'qwen-tts',
  voice: 'Cherry',
  speed: 1,
  responseFormat: 'wav',
  providerOptions: { languageType: 'Chinese', sse: true },
  fallbackProviderId: 'browser-native-tts',
};


