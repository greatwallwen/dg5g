import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import type {
  AnimationLineElement,
  AnimationMediaTrack,
  AnimationPPTElement,
  AnimationSlideBackground,
  AnimationSlideScene,
} from '@dgbook/animation';
import { StageElement, StageLine } from './StageElement';
import { StageOverlays, type StageEffect, type StageEffects } from './StageOverlays';
import { cssEscape, getLinePointAtProgress } from './stage-geometry';
import { useTimelineRuntime, type TimelineCommand, type TimelinePacket, type TimelineTransition, type TimelineWhiteboardItem } from './timeline-runtime';

export type VideoCommand = { target: string; nonce: number } | null;

export function TeachingStage({
  artifact,
  scene,
  activeTarget,
  annotation,
  visualEffect,
  videoCommand,
  timelineCommand,
}: {
  artifact?: unknown;
  scene: AnimationSlideScene;
  activeTarget: string | null;
  annotation: { target: string; content: string } | null;
  visualEffect: StageEffect | StageEffects;
  videoCommand: VideoCommand;
  timelineCommand?: TimelineCommand;
}) {
  const canvas = scene.content.canvas;
  const screenRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ scale: 1, left: 0, top: 0 });
  const elements = canvas.elements;
  const mediaTracks = readMediaTracks(artifact);
  const lineElements = elements.filter((element): element is AnimationLineElement => element.type === 'line');
  const visualElements = elements.filter((element) => element.type !== 'line');
  const timeline = useTimelineRuntime({ scene, artifact, activeTarget, command: timelineCommand });
  const commandPacket = useCommandPacket(timelineCommand);
  const visiblePackets = useMemo(() => {
    if (!commandPacket || !lineElements.some((line) => line.id === commandPacket.lineId)) return timeline.packets;
    return [...timeline.packets.filter((packet) => packet.id !== commandPacket.id), commandPacket];
  }, [commandPacket, lineElements, timeline.packets]);
  const visualEffects = Array.isArray(visualEffect) ? visualEffect : visualEffect ? [visualEffect] : [];
  const targetableVisualEffects = visualEffects.filter((effect) => Boolean(effect?.target || effect?.targets?.length));
  const firstVisualEffect = targetableVisualEffects[0];
  const phaseFocus = timeline.phaseState.page as { focusElementId?: string; title?: string; summary?: string } | undefined;
  const defaultFocusTarget = visualElements.find((element) => /title|top-band|headline/i.test(element.id))?.id ?? visualElements[0]?.id;
  const phaseFocusTarget = phaseFocus?.focusElementId ?? defaultFocusTarget;
  const phaseFocusCaption = [phaseFocus?.title, phaseFocus?.summary].filter(Boolean).join(' · ');
  const timelineFocusTarget = timeline.focus?.target ?? timeline.focus?.targets?.[0];
  const activeId = firstVisualEffect?.target ?? firstVisualEffect?.targets?.[0] ?? timelineFocusTarget ?? phaseFocusTarget ?? annotation?.target ?? activeTarget;
  const overlay = useMemo(() => {
    if (targetableVisualEffects.length > 0) return targetableVisualEffects;
    if (timeline.focus) {
      return {
        type: timeline.focus.effect === 'laser' ? 'laser' as const : 'spotlight' as const,
        target: timeline.focus.target,
        targets: timeline.focus.targets,
        caption: timeline.focus.caption,
        color: timeline.focus.color ?? '#14b8a6',
        dimOpacity: 0.006,
        holdPolicy: 'until-next-focus' as const,
      };
    }
    if (phaseFocusTarget) {
      return {
        type: 'spotlight' as const,
        target: phaseFocusTarget,
        caption: phaseFocusCaption,
        color: '#14b8a6',
        dimOpacity: 0.006,
        holdPolicy: 'until-next-focus' as const,
      };
    }
    if (!activeTarget) return null;
    return {
      type: 'spotlight' as const,
      target: activeTarget,
      color: '#14b8a6',
      dimOpacity: 0.006,
      holdPolicy: 'until-next-focus' as const,
    };
  }, [activeTarget, phaseFocusCaption, phaseFocusTarget, timeline.focus, targetableVisualEffects]);

  useEffect(() => {
    const node = screenRef.current;
    if (!node) return undefined;
    const update = () => {
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const scale = Math.max(0.1, Math.min(rect.width / canvas.width, rect.height / canvas.height));
      setViewport({
        scale,
        left: (rect.width - canvas.width * scale) / 2,
        top: (rect.height - canvas.height * scale) / 2,
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [canvas.height, canvas.width]);

  useEffect(() => {
    if (!videoCommand || !stageRef.current) return;
    const selector = `[data-animation-element-id="${cssEscape(videoCommand.target)}"]`;
    const video = stageRef.current.querySelector<HTMLVideoElement>(selector);
    if (!video) return;
    video.currentTime = 0;
    void video.play().catch(() => undefined);
  }, [videoCommand]);

  return (
    <>
      <div className="dg-teaching-stage-screen" ref={screenRef}>
        <div
          className="dg-teaching-stage"
          ref={stageRef}
          data-timeline-active-target={timeline.hasCues ? activeTarget ?? undefined : undefined}
          data-timeline-time-ms={timeline.hasCues ? Math.round(timeline.currentTimeMs) : undefined}
          data-stage-page={timeline.phaseState.page?.id}
          data-stage-phase={timeline.phaseState.activePhase}
          style={{
            ...backgroundStyle(canvas.background),
            width: canvas.width,
            height: canvas.height,
            transform: `translate(${viewport.left}px, ${viewport.top}px) scale(${viewport.scale})`,
          }}
        >
        <div className="dg-stage-camera" style={timeline.cameraStyle}>
          <StageBackground width={canvas.width} height={canvas.height} />
          <StageMediaTracks tracks={mediaTracks} currentTimeMs={timeline.currentTimeMs} playing={timeline.playing} speed={timeline.speed} />
          <svg className="dg-stage-lines" viewBox={`0 0 ${canvas.width} ${canvas.height}`} aria-hidden="true">
            <defs>
              {lineElements.map((element) => (
                <marker
                  key={`${element.id}-arrow`}
                  id={`${scene.id}-${element.id}-arrow`}
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill={element.color} />
                </marker>
              ))}
            </defs>
            {lineElements.map((element) => {
              const timelineState = timeline.getElementState(element.id);
              return (
                <StageLine
                  key={element.id}
                  sceneId={scene.id}
                  element={element}
                  active={activeId === element.id || Boolean(timelineState?.active)}
                  timelineState={timelineState}
                  activePhase={timeline.phaseState.activePhase}
                />
              );
            })}
            {visiblePackets.map((packet) => {
              const line = lineElements.find((element) => element.id === packet.lineId);
              if (!line) return null;
              const [cx, cy] = getLinePointAtProgress(line, packet.progress);
              return (
                <circle
                  key={packet.id}
                  className="dg-stage-packet"
                  cx={cx}
                  cy={cy}
                  r="7"
                  fill={packet.color ?? line.color}
                  data-timeline-packet={packet.id}
                  style={{ transitionDuration: `${Math.max(80, packet.durationMs / 3)}ms` }}
                />
              );
            })}
          </svg>
          <StageWhiteboard items={timeline.whiteboardItems} width={canvas.width} height={canvas.height} />

          {visualElements.map((element, index) => {
            const timelineState = timeline.getElementState(element.id);
            return (
              <StageElement
                key={element.id}
                element={element}
                index={index}
                active={activeId === element.id || Boolean(timelineState?.active)}
                timelineState={timelineState}
                activePhase={timeline.phaseState.activePhase}
              />
            );
          })}
        </div>

        <StagePageChrome page={timeline.phaseState.page} />
        <StagePhaseRail phaseState={timeline.phaseState} />
        <StageTransitions transitions={timeline.transitions} />
        <StageOverlays stageRef={stageRef} effect={overlay} width={canvas.width} height={canvas.height} />
        {annotation && <StageAnnotation annotation={annotation} target={findElement(elements, annotation.target)} />}
        </div>
      </div>
      <style dangerouslySetInnerHTML={{ __html: teachingStagePlaybackStyles }} />
    </>
  );
}

function StagePageChrome({ page }: { page?: { phase: number; title: string; summary?: string } }) {
  if (!page) return null;
  return (
    <div className="dg-stage-page-chrome" aria-hidden="true">
      <span>Page {page.phase}</span>
      <strong>{page.title}</strong>
    </div>
  );
}

function StagePhaseRail({ phaseState }: { phaseState: { activePhase: number; phaseCount: number; progress: number } }) {
  return (
    <div className="dg-stage-phase-rail" aria-hidden="true">
      {Array.from({ length: phaseState.phaseCount }, (_, index) => {
        const phase = index + 1;
        return (
          <span
            key={phase}
            className={phase < phaseState.activePhase ? 'is-past' : phase === phaseState.activePhase ? 'is-current' : 'is-future'}
            style={phase === phaseState.activePhase ? ({ '--phase-progress': phaseState.progress } as CSSProperties) : undefined}
          />
        );
      })}
    </div>
  );
}

function StageTransitions({ transitions }: { transitions: TimelineTransition[] }) {
  if (transitions.length === 0) return null;
  const transition = transitions[transitions.length - 1]!;
  const styleName = String(transition.payload.style ?? transition.payload.kind ?? 'sweep');
  const x = -78 + transition.progress * 160;
  const xAlt = -86 + transition.progress * 170;
  const xLine = -74 + transition.progress * 150;
  const phaseLabel = typeof transition.payload.phaseLabel === 'string' ? transition.payload.phaseLabel : null;
  return (
    <div
      className={`dg-stage-transition is-${styleName}`}
      data-stage-transition={transition.id}
      style={{
        '--transition-x': `${x}%`,
        '--transition-x-alt': `${xAlt}%`,
        '--transition-x-line': `${xLine}%`,
      } as CSSProperties}
      aria-hidden="true"
    >
      <span />
      <i />
      <b />
      {phaseLabel && <strong>{phaseLabel}</strong>}
    </div>
  );
}

function StageWhiteboard({ items, width, height }: { items: TimelineWhiteboardItem[]; width: number; height: number }) {
  if (items.length === 0) return null;
  return (
    <svg className="dg-stage-whiteboard" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {items.map((item) => {
        if (item.type === 'line') return <WhiteboardLine key={item.id} item={item} />;
        if (item.type === 'shape') return <WhiteboardShape key={item.id} item={item} />;
        if (item.type === 'chart') return <WhiteboardChart key={item.id} item={item} />;
        if (item.type === 'table') return <WhiteboardTable key={item.id} item={item} />;
        if (item.type === 'code') return <WhiteboardCode key={item.id} item={item} />;
        if (item.type === 'formula') return <WhiteboardFormula key={item.id} item={item} />;
        return <WhiteboardText key={item.id} item={item} />;
      })}
    </svg>
  );
}

function StageMediaTracks({ tracks, currentTimeMs, playing, speed }: { tracks: AnimationMediaTrack[]; currentTimeMs: number; playing: boolean; speed: number }) {
  if (tracks.length === 0) return null;
  return (
    <div className="dg-stage-media-tracks" aria-hidden="true">
      {tracks.map((track) => {
        const start = track.startMs ?? 0;
        const end = start + (track.durationMs ?? Number.POSITIVE_INFINITY);
        const visible = currentTimeMs >= start && currentTimeMs <= end;
        const style: CSSProperties = {
          left: track.x ?? 60,
          top: track.y ?? 96,
          width: track.width ?? 520,
          height: track.height ?? 300,
          opacity: visible ? track.opacity ?? 1 : 0,
          objectFit: track.fit ?? 'contain',
          visibility: visible ? undefined : 'hidden',
        };
        return (
          <StageMediaTrack key={track.id} track={track} startMs={start} visible={visible} currentTimeMs={currentTimeMs} playing={playing} speed={speed} style={style} />
        );
      })}
    </div>
  );
}

function StageMediaTrack({
  track,
  startMs,
  visible,
  currentTimeMs,
  playing,
  speed,
  style,
}: {
  track: AnimationMediaTrack;
  startMs: number;
  visible: boolean;
  currentTimeMs: number;
  playing: boolean;
  speed: number;
  style: CSSProperties;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = Math.max(0.5, Math.min(2, speed));
    if (!visible || !playing) {
      video.pause();
      return;
    }
    const targetTime = Math.max(0, (currentTimeMs - startMs) / 1000);
    if (Number.isFinite(targetTime) && Math.abs(video.currentTime - targetTime) > 0.75) {
      video.currentTime = targetTime;
    }
    void video.play().catch(() => undefined);
  }, [currentTimeMs, playing, speed, startMs, visible]);

  return (
    <div
      id={track.id}
      className={`dg-stage-media-track is-${track.kind}`}
      style={style}
      data-dgbook-target={track.id}
      data-widget-step={track.id}
      data-animation-element-id={track.id}
      data-animation-type="video"
      data-animation-role="diagram"
      data-media-track={track.id}
      data-media-controlled="timeline"
      data-media-visible={String(visible)}
    >
      {track.videoUrl ? (
        <video ref={videoRef} src={track.videoUrl} poster={track.posterUrl} muted playsInline preload="metadata" />
      ) : track.posterUrl ? (
        <img src={track.posterUrl} alt="" loading="lazy" />
      ) : null}
    </div>
  );
}

function WhiteboardText({ item }: { item: TimelineWhiteboardItem }) {
  const text = String(item.payload.text ?? item.payload.content ?? item.payload.value ?? '');
  const x = readNumber(item.payload.x) ?? 72;
  const y = readNumber(item.payload.y) ?? 118;
  const color = String(item.payload.color ?? '#0f766e');
  const visibleText = text.slice(0, Math.ceil(text.length * item.progress));
  return (
    <text
      x={x}
      y={y}
      fill={color}
      className="dg-stage-whiteboard-text"
      style={{ opacity: Math.min(1, 0.35 + item.progress * 0.65) }}
    >
      {visibleText}
    </text>
  );
}

function WhiteboardLine({ item }: { item: TimelineWhiteboardItem }) {
  const x1 = readNumber(item.payload.x1) ?? 72;
  const y1 = readNumber(item.payload.y1) ?? 118;
  const x2 = readNumber(item.payload.x2) ?? 240;
  const y2 = readNumber(item.payload.y2) ?? 118;
  const color = String(item.payload.color ?? '#0f766e');
  const width = readNumber(item.payload.width) ?? 4;
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x1 + (x2 - x1) * item.progress}
      y2={y1 + (y2 - y1) * item.progress}
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      className="dg-stage-whiteboard-line"
    />
  );
}

