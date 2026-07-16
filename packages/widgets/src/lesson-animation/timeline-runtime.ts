import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { AnimationSlideScene, AnimationStagePage } from '@dgbook/animation';

export type TimelineCommand = {
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
} | null;

export type TimelineElementState = {
  visible: boolean;
  active: boolean;
  className: string;
  effects: string[];
  rowRevealCount?: number;
  captionText?: string;
  countValue?: string;
  typeText?: string;
  cueProgress?: number;
};

export type TimelinePacket = {
  id: string;
  lineId: string;
  durationMs: number;
  progress: number;
  color?: string;
  repeat: boolean;
};

export type TimelineWhiteboardItem = {
  id: string;
  type: 'text' | 'line' | 'shape' | 'chart' | 'table' | 'code' | 'formula';
  targets: string[];
  progress: number;
  payload: Record<string, unknown>;
};

export type TimelineTransition = {
  id: string;
  progress: number;
  payload: Record<string, unknown>;
};

export type TimelineFocus = {
  id: string;
  effect: string;
  target: string;
  targets: string[];
  caption?: string;
  color?: string;
};

export type TimelinePhaseState = {
  activePhase: number;
  phaseCount: number;
  progress: number;
  page?: AnimationStagePage;
};

type TimelineRuntimeArgs = {
  scene: AnimationSlideScene;
  artifact?: unknown;
  activeTarget: string | null;
  command?: TimelineCommand;
};

type RawCue = Record<string, unknown>;

type ResolvedCue = {
  id: string;
  effect: string;
  className: string;
  startMs: number;
  durationMs: number;
  holdMs: number;
  targets: string[];
  payload: Record<string, unknown>;
  easing?: string;
};

type TimelineSource = {
  cues: RawCue[];
  durationMs?: number;
  pages: AnimationStagePage[];
};

