import type { StageActionEngineCallbacks } from './stage-action-engine';
import type {
  AnimationTimelineCue,
  AnimationTimelineEffect,
  LessonAnimationArtifact,
  LessonAnimationTarget,
  TeachingAction,
} from './types';

export type StageOverlayEffectType = 'highlight' | 'spotlight' | 'laser';
export type StageOverlayHoldPolicy = 'until-next-focus' | 'timed';

export interface StageOverlayEffect {
  id: string;
  type: StageOverlayEffectType;
  targets: string[];
  color?: string;
  caption?: string;
  dimOpacity?: number;
  holdPolicy?: StageOverlayHoldPolicy;
  minHoldMs?: number;
}

export interface StageTimelineCommand {
  mode?: 'seek' | 'pause' | 'resume' | 'reset';
  cueId?: string;
  target?: string;
  targets?: string[];
  effect?: string;
  payload?: Record<string, unknown>;
  durationMs?: number;
  holdMs?: number;
  currentTimeMs?: number;
  speed?: number;
  nonce: number;
}

export interface StageAnnotationState {
  target: string;
  content: string;
}

export interface StageVideoCommand {
  target: string;
  nonce: number;
}

export interface StageStateSnapshot {
  activeTargets: string[];
  annotation: StageAnnotationState | null;
  visualEffects: StageOverlayEffect[];
  videoCommand: StageVideoCommand | null;
  timelineCommand: StageTimelineCommand | null;
  version: number;
}

export interface StageStateStoreContext {
  artifact?: LessonAnimationArtifact;
  targets?: LessonAnimationTarget[];
}

export type StageWidgetActionPayload = {
  state?: Record<string, unknown> & { activeStep?: number; currentTimeMs?: number; timeMs?: number };
  cueId?: string;
  target?: string;
  targets?: unknown;
  elementId?: string;
  effect?: string;
  content?: string;
  caption?: string;
  color?: string;
  displayText?: string;
  text?: string;
  title?: string;
  dimOpacity?: number;
  durationMs?: number;
  holdMs?: number;
  holdPolicy?: string;
  minHoldMs?: number;
  currentTimeMs?: number;
  timeMs?: number;
  speed?: number;
  [key: string]: unknown;
};

type StageStateListener = (snapshot: StageStateSnapshot) => void;

const TIMELINE_EFFECTS = new Set<string>([
  'cameraZoom',
  'cameraPan',
  'captionUpdate',
  'sceneTransition',
  'draw',
  'flow',
  'pathFlow',
  'packetMove',
  'tableRowReveal',
  'countUp',
  'typeText',
  'whiteboardText',
  'whiteboardLine',
  'whiteboardShape',
  'whiteboardChart',
  'whiteboardTable',
  'whiteboardCode',
  'whiteboardFormula',
  'whiteboardClear',
]);

const STAGE_OVERLAY_EFFECTS = new Set<string>(['highlight', 'spotlight', 'laser']);
const LASER_MIN_HOLD_MS = 2400;
const LASER_MAX_HOLD_MS = 3600;
const FALLBACK_STAGE_DURATION_MS = 610_000;

export class StageStateStore {
  private context: StageStateStoreContext;
  private listeners = new Set<StageStateListener>();
  private snapshot: StageStateSnapshot;
  private serial = 0;

  constructor(context: StageStateStoreContext = {}) {
    this.context = context;
    this.snapshot = {
      activeTargets: initialTargets(context),
      annotation: null,
      visualEffects: [],
      videoCommand: null,
      timelineCommand: null,
      version: 0,
    };
  }

  updateContext(context: StageStateStoreContext) {
    this.context = context;
    if (this.snapshot.activeTargets.length === 0) {
      const activeTargets = initialTargets(context);
      if (activeTargets.length > 0) this.commit({ activeTargets });
    }
  }

  subscribe(listener: StageStateListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): StageStateSnapshot {
    return this.snapshot;
  }