function WhiteboardShape({ item }: { item: TimelineWhiteboardItem }) {
  const x = readNumber(item.payload.x) ?? 72;
  const y = readNumber(item.payload.y) ?? 96;
  const width = readNumber(item.payload.width) ?? 118;
  const height = readNumber(item.payload.height) ?? 54;
  const color = String(item.payload.color ?? '#0f766e');
  const shape = String(item.payload.shape ?? 'rect');
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const transform = `translate(${centerX} ${centerY}) scale(${Math.max(0.08, item.progress)}) translate(${-centerX} ${-centerY})`;
  const common = {
    stroke: color,
    strokeWidth: 4,
    fill: String(item.payload.fill ?? 'rgba(255,255,255,.16)'),
    className: 'dg-stage-whiteboard-shape',
    style: { opacity: Math.min(1, 0.3 + item.progress * 0.7) },
    transform,
  };
  if (shape === 'circle') {
    return <circle cx={centerX} cy={centerY} r={Math.min(width, height) / 2} {...common} />;
  }
  return <rect x={x} y={y} width={width} height={height} rx={14} {...common} />;
}

function WhiteboardChart({ item }: { item: TimelineWhiteboardItem }) {
  const x = readNumber(item.payload.x) ?? 72;
  const y = readNumber(item.payload.y) ?? 126;
  const width = readNumber(item.payload.width) ?? 154;
  const height = readNumber(item.payload.height) ?? 74;
  const color = String(item.payload.color ?? '#2563eb');
  const values = readNumberList(item.payload.values, [0.32, 0.58, 0.44, 0.76]).slice(0, 6);
  const gap = Math.max(6, width / Math.max(10, values.length * 2));
  const barWidth = Math.max(8, (width - gap * (values.length + 1)) / Math.max(1, values.length));
  return (
    <g className="dg-stage-whiteboard-chart" style={{ opacity: Math.min(1, 0.32 + item.progress * 0.68) }}>
      <rect x={x} y={y} width={width} height={height} rx={10} fill="rgba(255,255,255,.2)" stroke={color} strokeWidth={3} />
      {values.map((value, index) => {
        const progress = Math.min(1, item.progress * 1.18);
        const barHeight = Math.max(8, height * 0.66 * value * progress);
        const barX = x + gap + index * (barWidth + gap);
        const barY = y + height - 12 - barHeight;
        return <rect key={index} x={barX} y={barY} width={barWidth} height={barHeight} rx={4} fill={color} />;
      })}
    </g>
  );
}

