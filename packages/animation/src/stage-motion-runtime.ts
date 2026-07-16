import type { AnimationTimeline, AnimationTimelineCue } from './types';

export interface StageMotionElementState {
  id: string;
  visible: boolean;
  active: boolean;
  effects: string[];
  progress: number;
  className?: string;
  captionText?: string;
  rowRevealCount?: number;
  countValue?: string;
}

export interface StageMotionCamera {
  x: number;
  y: number;
  scale: number;
}

export interface StageMotionPacket {
  id: string;
  targetId?: string;
  x: number;
  y: number;
  progress: number;
  color?: string;
  label?: string;
}

export interface StageMotionSnapshot {
  timeMs: number;
  activeCueIds: string[];
  elements: Record<string, StageMotionElementState>;
  camera: StageMotionCamera;
  packets: StageMotionPacket[];
  caption?: string;
}

export interface ResolvedTimelineCue extends AnimationTimelineCue {
  resolvedAtMs: number;
  resolvedEndMs: number;
}

export class StageMotionRuntime {
  private timeline: AnimationTimeline | undefined;
  private transientCues: AnimationTimelineCue[] = [];
  private currentTimeMs = 0;

  constructor(timeline?: AnimationTimeline) {
    this.timeline = timeline;
  }

  setTimeline(timeline: AnimationTimeline | undefined) {
    this.timeline = timeline;
  }

  seek(timeMs: number) {
    this.currentTimeMs = Math.max(0, Number.isFinite(timeMs) ? timeMs : 0);
    return this.snapshot();
  }

  appendCue(cue: AnimationTimelineCue) {
    this.transientCues = [...this.transientCues.filter((item) => item.id !== cue.id), cue];
  }

  clearTransientCues() {
    this.transientCues = [];
  }

  snapshot(timeMs = this.currentTimeMs): StageMotionSnapshot {
    this.currentTimeMs = Math.max(0, Number.isFinite(timeMs) ? timeMs : 0);
    return buildStageMotionSnapshot(mergeTimeline(this.timeline, this.transientCues), this.currentTimeMs);
  }

  getResolvedCues() {
    return resolveTimelineCues(mergeTimeline(this.timeline, this.transientCues));
  }
}

export function resolveTimelineCues(timeline?: AnimationTimeline): ResolvedTimelineCue[] {
  const source = timeline?.cues ?? [];
  const resolved = new Map<string, ResolvedTimelineCue>();
  const output: ResolvedTimelineCue[] = [];

  for (const cue of source) {
    const start = resolveCueStart(cue, resolved, output);
    const duration = Math.max(0, Number(cue.durationMs ?? defaultCueDuration(cue)));
    const hold = Math.max(0, Number(cue.holdMs ?? 0));
    const item: ResolvedTimelineCue = {
      ...cue,
      resolvedAtMs: start,
      resolvedEndMs: start + Math.max(duration + hold, 1),
    };
    resolved.set(item.id, item);
    output.push(item);
  }

  return output.sort((a, b) => a.resolvedAtMs - b.resolvedAtMs);
}

export function buildStageMotionSnapshot(timeline: AnimationTimeline | undefined, timeMs: number): StageMotionSnapshot {
  const cues = resolveTimelineCues(timeline);
  const active = cues.filter((cue) => timeMs >= cue.resolvedAtMs && timeMs <= cue.resolvedEndMs);
  const elements: Record<string, StageMotionElementState> = {};
  let caption: string | undefined;
  let camera: StageMotionCamera = { x: 0, y: 0, scale: 1 };
  const packets: StageMotionPacket[] = [];

  for (const cue of cues) {
    if (cue.effect === 'captionUpdate' && timeMs >= cue.resolvedAtMs) {
      caption = String(cue.payload?.text ?? cue.payload?.caption ?? '');
    }
    if (timeMs < cue.resolvedAtMs || timeMs > cue.resolvedEndMs) continue;

    const progress = cueProgress(cue, timeMs);
    if (cue.effect === 'cameraPan' || cue.effect === 'cameraZoom') {
      camera = resolveCamera(cue, progress, camera);
    }
    if (cue.effect === 'packetMove') {
      packets.push(resolvePacket(cue, progress));
    }
    for (const target of cueTargets(cue)) {
      const current = elements[target] ?? createElementState(target);
      current.active = true;
      current.progress = Math.max(current.progress, progress);
      if (!current.effects.includes(cue.effect)) current.effects.push(cue.effect);
      current.className = classNameForEffects(current.effects);
      if (cue.effect === 'exit') current.visible = false;
      if (cue.effect === 'enter') current.visible = true;
      if (cue.effect === 'captionUpdate') current.captionText = caption;
      if (cue.effect === 'tableRowReveal') current.rowRevealCount = rowRevealCount(cue, progress);
      if (cue.effect === 'countUp') current.countValue = countValue(cue, progress);
      elements[target] = current;
    }
  }

  return {
    timeMs,
    activeCueIds: active.map((cue) => cue.id),
    elements,
    camera,
    packets,
    ...(caption ? { caption } : {}),
  };
}