  applyControlAction(rawType: string | undefined, payload: StageWidgetActionPayload = {}) {
    const type = normalizeStageWidgetActionType(rawType);

    if (type === 'SET_WIDGET_STATE') {
      this.setWidgetState(payload);
      return true;
    }

    if (type === 'SET_TIMELINE_TIME') {
      this.setTimelineCommand({ mode: 'seek', currentTimeMs: readPayloadTime(payload) ?? 0 });
      return true;
    }

    if (type === 'PAUSE_TIMELINE') {
      this.setTimelineCommand({ mode: 'pause' });
      return true;
    }

    if (type === 'RESUME_TIMELINE') {
      this.setTimelineCommand({ mode: 'resume', speed: payload.speed });
      return true;
    }

    if (type === 'RESET_STAGE') {
      this.reset();
      return true;
    }

    if (type === 'CLEAR_EFFECTS') {
      this.clearEffects();
      return true;
    }

    if (type === 'CAPTION_UPDATE') {
      this.captionUpdate(readActionTargets(payload), payload.caption ?? payload.content ?? '', payload);
      return true;
    }

    if (type === 'HIGHLIGHT_ELEMENT') {
      this.setVisualEffect('spotlight', readActionTargets(payload), normalizeFocusPayload(payload));
      return true;
    }

    if (type === 'SPOTLIGHT_ELEMENT') {
      this.setVisualEffect('spotlight', readActionTargets(payload), payload);
      return true;
    }

    if (type === 'LASER_ELEMENT') {
      this.setVisualEffect('laser', readActionTargets(payload), payload);
      return true;
    }

    const effect = stageEffectFromAction(type, payload);
    if (effect && (TIMELINE_EFFECTS.has(effect) || STAGE_OVERLAY_EFFECTS.has(effect))) {
      this.runTimelineCommand(effect, readActionTargets(payload), payload);
      return true;
    }

    return false;
  }

  toActionEngineCallbacks(): StageActionEngineCallbacks {
    return {
      onCaption: (caption, action) => this.captionUpdate(actionTargets(action), caption, action.state),
      onSpotlight: (action) => this.setVisualEffect('spotlight', actionTargets(action), action),
      onLaser: (action) => this.setVisualEffect('laser', actionTargets(action), action),
      onHighlight: (action) => this.setVisualEffect('spotlight', actionTargets(action), normalizeFocusPayload(action)),
      onVideo: (action) => this.playVideo(actionTargets(action), action),
      onTimelineCue: (cue, action) => this.runTimelineCue(cue, action),
      onWidgetAction: (action) => this.applyTeachingWidgetAction(action),
      onClearEffects: () => this.clearEffects(),
    };
  }

  reset() {
    this.commit({
      activeTargets: initialTargets(this.context),
      annotation: null,
      visualEffects: [],
      videoCommand: null,
      timelineCommand: { mode: 'reset', currentTimeMs: 0, nonce: this.nextNonce() },
    });
  }

  clearEffects() {
    this.commit({ visualEffects: [], annotation: null });
  }

  private setWidgetState(payload: StageWidgetActionPayload) {
    const step = payload.state?.activeStep;
    const patch: Partial<StageStateSnapshot> = {};
    if (typeof step === 'number') {
      const target = targetIdForStep(step, this.context);
      patch.activeTargets = [target];
      if (this.snapshot.visualEffects.length === 0) {
        patch.visualEffects = [createOverlayEffect('spotlight', [target], normalizeTimelineOverlayPayload('sceneTransition', payload), this.nextNonce())];
      }
    }
    const currentTimeMs = readPayloadTime(payload);
    if (typeof currentTimeMs === 'number') {
      patch.timelineCommand = { currentTimeMs, nonce: this.nextNonce() };
    }
    this.commit(patch);
  }

  private applyTeachingWidgetAction(action: TeachingAction) {
    if (action.type === 'widget_setState') {
      this.setWidgetState({ state: action.state ?? {} });
      return;
    }
    if (action.type === 'widget_annotation') {
      const targets = actionTargets(action);
      this.annotate(targets, action.content ?? action.text ?? '', action);
      return;
    }
    if (action.type === 'widget_reveal') {
      this.setVisualEffect('spotlight', actionTargets(action), normalizeFocusPayload(action));
    }
  }