function WhiteboardTable({ item }: { item: TimelineWhiteboardItem }) {
  const x = readNumber(item.payload.x) ?? 72;
  const y = readNumber(item.payload.y) ?? 216;
  const width = readNumber(item.payload.width) ?? 180;
  const height = readNumber(item.payload.height) ?? 72;
  const color = String(item.payload.color ?? '#0f766e');
  const rows = Math.max(2, Math.min(4, readNumber(item.payload.rows) ?? 3));
  const cols = Math.max(2, Math.min(4, readNumber(item.payload.cols) ?? 3));
  const drawnRows = Math.max(1, Math.ceil(rows * item.progress));
  const lines: ReactElement[] = [];
  for (let row = 1; row < rows; row += 1) {
    if (row <= drawnRows) lines.push(<line key={`r-${row}`} x1={x} y1={y + (height / rows) * row} x2={x + width} y2={y + (height / rows) * row} />);
  }
  for (let col = 1; col < cols; col += 1) {
    lines.push(<line key={`c-${col}`} x1={x + (width / cols) * col} y1={y} x2={x + (width / cols) * col} y2={y + height} />);
  }
  return (
    <g className="dg-stage-whiteboard-table" stroke={color} strokeWidth={3} style={{ opacity: Math.min(1, 0.32 + item.progress * 0.68) }}>
      <rect x={x} y={y} width={width} height={height} rx={10} fill="rgba(255,255,255,.18)" />
      {lines}
    </g>
  );
}