function resolveCueStart(
  cue: AnimationTimelineCue,
  resolved: Map<string, ResolvedTimelineCue>,
  output: ResolvedTimelineCue[],
) {
  const explicit = Number(cue.atMs);
  if (Number.isFinite(explicit)) return explicit;
  if (cue.after && resolved.has(cue.after)) return resolved.get(cue.after)!.resolvedEndMs;
  const previous = output[output.length - 1];
  return previous ? previous.resolvedEndMs : 0;
}

function cueProgress(cue: ResolvedTimelineCue, timeMs: number) {
  const duration = Math.max(1, cue.resolvedEndMs - cue.resolvedAtMs);
  return Math.max(0, Math.min(1, (timeMs - cue.resolvedAtMs) / duration));
}

function defaultCueDuration(cue: AnimationTimelineCue) {
  if (cue.effect === 'spotlight' || cue.effect === 'laser' || cue.effect === 'highlight') return 1600;
  if (cue.effect === 'captionUpdate') return 900;
  if (cue.effect === 'packetMove') return 1200;
  if (cue.effect === 'cameraZoom' || cue.effect === 'cameraPan') return 700;
  if (cue.effect === 'draw' || cue.effect === 'flow') return 650;
  if (
    cue.effect === 'whiteboardText' ||
    cue.effect === 'whiteboardLine' ||
    cue.effect === 'whiteboardShape' ||
    cue.effect === 'whiteboardChart' ||
    cue.effect === 'whiteboardTable' ||
    cue.effect === 'whiteboardCode' ||
    cue.effect === 'whiteboardFormula'
  ) return 900;
  return 800;
}

function cueTargets(cue: AnimationTimelineCue) {
  return cue.targets?.filter(Boolean) ?? [];
}

function createElementState(id: string): StageMotionElementState {
  return { id, visible: true, active: false, effects: [], progress: 0 };
}

function classNameForEffects(effects: string[]) {
  return effects.map((effect) => `is-cue-${effect}`).join(' ');
}

function resolveCamera(cue: ResolvedTimelineCue, progress: number, current: StageMotionCamera): StageMotionCamera {
  const payload = cue.payload ?? {};
  const targetScale = Number(payload.scale ?? current.scale);
  const targetX = Number(payload.x ?? current.x);
  const targetY = Number(payload.y ?? current.y);
  return {
    scale: lerp(current.scale, targetScale, progress),
    x: lerp(current.x, targetX, progress),
    y: lerp(current.y, targetY, progress),
  };
}

function resolvePacket(cue: ResolvedTimelineCue, progress: number): StageMotionPacket {
  const payload = cue.payload ?? {};
  const from = point(payload.from, [0, 0]);
  const to = point(payload.to, [0, 0]);
  return {
    id: cue.id,
    targetId: cue.targets?.[0],
    x: lerp(from[0], to[0], progress),
    y: lerp(from[1], to[1], progress),
    progress,
    color: typeof payload.color === 'string' ? payload.color : undefined,
    label: typeof payload.label === 'string' ? payload.label : undefined,
  };
}

function rowRevealCount(cue: ResolvedTimelineCue, progress: number) {
  return Math.max(0, Math.ceil(Number(cue.payload?.rows ?? 1) * progress));
}

function countValue(cue: ResolvedTimelineCue, progress: number) {
  const from = Number(cue.payload?.from ?? 0);
  const to = Number(cue.payload?.to ?? 0);
  const suffix = typeof cue.payload?.suffix === 'string' ? cue.payload.suffix : '';
  return `${Math.round(lerp(from, to, progress))}${suffix}`;
}

function point(value: unknown, fallback: [number, number]): [number, number] {
  if (!Array.isArray(value) || value.length < 2) return fallback;
  const x = Number(value[0]);
  const y = Number(value[1]);
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : fallback;
}

function lerp(from: number, to: number, progress: number) {
  return from + (to - from) * progress;
}

function mergeTimeline(timeline: AnimationTimeline | undefined, transientCues: AnimationTimelineCue[]): AnimationTimeline | undefined {
  if (transientCues.length === 0) return timeline;
  return {
    ...timeline,
    cues: [...(timeline?.cues ?? []), ...transientCues],
    durationMs: timeline?.durationMs,
  };
}