  private annotate(targets: string[], content: string, source: { color?: string }) {
    targets = resolveStageTargets(targets, source, this.context);
    const target = targets[0];
    if (!target) return;
    const concise = content.trim().length <= 12;
    this.commit({
      activeTargets: targets,
      annotation: concise ? null : { target, content },
      visualEffects: [createOverlayEffect('spotlight', targets, normalizeFocusPayload(source), this.nextNonce())],
    });
  }

  private captionUpdate(targets: string[], content: unknown, payload: Record<string, unknown> | undefined) {
    targets = resolveStageTargets(targets, payload, this.context);
    const target = targets[0];
    const showStageCaption = payload?.showStageCaption === true;
    const shouldRetarget = targets.length > 0 && this.snapshot.visualEffects.length === 0;
    this.commit({
      ...(shouldRetarget ? { activeTargets: targets } : {}),
      ...(target && showStageCaption ? { annotation: { target, content: String(content ?? '') } } : {}),
      timelineCommand: {
        mode: 'seek',
        target,
        targets,
        effect: 'captionUpdate',
        payload: { ...(payload ?? {}), caption: content, content },
        currentTimeMs: readPayloadTime(payload ?? {}),
        nonce: this.nextNonce(),
      },
    });
  }

  private setVisualEffect(type: StageOverlayEffectType, targets: string[], source: StageOverlaySource) {
    targets = resolveStageTargets(targets, source, this.context);
    if (targets.length === 0) return;
    const target = targets[0];
    const currentTimeMs = readPayloadTime(source as Record<string, unknown>);
    const runtimeEffect = readString(source.state?.whiteboardEffect);
    const effect = createOverlayEffect(type, targets, source, this.nextNonce());
    const visualEffects = type === 'laser'
      ? [createOverlayEffect('spotlight', targets, normalizeFocusPayload(source), this.nextNonce()), effect]
      : [effect];
    this.commit({
      activeTargets: targets,
      visualEffects,
      ...(typeof currentTimeMs === 'number'
        ? {
            timelineCommand: {
              ...(runtimeEffect ? {} : { mode: 'seek' as const }),
              target,
              targets,
              effect: runtimeEffect ?? type,
              payload: { ...(source.state ?? {}), ...source },
              durationMs: readNumber(source.state?.durationMs) ?? source.durationMs,
              holdMs: readNumber(source.state?.holdMs) ?? source.holdMs,
              currentTimeMs,
              nonce: this.nextNonce(),
            },
          }
        : {}),
    });
  }

  private playVideo(targets: string[], action: TeachingAction) {
    targets = resolveStageTargets(targets, action, this.context);
    const target = targets[0];
    if (!target) return;
    this.commit({
      activeTargets: targets,
      visualEffects: [createOverlayEffect('spotlight', targets, normalizeFocusPayload(action), this.nextNonce())],
      videoCommand: { target, nonce: this.nextNonce() },
    });
  }

  private runTimelineCue(cue: AnimationTimelineCue, action?: TeachingAction) {
    const targets = cue.targets?.length ? cue.targets : action ? actionTargets(action) : [];
    this.runTimelineCommand(cue.effect, targets, {
      cueId: cue.id,
      effect: cue.effect,
      content: action?.content,
      color: action?.color,
      durationMs: cue.durationMs ?? action?.durationMs,
      holdMs: cue.holdMs ?? action?.holdMs,
      state: action?.state,
      ...(cue.payload ?? {}),
    });
  }