function WhiteboardCode({ item }: { item: TimelineWhiteboardItem }) {
  const x = readNumber(item.payload.x) ?? 72;
  const y = readNumber(item.payload.y) ?? 302;
  const width = readNumber(item.payload.width) ?? 230;
  const color = String(item.payload.color ?? '#2563eb');
  const lines = readStringList(item.payload.lines, String(item.payload.code ?? '').split('\n')).filter(Boolean).slice(0, 4);
  const visibleLines = Math.max(1, Math.ceil(lines.length * item.progress));
  return (
    <g className="dg-stage-whiteboard-code" style={{ opacity: Math.min(1, 0.32 + item.progress * 0.68) }}>
      <rect x={x} y={y} width={width} height={34 + visibleLines * 18} rx={12} fill="rgba(15,23,42,.86)" stroke={color} strokeWidth={3} />
      {lines.slice(0, visibleLines).map((line, index) => (
        <text key={index} x={x + 14} y={y + 27 + index * 18} fill="#e0f2fe" fontFamily="Consolas, monospace" fontSize="14" fontWeight="800">
          {line.slice(0, 28)}
        </text>
      ))}
    </g>
  );
}

function WhiteboardFormula({ item }: { item: TimelineWhiteboardItem }) {
  const x = readNumber(item.payload.x) ?? 318;
  const y = readNumber(item.payload.y) ?? 302;
  const width = readNumber(item.payload.width) ?? 220;
  const height = readNumber(item.payload.height) ?? 58;
  const color = String(item.payload.color ?? '#ca8a04');
  const formula = String(item.payload.formula ?? item.payload.text ?? item.payload.content ?? 'RSRP < -110 dBm');
  const visibleText = formula.slice(0, Math.ceil(formula.length * item.progress));
  return (
    <g className="dg-stage-whiteboard-formula" style={{ opacity: Math.min(1, 0.32 + item.progress * 0.68) }}>
      <rect x={x} y={y} width={width} height={height} rx={14} fill="rgba(255,251,235,.9)" stroke={color} strokeWidth={3} />
      <text x={x + 16} y={y + 36} fill="#7c2d12" fontFamily="Cambria Math, Microsoft YaHei, sans-serif" fontSize="20" fontWeight="950">
        {visibleText}
      </text>
    </g>
  );
}