export function useTimelineRuntime({ scene, artifact, activeTarget, command }: TimelineRuntimeArgs) {
  const timeline = useMemo(() => readTimeline(scene, artifact), [artifact, scene]);
  const baseCues = useMemo(() => resolveCues(timeline.cues), [timeline.cues]);
  const [runtimeCues, setRuntimeCues] = useState<ResolvedCue[]>([]);
  const cues = useMemo(() => [...baseCues, ...runtimeCues], [baseCues, runtimeCues]);
  const totalDurationMs = useMemo(() => {
    const cueDuration = cues.reduce((max, cue) => Math.max(max, cue.startMs + cue.durationMs + cue.holdMs), 0);
    return Math.max(timeline.durationMs ?? 0, cueDuration);
  }, [cues, timeline.durationMs]);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [clockSerial, setClockSerial] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const cursorRef = useRef({ timeMs: 0, requestedAt: 0 });
  const currentTimeRef = useRef(0);
  const handledCommandNonceRef = useRef<number | null>(null);

  useEffect(() => {
    setRuntimeCues([]);
  }, [timeline]);

  useEffect(() => {
    currentTimeRef.current = currentTimeMs;
  }, [currentTimeMs]);

  useEffect(() => {
    if (cues.length === 0) {
      setCurrentTimeMs(0);
      return undefined;
    }

    if (!playing) return undefined;
    if (clockSerial === 0) cursorRef.current = { timeMs: 0, requestedAt: performance.now() };
    let frame = 0;
    let lastPaint = 0;
    const endAt = Math.max(totalDurationMs, 0);

    const tick = (timestamp: number) => {
      const elapsed = cursorRef.current.timeMs + (timestamp - cursorRef.current.requestedAt) * speed;
      const next = endAt > 0 ? Math.min(elapsed, endAt) : Math.max(0, elapsed);
      if (timestamp - lastPaint > 32 || next === endAt) {
        lastPaint = timestamp;
        setCurrentTimeMs(next);
      }
      if (next < endAt) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [clockSerial, cues.length, playing, speed, totalDurationMs]);

  useEffect(() => {
    if (!command) return;
    if (handledCommandNonceRef.current === command.nonce) return;
    handledCommandNonceRef.current = command.nonce;
    const commandTimeMs = currentTimeRef.current;
    if (command.mode === 'pause') {
      cursorRef.current = { timeMs: commandTimeMs, requestedAt: performance.now() };
      setPlaying(false);
      return;
    }
    if (command.mode === 'reset') {
      setRuntimeCues([]);
      setPlaying(false);
      seekTimeline(command.currentTimeMs ?? 0, setCurrentTimeMs, cursorRef, setClockSerial, false);
      return;
    }
    if (command.mode === 'resume') {
      if (typeof command.speed === 'number' && Number.isFinite(command.speed)) setSpeed(Math.max(0.5, Math.min(2, command.speed)));
      cursorRef.current = { timeMs: commandTimeMs, requestedAt: performance.now() };
      setPlaying(true);
      setClockSerial((value) => value + 1);
      return;
    }
    if (command.mode === 'seek') {
      const cue = command.cueId ? cues.find((item) => item.id === command.cueId) : null;
      const targetCue = !cue ? matchingCommandCue(cues, command) : null;
      const timeMs = command.currentTimeMs ?? cue?.startMs ?? targetCue?.startMs ?? 0;
      seekTimeline(timeMs, setCurrentTimeMs, cursorRef, setClockSerial, false);
      setPlaying(false);
      return;
    }
    if (cues.length === 0) return;
    const cue = command.cueId ? cues.find((item) => item.id === command.cueId) : null;
    const targetCue = !cue ? matchingCommandCue(cues, command) : null;
    const commandCue = !cue && !targetCue && command.effect ? cueFromCommand(command, currentTimeRef.current) : null;
    if (commandCue) {
      setRuntimeCues((items) => [...items.filter((item) => item.id !== commandCue.id), commandCue]);
      seekTimeline(commandCue.startMs, setCurrentTimeMs, cursorRef, setClockSerial, playing || !command.mode);
      if (!command.mode) setPlaying(true);
      return;
    }
    const timeMs = command.currentTimeMs ?? cue?.startMs ?? targetCue?.startMs;
    if (typeof timeMs === 'number' && Number.isFinite(timeMs)) {
      seekTimeline(timeMs, setCurrentTimeMs, cursorRef, setClockSerial, playing || !command.mode);
      if (!command.mode) setPlaying(true);
    }
  }, [command, cues, playing]);

  const state = useMemo(() => {
    if (cues.length === 0) {
      return {
        elementStates: new Map<string, TimelineElementState>(),
        cameraStyle: undefined,
        packets: [] as TimelinePacket[],
        whiteboardItems: [] as TimelineWhiteboardItem[],
        transitions: [] as TimelineTransition[],
        focus: null as TimelineFocus | null,
        phaseState: timelinePhaseState(currentTimeMs, totalDurationMs, [], timeline.pages),
      };
    }
    return buildTimelineState(cues, currentTimeMs, activeTarget, totalDurationMs, timeline.pages);
  }, [activeTarget, cues, currentTimeMs, totalDurationMs, timeline.pages]);

  return {
    hasCues: cues.length > 0,
    currentTimeMs,
    playing,
    speed,
    cameraStyle: state.cameraStyle,
    packets: state.packets,
    whiteboardItems: state.whiteboardItems,
    transitions: state.transitions,
    focus: state.focus,
    phaseState: state.phaseState,
    getElementState(id: string) {
      return state.elementStates.get(id) ?? null;
    },
  };
}

function matchingCommandCue(cues: ResolvedCue[], command: NonNullable<TimelineCommand>) {
  const target = command.target ?? '';
  return cues.find((cue) => {
    if (command.effect && cue.effect !== command.effect) return false;
    if (target && !cue.targets.includes(target)) return false;
    if (typeof command.currentTimeMs === 'number' && Number.isFinite(command.currentTimeMs)) {
      return Math.abs(cue.startMs - command.currentTimeMs) <= 1200;
    }
    return Boolean(target);
  }) ?? null;
}

function seekTimeline(
  timeMs: number,
  setCurrentTimeMs: (timeMs: number) => void,
  cursorRef: { current: { timeMs: number; requestedAt: number } },
  restartClock: (update: (value: number) => number) => void,
  shouldRestart = true,
) {
  const safeTime = Math.max(0, timeMs);
  cursorRef.current = { timeMs: safeTime, requestedAt: performance.now() };
  setCurrentTimeMs(safeTime);
  if (shouldRestart) restartClock((value) => value + 1);
}

function buildTimelineState(cues: ResolvedCue[], currentTimeMs: number, activeTarget: string | null, totalDurationMs: number, pages: AnimationStagePage[]) {
  const elementStates = new Map<string, TimelineElementState>();
  const packets: TimelinePacket[] = [];
  const whiteboardItems: TimelineWhiteboardItem[] = [];
  const transitions: TimelineTransition[] = [];
  const phaseMarkers: number[] = [];
  let focus: TimelineFocus | null = null;
  let cameraStyle: CSSProperties | undefined;

  for (const cue of cues) {
    const cueActive = isCueActive(cue, currentTimeMs);
    const cueElapsed = currentTimeMs >= cue.startMs;
    const progress = cueProgress(cue, currentTimeMs);
    const activeTargetMatch = activeTarget ? cue.targets.includes(activeTarget) : false;
    const applyCue = cueActive;
    const phase = readNumber(cue.payload.phase);
    if (typeof phase === 'number') phaseMarkers.push(Math.max(1, Math.floor(phase)));
    if (cueElapsed && isFocusCue(cue)) focus = focusFromCue(cue);

    if (cue.effect === 'sceneTransition') {
      if (cueActive) transitions.push({ id: cue.id, progress, payload: cue.payload });
      continue;
    }

    if (cue.effect === 'whiteboardClear') {
      if (cueElapsed) whiteboardItems.length = 0;
      continue;
    }

    if (isWhiteboardEffect(cue.effect)) {
      if (cueElapsed || cueActive) {
        whiteboardItems.push({
          id: cue.id,
          type: whiteboardItemType(cue.effect),
          targets: cue.targets,
          progress,
          payload: cue.payload,
        });
      }
      continue;
    }

    if (isCameraEffect(cue.effect)) {
      if (cueElapsed || cueActive) cameraStyle = cameraCueStyle(cue, progress);
      continue;
    }

    for (const target of cue.targets) {
      const state = getOrCreateState(elementStates, target);

      if (cue.effect === 'enter' && (cueElapsed || activeTargetMatch)) state.visible = true;
      if (cue.effect === 'exit' && currentTimeMs >= cue.startMs + cue.durationMs && !activeTargetMatch) state.visible = false;

      if (applyCue) {
        state.active = true;
        state.cueProgress = Math.max(state.cueProgress ?? 0, progress);
        addEffect(state, cue);
      }

      if (cue.effect === 'tableRowReveal' && (cueElapsed || activeTargetMatch)) {
        state.rowRevealCount = Math.max(state.rowRevealCount ?? 0, rowRevealCount(cue, cueActive ? progress : 1));
      }

      if (cue.effect === 'captionUpdate' && cueElapsed) {
        state.captionText = readString(cue.payload.caption ?? cue.payload.text ?? cue.payload.content ?? cue.payload.value);
      }

      if (cue.effect === 'countUp' && cueElapsed) {
        state.countValue = countUpValue(cue, cueActive ? progress : 1);
      }

      if (cue.effect === 'typeText' && cueElapsed) {
        state.typeText = typeTextValue(cue, cueActive ? progress : 1);
      }

      if ((cue.effect === 'packetMove' || cue.effect === 'pathFlow') && cueActive) {
        packets.push({
          id: cue.id,
          lineId: target,
          durationMs: cue.durationMs,
          progress,
          color: readString(cue.payload.color),
          repeat: readBoolean(cue.payload.repeat) ?? cue.holdMs > cue.durationMs,
        });
      }
    }
  }

  for (const state of elementStates.values()) {
    state.className = [
      'is-timeline-managed',
      state.visible ? 'is-timeline-visible' : 'is-timeline-hidden',
      state.active && 'is-timeline-active',
      ...state.effects,
    ].filter(Boolean).join(' ');
  }

  return { elementStates, cameraStyle, packets, whiteboardItems, transitions, focus, phaseState: timelinePhaseState(currentTimeMs, totalDurationMs, phaseMarkers, pages) };
}

function timelinePhaseState(currentTimeMs: number, totalDurationMs: number, phaseMarkers: number[], pages: AnimationStagePage[]): TimelinePhaseState {
  const page = pages.find((item) => currentTimeMs >= item.startMs && currentTimeMs < item.startMs + item.durationMs) ?? pages.at(-1);
  if (page) {
    return {
      activePhase: page.phase,
      phaseCount: Math.max(1, pages.length),
      progress: clamp((currentTimeMs - page.startMs) / Math.max(1, page.durationMs), 0, 1),
      page,
    };
  }
  const phaseCount = Math.max(1, ...phaseMarkers, pages.length);
  const duration = Math.max(1, totalDurationMs);
  const phaseWidth = duration / phaseCount;
  const activePhase = clamp(Math.floor(currentTimeMs / phaseWidth) + 1, 1, phaseCount);
  const phaseStart = (activePhase - 1) * phaseWidth;
  return {
    activePhase,
    phaseCount,
    progress: clamp((currentTimeMs - phaseStart) / phaseWidth, 0, 1),
  };
}

function getOrCreateState(states: Map<string, TimelineElementState>, id: string) {
  const current = states.get(id);
  if (current) return current;
  const next: TimelineElementState = { visible: true, active: false, className: '', effects: [] };
  states.set(id, next);
  return next;
}

function addEffect(state: TimelineElementState, cue: ResolvedCue) {
  if (!state.effects.includes(cue.className)) state.effects.push(cue.className);
}

function isFocusCue(cue: ResolvedCue) {
  if (cue.targets.length === 0) return false;
  return cue.effect === 'spotlight' || cue.effect === 'laser' || cue.effect === 'highlight';
}

function focusFromCue(cue: ResolvedCue): TimelineFocus {
  const target = cue.targets[0] ?? '';
  return {
    id: cue.id,
    effect: cue.effect,
    target,
    targets: cue.targets,
    caption: readString(cue.payload.caption ?? cue.payload.text ?? cue.payload.content ?? cue.payload.phaseLabel),
    color: readString(cue.payload.color),
  };
}

function readTimeline(scene: AnimationSlideScene, artifact: unknown): TimelineSource {
  const artifactRecord = artifact as { timeline?: unknown; durationMs?: unknown; pages?: unknown } | null;
  const artifactTimeline = readTimelineSource(artifactRecord?.timeline);
  const sceneTimeline = readTimelineSource((scene as unknown as { timeline?: unknown }).timeline);
  const seen = new Set<string>();
  const cueSource: RawCue[] = [...(artifactTimeline?.cues ?? []), ...(sceneTimeline?.cues ?? [])];
  const cues = cueSource.filter((cue) => {
    const id = typeof cue.id === 'string' ? cue.id : '';
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return {
    cues,
    durationMs: readNumber(artifactTimeline?.durationMs ?? sceneTimeline?.durationMs ?? artifactRecord?.durationMs),
    pages: readPages(artifactRecord?.pages),
  };
}

function readPages(value: unknown): AnimationStagePage[] {
  if (!Array.isArray(value)) return [];
  const pages: AnimationStagePage[] = [];
  value.forEach((item, index) => {
      if (!isRecord(item)) return;
      const phase = readNumber(item.phase) ?? index + 1;
      const startMs = readNumber(item.startMs);
      const durationMs = readNumber(item.durationMs);
      const title = readString(item.title);
      if (!title || typeof startMs !== 'number' || typeof durationMs !== 'number') return;
      pages.push({
        id: readString(item.id) ?? `page-${phase}`,
        phase: Math.max(1, Math.floor(phase)),
        title,
        startMs,
        durationMs,
        summary: readString(item.summary),
        focusElementId: readString(item.focusElementId),
      });
    });
  return pages.sort((a, b) => a.startMs - b.startMs);
}

function readTimelineSource(value: unknown): TimelineSource | null {
  if (!isRecord(value) || !Array.isArray(value.cues)) return null;
  return {
    cues: value.cues.filter(isRecord) as RawCue[],
    durationMs: readNumber(value.durationMs),
    pages: [],
  };
}

function resolveCues(rawCues: RawCue[]): ResolvedCue[] {
  const drafts = rawCues.map((cue, index) => {
    const payload = isRecord(cue.payload) ? cue.payload : {};
    const effect = normalizeEffect(readString(cue.effect) ?? readString(payload.effect) ?? 'highlight');
    return {
      raw: cue,
      id: readString(cue.id) ?? `cue-${index + 1}`,
      effect,
      className: `has-cue-${toKebabCase(effect)}`,
      startMs: readNumber(cue.atMs),
      after: readString(cue.after),
      durationMs: readNumber(cue.durationMs ?? payload.durationMs) ?? defaultDurationMs(effect),
      holdMs: readNumber(cue.holdMs ?? payload.holdMs) ?? 0,
      targets: readTargets(cue.targets ?? cue.target ?? cue.elementId ?? payload.targets ?? payload.target),
      payload,
      easing: readString(cue.easing ?? payload.easing),
    };
  });
  const byId = new Map(drafts.map((cue) => [cue.id, cue]));
  const resolveStart = (cue: typeof drafts[number], seen = new Set<string>()): number => {
    if (typeof cue.startMs === 'number') return cue.startMs;
    if (!cue.after || seen.has(cue.id)) return 0;
    const previous = byId.get(cue.after);
    if (!previous) return 0;
    seen.add(cue.id);
    return resolveStart(previous, seen) + previous.durationMs + previous.holdMs;
  };

  return drafts.map((cue) => ({
    id: cue.id,
    effect: cue.effect,
    className: cue.className,
    startMs: resolveStart(cue),
    durationMs: cue.durationMs,
    holdMs: cue.holdMs,
    targets: cue.targets,
    payload: cue.payload,
    easing: cue.easing,
  }));
}

function cueFromCommand(command: NonNullable<TimelineCommand>, currentTimeMs: number): ResolvedCue | null {
  const targets = command.targets?.length ? command.targets : command.target ? [command.target] : [];
  if (!command.effect || targets.length === 0) return null;
  const payload = command.payload ?? {};
  const effect = normalizeEffect(command.effect);
  const durationMs = command.durationMs ?? readNumber(payload.durationMs) ?? defaultDurationMs(effect);
  return {
    id: command.cueId ?? `runtime-${effect}-${targets.join('-')}-${command.nonce}`,
    effect,
    className: `has-cue-${toKebabCase(effect)}`,
    startMs: command.currentTimeMs ?? currentTimeMs,
    durationMs,
    holdMs: command.holdMs ?? readNumber(payload.holdMs) ?? defaultRuntimeHoldMs(effect, durationMs),
    targets,
    payload,
    easing: readString(payload.easing),
  };
}

function isCueActive(cue: ResolvedCue, currentTimeMs: number) {
  return currentTimeMs >= cue.startMs && currentTimeMs <= cue.startMs + cue.durationMs + cue.holdMs;
}

function cueProgress(cue: ResolvedCue, currentTimeMs: number) {
  if (cue.durationMs <= 0) return currentTimeMs >= cue.startMs ? 1 : 0;
  return clamp((currentTimeMs - cue.startMs) / cue.durationMs, 0, 1);
}

function cameraCueStyle(cue: ResolvedCue, progress: number): CSSProperties {
  const fromScale = readNumber(cue.payload.fromScale ?? cue.payload.fromZoom) ?? 1;
  const toScale = readNumber(cue.payload.scale ?? cue.payload.zoom ?? cue.payload.toScale ?? cue.payload.toZoom) ?? fromScale;
  const fromX = readNumber(cue.payload.fromX ?? cue.payload.fromPanX) ?? 0;
  const fromY = readNumber(cue.payload.fromY ?? cue.payload.fromPanY) ?? 0;
  const toX = readNumber(cue.payload.x ?? cue.payload.panX ?? cue.payload.toX ?? cue.payload.toPanX) ?? fromX;
  const toY = readNumber(cue.payload.y ?? cue.payload.panY ?? cue.payload.toY ?? cue.payload.toPanY) ?? fromY;
  const x = lerp(fromX, toX, progress);
  const y = lerp(fromY, toY, progress);
  const scale = lerp(fromScale, toScale, progress);
  const origin = readString(cue.payload.origin) ?? '50% 50%';
  return {
    transform: `translate(${x}px, ${y}px) scale(${scale})`,
    transformOrigin: origin,
    transitionDuration: `${Math.max(120, cue.durationMs)}ms`,
    transitionTimingFunction: cssEasing(cue.easing),
  };
}

function rowRevealCount(cue: ResolvedCue, progress: number) {
  const rowIndex = readNumber(cue.payload.rowIndex ?? cue.payload.index);
  if (typeof rowIndex === 'number') return Math.floor(rowIndex) + 1;
  const rowCount = readNumber(cue.payload.rowCount ?? cue.payload.rows ?? cue.payload.count);
  if (typeof rowCount === 'number') return Math.max(0, Math.ceil(rowCount * progress));
  return Number.MAX_SAFE_INTEGER;
}

function countUpValue(cue: ResolvedCue, progress: number) {
  const to = readNumber(cue.payload.to ?? cue.payload.value ?? cue.payload.count);
  if (typeof to !== 'number') return undefined;
  const from = readNumber(cue.payload.from) ?? 0;
  const decimals = readNumber(cue.payload.decimals) ?? (Number.isInteger(to) && Number.isInteger(from) ? 0 : 1);
  const value = lerp(from, to, progress);
  const prefix = readString(cue.payload.prefix) ?? '';
  const suffix = readString(cue.payload.suffix) ?? '';
  return `${prefix}${value.toFixed(Math.max(0, Math.min(4, decimals)))}${suffix}`;
}

function typeTextValue(cue: ResolvedCue, progress: number) {
  const text = readString(cue.payload.text ?? cue.payload.content ?? cue.payload.value ?? cue.payload.caption);
  if (!text) return undefined;
  const length = Math.max(1, Math.ceil(text.length * clamp(progress, 0, 1)));
  return text.slice(0, length);
}

function defaultDurationMs(effect: string) {
  if (effect === 'packetMove' || effect === 'pathFlow') return 1200;
  if (isWhiteboardEffect(effect)) return 900;
  if (effect === 'sceneTransition') return 820;
  if (effect === 'typeText') return 1000;
  if (effect === 'cameraZoom' || effect === 'cameraPan') return 700;
  if (effect === 'tableRowReveal' || effect === 'countUp' || effect === 'captionUpdate') return 650;
  return 560;
}

function defaultRuntimeHoldMs(effect: string, durationMs: number) {
  if (effect === 'packetMove' || effect === 'pathFlow') return Math.max(1800, durationMs);
  return 0;
}

function normalizeEffect(effect: string) {
  if (effect === 'pathFlow') return 'pathFlow';
  return effect;
}

function isCameraEffect(effect: string) {
  return effect === 'cameraZoom' || effect === 'cameraPan';
}

function isWhiteboardEffect(effect: string) {
  return ['whiteboardText', 'whiteboardLine', 'whiteboardShape', 'whiteboardChart', 'whiteboardTable', 'whiteboardCode', 'whiteboardFormula'].includes(effect);
}

function whiteboardItemType(effect: string): TimelineWhiteboardItem['type'] {
  if (effect === 'whiteboardLine') return 'line';
  if (effect === 'whiteboardShape') return 'shape';
  if (effect === 'whiteboardChart') return 'chart';
  if (effect === 'whiteboardTable') return 'table';
  if (effect === 'whiteboardCode') return 'code';
  if (effect === 'whiteboardFormula') return 'formula';
  return 'text';
}

function readTargets(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => readString(item)).filter((item): item is string => Boolean(item));
  const target = readString(value);
  return target ? [target] : [];
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const next = Number(value);
    if (Number.isFinite(next)) return next;
  }
  return undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toKebabCase(value: string) {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[^a-zA-Z0-9_-]+/g, '-').toLowerCase();
}

function cssEasing(value: string | undefined) {
  if (value === 'linear' || value === 'ease' || value === 'ease-in' || value === 'ease-out' || value === 'ease-in-out') return value;
  return 'cubic-bezier(.16,1,.3,1)';
}

function lerp(from: number, to: number, progress: number) {
  return from + (to - from) * progress;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