  private runTimelineCommand(effect: string, targets: string[], payload: StageWidgetActionPayload) {
    targets = resolveStageTargets(targets, payload, this.context);
    if (targets.length === 0 && effect !== 'whiteboardClear') {
      const phase = readSourcePhase(payload, this.context);
      const fallback = typeof phase === 'number'
        ? targetIdForPhase(phase, this.context)
        : this.snapshot.activeTargets[0] ?? firstStageTarget(this.context);
      if (fallback) targets = [fallback];
    }
    const target = targets[0];
    const overlayType = readTimelineOverlayEffectType(effect);
    const shouldRetarget = targets.length > 0 && (Boolean(overlayType) || this.snapshot.visualEffects.length === 0);
    const shouldKeepFocus = !overlayType && targets.length > 0 && this.snapshot.visualEffects.length === 0;
    this.commit({
      ...(shouldRetarget ? { activeTargets: targets } : {}),
      ...(overlayType && targets.length > 0 ? { visualEffects: [createOverlayEffect(overlayType, targets, normalizeTimelineOverlayPayload(effect, payload), this.nextNonce())] } : {}),
      ...(shouldKeepFocus ? { visualEffects: [createOverlayEffect('spotlight', targets, normalizeTimelineOverlayPayload(effect, payload), this.nextNonce())] } : {}),
      timelineCommand: {
        cueId: payload.cueId ?? target ?? effect,
        target,
        targets,
        effect,
        payload: { ...(payload.state ?? {}), ...payload },
        durationMs: payload.durationMs,
        holdMs: payload.holdMs,
        currentTimeMs: readPayloadTime(payload),
        nonce: this.nextNonce(),
      },
    });
  }

  private setTimelineCommand(command: Omit<StageTimelineCommand, 'nonce'>) {
    this.commit({ timelineCommand: { ...command, nonce: this.nextNonce() } });
  }

  private commit(patch: Partial<StageStateSnapshot>) {
    this.snapshot = {
      ...this.snapshot,
      ...patch,
      version: this.snapshot.version + 1,
    };
    for (const listener of this.listeners) listener(this.snapshot);
  }

  private nextNonce() {
    this.serial += 1;
    return Date.now() + this.serial;
  }
}

export function createStageTeachingActionFromWidgetAction(
  rawType: string | undefined,
  payload: StageWidgetActionPayload = {},
): TeachingAction | null {
  const type = normalizeStageWidgetActionType(rawType);
  const targets = readActionTargets(payload);
  const target = targets[0] ?? '';
  const id = payload.cueId ?? `${(type ?? 'stage-action').toLowerCase()}-${Date.now()}`;
  const state: Record<string, unknown> = { ...(payload.state ?? {}), targets };
  if (payload.holdPolicy) state.holdPolicy = payload.holdPolicy;
  if (payload.minHoldMs) state.minHoldMs = payload.minHoldMs;

  if (type === 'RUN_CUE') {
    return {
      id,
      type: 'widget_timelineCue',
      target,
      elementId: target,
      content: payload.effect ?? payload.content,
      state,
      durationMs: payload.durationMs,
      holdMs: payload.holdMs,
      color: payload.color,
    };
  }

  if (type === 'HIGHLIGHT_ELEMENT') {
    return { id, type: 'widget_highlight', target, elementId: target, state, color: payload.color };
  }

  if (type === 'SPOTLIGHT_ELEMENT') {
    return { id, type: 'spotlight', target, elementId: target, state, color: payload.color, dimOpacity: payload.dimOpacity };
  }

  if (type === 'LASER_ELEMENT') {
    return { id, type: 'laser', target, elementId: target, state, color: payload.color };
  }

  if (type === 'ANNOTATE_ELEMENT') {
    return { id, type: 'widget_annotation', target, elementId: target, state, content: payload.content ?? '', color: payload.color };
  }

  if (type === 'REVEAL_ELEMENT') {
    return { id, type: 'widget_reveal', target, elementId: target, state, color: payload.color };
  }

  if (type === 'PLAY_VIDEO') {
    return { id, type: 'play_video', target, elementId: target, state, color: payload.color };
  }

  return null;
}

export function normalizeStageWidgetActionType(type: string | undefined) {
  if (type === 'widget_highlight') return 'HIGHLIGHT_ELEMENT';
  if (type === 'spotlight') return 'SPOTLIGHT_ELEMENT';
  if (type === 'laser') return 'LASER_ELEMENT';
  if (type === 'widget_annotation') return 'ANNOTATE_ELEMENT';
  if (type === 'widget_reveal') return 'REVEAL_ELEMENT';
  if (type === 'widget_setState') return 'SET_WIDGET_STATE';
  if (type === 'play_video') return 'PLAY_VIDEO';
  if (type === 'widget_timelineCue') return 'RUN_CUE';
  if (type === 'cameraZoom') return 'CAMERA_ZOOM';
  if (type === 'captionUpdate') return 'CAPTION_UPDATE';
  return type;
}