function useCommandPacket(command?: TimelineCommand): TimelinePacket | null {
  const [packet, setPacket] = useState<TimelinePacket | null>(null);
  useEffect(() => {
    if (command?.mode === 'reset') {
      setPacket(null);
      return undefined;
    }
    if (!command || (command.effect !== 'packetMove' && command.effect !== 'pathFlow')) {
      return undefined;
    }
    const lineId = command.target ?? command.targets?.[0] ?? '';
    if (!lineId) {
      setPacket(null);
      return undefined;
    }
    const durationMs = Math.max(700, Math.min(2400, command.durationMs ?? readNumber(command.payload?.durationMs) ?? 1300));
    const color = typeof command.payload?.color === 'string' ? command.payload.color : '#0f766e';
    const startedAt = performance.now();
    const id = `runtime-command-packet-${command.nonce}`;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      setPacket({ id, lineId, durationMs, progress, color, repeat: false });
      if (progress < 1) frame = window.requestAnimationFrame(tick);
      else window.setTimeout(() => setPacket((current) => current?.id === id ? null : current), 240);
    };
    setPacket({ id, lineId, durationMs, progress: 0, color, repeat: false });
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [command]);
  return packet;
}

function readNumberList(value: unknown, fallback: number[]) {
  if (!Array.isArray(value)) return fallback;
  const numbers = value.map((item) => Number(item)).filter((item) => Number.isFinite(item));
  return numbers.length > 0 ? numbers : fallback;
}

