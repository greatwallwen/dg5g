import type {
  AnimationSlideBackground,
  AnimationTimeline,
  LessonAnimationArtifact,
  StageRendererCapability,
  TeachingAction,
  TeachingStageElement,
  VisualSceneTemplate,
  VisualScript,
} from './types';

export const DGBOOK_STAGE_RENDERER_CAPABILITIES: StageRendererCapability[] = [
  'text-fit',
  'shape-gradient',
  'shape-pattern',
  'line-marker',
  'line-curve',
  'image-clip',
  'image-filter',
  'video-placeholder',
  'chart-bar',
  'chart-line',
  'chart-pie',
  'chart-gauge',
  'chart-flow',
  'table-row-reveal',
  'latex',
  'code',
  'spotlight',
  'laser',
  'highlight',
  'camera',
  'packet-motion',
  'count-up',
  'caption-sync',
  'manim-media',
  'edugame-interactive',
];

export const DGBOOK_VISUAL_TEMPLATES: VisualSceneTemplate[] = [
  {
    id: 'signaling-ladder',
    label: 'Signaling ladder',
    description: 'Multi-node message sequence with packet flow, evidence labels, and synchronized narration.',
    elementRoles: ['title', 'diagram', 'step', 'caption'],
    recommendedActions: ['speech', 'spotlight', 'laser', 'widget_timelineCue'],
  },
  {
    id: 'network-topology',
    label: 'Network topology',
    description: 'Radio node, transport, and core-network topology with path flow and node pulse.',
    elementRoles: ['title', 'diagram', 'metric', 'caption'],
    recommendedActions: ['speech', 'spotlight', 'laser', 'widget_timelineCue'],
  },
  {
    id: 'kpi-dashboard',
    label: 'KPI dashboard',
    description: 'Metric cards, chart panels, table evidence, and count-up transitions.',
    elementRoles: ['title', 'metric', 'model', 'caption'],
    recommendedActions: ['speech', 'spotlight', 'widget_timelineCue'],
  },
  {
    id: 'parameter-decision-tree',
    label: 'Parameter decision tree',
    description: 'Branching parameter choices with diagnosis evidence and review checkpoints.',
    elementRoles: ['title', 'model', 'step', 'caption'],
    recommendedActions: ['speech', 'spotlight', 'laser', 'widget_timelineCue'],
  },
  {
    id: 'optimization-loop',
    label: 'Optimization loop',
    description: 'Before-after measurement, parameter update, verification, and closed-loop replay.',
    elementRoles: ['title', 'diagram', 'metric', 'caption'],
    recommendedActions: ['speech', 'spotlight', 'laser', 'widget_timelineCue'],
  },
  {
    id: 'manim-segment',
    label: 'Concept motion clip',
    description: 'Offline-rendered concept animation for transformations, paths, and clean transitions.',
    elementRoles: ['title', 'diagram', 'caption'],
    recommendedActions: ['speech', 'spotlight', 'widget_timelineCue'],
  },
  {
    id: 'edugame-practice',
    label: 'Interactive practice',
    description: 'Sandboxed Web interactive for parameter experiments after the narrated concept animation.',
    elementRoles: ['diagram', 'metric', 'caption'],
    recommendedActions: ['speech', 'widget_timelineCue'],
  },
];

export interface CompileVisualScriptOptions {
  background?: AnimationSlideBackground;
  presenterId?: string;
  voiceProfileId?: string;
}

export function compileVisualScript(
  script: VisualScript,
  options: CompileVisualScriptOptions = {},
): LessonAnimationArtifact {
  const actions = normalizeScriptActions(script.actions, {
    presenterId: options.presenterId ?? script.presenterId ?? 'teacher',
    voiceProfileId: options.voiceProfileId ?? script.voiceProfileId ?? 'qwen:Cherry',
  });
  const timeline = normalizeScriptTimeline(script);

  return {
    type: 'animation-slide',
    version: 2,
    aspectRatio: '16:9',
    durationMs: timeline.durationMs,
    minDurationMs: script.minDurationMs,
    timeline,
    mediaTracks: script.mediaTracks,
    interactiveRefs: script.interactiveRefs,
    scene: {
      id: script.id,
      title: script.title,
      type: 'slide',
      description: script.template,
      content: {
        type: 'slide',
        canvas: {
          id: `${script.id}-canvas`,
          width: 1000,
          height: 562,
          background: options.background ?? { type: 'solid', color: '#f8fafc' },
          elements: script.elements ?? [],
        },
      },
      actions,
      timeline,
    },
  };
}

export function templateCapabilities(templateId: string): StageRendererCapability[] {
  if (templateId === 'signaling-ladder') return ['line-marker', 'packet-motion', 'spotlight', 'laser', 'caption-sync'];
  if (templateId === 'network-topology') return ['line-curve', 'packet-motion', 'camera', 'highlight', 'caption-sync'];
  if (templateId === 'kpi-dashboard') return ['chart-bar', 'chart-line', 'chart-gauge', 'table-row-reveal', 'caption-sync'];
  if (templateId === 'parameter-decision-tree') return ['shape-gradient', 'shape-pattern', 'laser', 'spotlight', 'caption-sync'];
  if (templateId === 'optimization-loop') return ['chart-line', 'count-up', 'packet-motion', 'caption-sync'];
  if (templateId === 'manim-segment') return ['manim-media', 'caption-sync', 'camera'];
  if (templateId === 'edugame-practice') return ['edugame-interactive', 'caption-sync'];
  return DGBOOK_STAGE_RENDERER_CAPABILITIES;
}

function normalizeScriptActions(
  actions: TeachingAction[],
  defaults: { presenterId: string; voiceProfileId: string },
) {
  return actions.map((action) => {
    if (action.type !== 'speech') return action;
    const spokenText = action.spokenText ?? action.text ?? action.content ?? action.caption ?? '';
    const caption = action.caption ?? trimCaption(action.displayText ?? spokenText);
    return {
      ...action,
      speakerId: action.speakerId ?? defaults.presenterId,
      voiceProfileId: action.voiceProfileId ?? defaults.voiceProfileId,
      spokenText,
      caption,
      text: action.text ?? spokenText,
    };
  });
}

function normalizeScriptTimeline(script: VisualScript): AnimationTimeline {
  if (script.timeline) {
    return {
      ...script.timeline,
      durationMs: script.timeline.durationMs ?? inferTimelineDuration(script.timeline),
    };
  }

  const cues = script.beats?.flatMap((beat) => beat.cueIds?.map((id) => ({
    id,
    effect: 'highlight' as const,
    beatId: beat.id,
    speechId: beat.speechId,
    atMs: beat.startMs ?? 0,
    durationMs: beat.durationMs ?? 800,
    targets: beat.elementIds,
  })) ?? []) ?? [];

  return { cues, durationMs: inferTimelineDuration({ cues }) };
}

function inferTimelineDuration(timeline: AnimationTimeline) {
  return timeline.cues.reduce((duration, cue) => {
    const start = Number(cue.atMs ?? 0);
    const length = Math.max(Number(cue.durationMs ?? 0), Number(cue.holdMs ?? 0));
    return Math.max(duration, start + length);
  }, 0);
}

function trimCaption(value: string) {
  return value.length > 48 ? `${value.slice(0, 46)}...` : value;
}