function initialTargets(context: StageStateStoreContext) {
  const stageTarget = firstStageTarget(context);
  if (stageTarget) return [stageTarget];
  return context.targets?.[0]?.id ? [context.targets[0].id] : [];
}

function targetIdForStep(step: number, context: StageStateStoreContext) {
  const stageTarget = targetIdForPhase(step + 1, context);
  if (stageTarget) return stageTarget;
  return (
    context.artifact?.scene.actions?.[step]?.elementId ??
    context.artifact?.scene.actions?.[step]?.target ??
    context.targets?.[step]?.id ??
    `step-${step + 1}`
  );
}

function firstStageTarget(context: StageStateStoreContext): string | undefined {
  return context.artifact?.scene.content.canvas.elements.find((element) => element.type !== 'line')?.id;
}

function targetIdForPhase(phase: number, context: StageStateStoreContext): string | undefined {
  const elements = context.artifact?.scene.content.canvas.elements ?? [];
  return elements.find((element) => element.type !== 'line' && element.phase === phase)?.id ?? firstStageTarget(context);
}

function resolveStageTargets(
  targets: string[],
  source: Record<string, unknown> | StageOverlaySource | TeachingAction | undefined,
  context: StageStateStoreContext,
): string[] {
  if (targets.length === 0) return targets;
  const elements = context.artifact?.scene.content.canvas.elements ?? [];
  if (elements.length === 0) return targets;
  const elementIds = new Set(elements.map((element) => element.id));
  if (targets.every((target) => elementIds.has(target))) return targets;

  const phase = readSourcePhase(source, context);
  const fallback = typeof phase === 'number' ? targetIdForPhase(phase, context) : firstStageTarget(context);
  if (!fallback) return targets.filter((target) => elementIds.has(target));
  return targets.map((target) => (elementIds.has(target) ? target : fallback)).filter((target, index, all) => target && all.indexOf(target) === index);
}

function readSourcePhase(
  source: Record<string, unknown> | StageOverlaySource | TeachingAction | undefined,
  context: StageStateStoreContext,
): number | undefined {
  if (!source) return undefined;
  const record = source as Record<string, unknown>;
  const state = isRecord(record.state) ? record.state : {};
  const directPhase = readNumber(record.phase) ?? readNumber(state.phase);
  if (typeof directPhase === 'number') return directPhase;
  const activeStep = readNumber(state.activeStep);
  if (typeof activeStep === 'number') return activeStep + 1;
  const currentTimeMs = readPayloadTime(record);
  return typeof currentTimeMs === 'number' ? phaseFromTime(currentTimeMs, context) : undefined;
}

function phaseFromTime(currentTimeMs: number, context: StageStateStoreContext): number | undefined {
  const elements = context.artifact?.scene.content.canvas.elements ?? [];
  const phases = elements
    .map((element) => element.phase)
    .filter((phase): phase is number => typeof phase === 'number' && Number.isFinite(phase) && phase > 0);
  if (phases.length === 0) return undefined;
  const phaseCount = Math.max(...phases);
  const durationMs = readNumber((context.artifact as unknown as Record<string, unknown> | undefined)?.durationMs) ?? FALLBACK_STAGE_DURATION_MS;
  return Math.max(1, Math.min(phaseCount, Math.floor(currentTimeMs / (durationMs / phaseCount)) + 1));
}

function actionTargets(action: TeachingAction) {
  return readTargets(action.state?.targets ?? action.target ?? action.elementId ?? action.widgetId);
}

function readActionTargets(payload: StageWidgetActionPayload) {
  return readTargets(payload.targets ?? payload.state?.targets ?? payload.target ?? payload.elementId);
}

function readTargets(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => (typeof item === 'string' ? item : '')).filter(Boolean);
  return typeof value === 'string' && value.length > 0 ? [value] : [];
}