function readStringList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const strings = value.map((item) => String(item ?? '').trim()).filter(Boolean);
  return strings.length > 0 ? strings : fallback;
}

function readNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function readMediaTracks(artifact: unknown): AnimationMediaTrack[] {
  const value = artifact && typeof artifact === 'object' && 'mediaTracks' in artifact
    ? (artifact as { mediaTracks?: unknown }).mediaTracks
    : undefined;
  if (!Array.isArray(value)) return [];
  return value.filter((track): track is AnimationMediaTrack => {
    return Boolean(track && typeof track === 'object' && typeof (track as { id?: unknown }).id === 'string');
  });
}

function StageBackground({ width, height }: { width: number; height: number }) {
  return (
    <svg className="dg-stage-background-grid" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs>
        <pattern id="dg-stage-grid" width="42" height="42" patternUnits="userSpaceOnUse">
          <path d="M 42 0 H 0 V 42" fill="none" stroke="rgba(15,23,42,.05)" strokeWidth="1" />
        </pattern>
        <radialGradient id="dg-stage-glow" cx="18%" cy="28%" r="72%">
          <stop offset="0%" stopColor="rgba(20,184,166,.13)" />
          <stop offset="70%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>
      <rect width={width} height={height} fill="url(#dg-stage-grid)" />
      <rect width={width} height={height} fill="url(#dg-stage-glow)" />
    </svg>
  );
}

function StageAnnotation({
  annotation,
  target,
}: {
  annotation: { target: string; content: string };
  target: AnimationPPTElement | null;
}) {
  const style: CSSProperties = target
    ? {
        left: Math.min(720, Math.max(36, target.left + target.width + 16)),
        top: Math.min(466, Math.max(24, target.top + 8)),
      }
    : { right: 24, bottom: 20 };
  return (
    <div className="dg-stage-callout" data-target={annotation.target} style={style}>
      <strong>重点</strong>
      <span>{annotation.content || annotation.target}</span>
    </div>
  );
}

function findElement(elements: AnimationPPTElement[], id: string): AnimationPPTElement | null {
  return elements.find((item) => item.id === id) ?? null;
}

function backgroundStyle(background?: AnimationSlideBackground): CSSProperties {
  if (!background) return { background: '#ffffff' };
  if (background.type === 'solid') return { background: background.color };
  if (background.type === 'image') {
    return {
      backgroundImage: `linear-gradient(rgba(255,255,255,${1 - (background.opacity ?? 1)}), rgba(255,255,255,${1 - (background.opacity ?? 1)})), url("${background.src}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  const stops = background.gradient.colors.map((item) => `${item.color} ${item.pos}%`).join(', ');
  const kind = background.gradient.type === 'radial'
    ? 'radial-gradient(circle'
    : `linear-gradient(${background.gradient.rotate ?? 135}deg`;
  return { background: `${kind}, ${stops})` };
}

const teachingStagePlaybackStyles = `
.dg-teaching-stage-screen { background: radial-gradient(circle at 50% 0%, rgba(20,184,166,.14), transparent 42%), #eaf5f7 !important; }
.dg-teaching-stage { box-shadow: 0 24px 70px rgba(15,23,42,.16) !important; }
.dg-stage-page-chrome { bottom: 150px !important; background: rgba(255,255,255,.86) !important; }
.dg-stage-spotlight-halo { opacity: .34 !important; stroke-width: 14 !important; }
.dg-stage-spotlight-ring { stroke: var(--spotlight-color, rgba(255,255,255,.94)) !important; stroke-width: 4 !important; filter: drop-shadow(0 0 18px color-mix(in srgb, var(--spotlight-color, #14b8a6) 70%, transparent)) !important; }
.dg-stage-laser-beam line { stroke-width: 5 !important; filter: drop-shadow(0 0 14px var(--laser-color, #ef4444)) drop-shadow(0 0 28px color-mix(in srgb, var(--laser-color, #ef4444) 52%, transparent)) !important; }
.dg-stage-laser { box-shadow: 0 0 0 7px color-mix(in srgb, var(--laser-color, #ef4444) 18%, transparent), 0 0 34px var(--laser-color, #ef4444), 0 0 70px color-mix(in srgb, var(--laser-color, #ef4444) 52%, transparent) !important; }
.dg-stage-laser-pin { box-shadow: inset 0 0 0 6px color-mix(in srgb, var(--laser-color, #ef4444) 20%, transparent), 0 0 34px color-mix(in srgb, var(--laser-color, #ef4444) 58%, transparent) !important; }
`;