function readPayloadTime(payload: Record<string, unknown>) {
  const state = isRecord(payload.state) ? payload.state : {};
  const value = payload.currentTimeMs ?? payload.timeMs ?? state.currentTimeMs ?? state.timeMs;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stageEffectFromAction(type: string | undefined, payload: StageWidgetActionPayload): AnimationTimelineEffect | string | null {
  const effect = payload.effect ?? payload.content;
  if (typeof effect === 'string' && effect.length > 0) return effect;
  if (type === 'CAMERA_ZOOM') return 'cameraZoom';
  if (type === 'DRAW') return 'draw';
  if (type === 'FLOW') return 'flow';
  if (type === 'PACKET_MOVE') return 'packetMove';
  return null;
}

type StageOverlaySource = {
  color?: string;
  caption?: string;
  content?: string;
  displayText?: string;
  text?: string;
  title?: string;
  dimOpacity?: number;
  holdPolicy?: string;
  holdMs?: number;
  durationMs?: number;
  minHoldMs?: number;
  currentTimeMs?: number;
  timeMs?: number;
  state?: Record<string, unknown>;
};

function createOverlayEffect(
  type: StageOverlayEffectType,
  targets: string[],
  source: StageOverlaySource,
  nonce: number,
): StageOverlayEffect {
  const minHoldMs = readOverlayMinHoldMs(type, source);
  return {
    id: `${type}-${nonce}`,
    type,
    targets,
    color: source.color,
    caption: readOverlayCaption(source),
    dimOpacity: source.dimOpacity,
    holdPolicy: readOverlayHoldPolicy(source),
    ...(minHoldMs ? { minHoldMs } : {}),
  };
}

function readStageOverlayEffectType(effect: string): StageOverlayEffectType | null {
  return STAGE_OVERLAY_EFFECTS.has(effect) ? effect as StageOverlayEffectType : null;
}

function readTimelineOverlayEffectType(effect: string): StageOverlayEffectType | null {
  if (effect === 'sceneTransition') return 'spotlight';
  if (effect === 'highlight') return 'spotlight';
  return readStageOverlayEffectType(effect);
}

function normalizeFocusPayload<T extends StageOverlaySource>(payload: T): T {
  return {
    ...payload,
    dimOpacity: typeof payload.dimOpacity === 'number' ? payload.dimOpacity : 0.006,
    holdPolicy: payload.holdPolicy ?? 'until-next-focus',
  };
}

function normalizeTimelineOverlayPayload(effect: string, payload: StageWidgetActionPayload): StageWidgetActionPayload {
  if (effect !== 'sceneTransition') return payload;
  return {
    ...payload,
    caption: readString(payload.caption) ?? readString(payload.phaseLabel) ?? readString(payload.state?.caption) ?? readString(payload.state?.phaseLabel),
    dimOpacity: typeof payload.dimOpacity === 'number' ? payload.dimOpacity : 0.006,
    holdPolicy: payload.holdPolicy ?? 'until-next-focus',
  };
}

function readOverlayHoldPolicy(source: StageOverlaySource): StageOverlayHoldPolicy | undefined {
  const value = source.holdPolicy ?? readString(source.state?.holdPolicy) ?? readString(source.state?.focusPolicy);
  if (value === 'until-next-focus' || value === 'hold' || value === 'clear-on-next') return 'until-next-focus';
  if (value === 'timed' || value === 'clear-on-end') return 'timed';
  return undefined;
}

function readOverlayMinHoldMs(type: StageOverlayEffectType, source: StageOverlaySource): number | undefined {
  const value = source.minHoldMs ?? readNumber(source.state?.minHoldMs);
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return type === 'laser' ? clampLaserHold(value) : value;
  }
  if (type === 'laser') return clampLaserHold(source.holdMs ?? LASER_MIN_HOLD_MS);
  return undefined;
}

function clampLaserHold(value: number) {
  return Math.max(LASER_MIN_HOLD_MS, Math.min(LASER_MAX_HOLD_MS, value));
}

function readOverlayCaption(source: StageOverlaySource): string | undefined {
  return readString(source.caption)
    ?? readString(source.displayText)
    ?? readString(source.content)
    ?? readString(source.text)
    ?? readString(source.title)
    ?? readString(source.state?.caption)
    ?? readString(source.state?.displayText);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
