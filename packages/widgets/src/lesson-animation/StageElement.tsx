import type { CSSProperties } from 'react';
import type {
  AnimationGenericElement,
  AnimationImageElement,
  AnimationLineElement,
  AnimationPPTElement,
  AnimationShapeElement,
  AnimationTextElement,
  AnimationTrack,
  AnimationVideoElement,
} from '@dgbook/animation';
import { estimateSlideTextUnits, stripSlideHtmlText } from '@dgbook/animation/schema';
import { getLineLength, getLinePath, lineDash } from './stage-geometry';
import { TableElement } from './StageTableElement';
import type { TimelineElementState } from './timeline-runtime';

export function StageElement({
  element,
  index,
  active,
  timelineState,
  activePhase,
}: {
  element: Exclude<AnimationPPTElement, AnimationLineElement>;
  index: number;
  active: boolean;
  timelineState?: TimelineElementState | null;
  activePhase?: number;
}) {
  const phaseState = stageElementPhaseState(element.phase, activePhase);
  const timelineActive = Boolean(timelineState?.active);
  const visible = active || timelineActive || (timelineState?.visible !== false && stagePhaseVisible(phaseState));
  const opacity = stagePhaseOpacity(phaseState, active || timelineActive, element.opacity ?? 1);
  const style = {
    left: element.left,
    top: element.top,
    width: element.width,
    height: element.height,
    opacity: visible ? opacity : 0,
    visibility: visible ? undefined : 'hidden',
    transform: element.rotate ? `rotate(${element.rotate}deg)` : undefined,
    zIndex: 10 + index,
  } as CSSProperties;

  return (
    <div
      id={element.id}
      className={classNames(
        'dg-stage-element',
        `dg-stage-element-${element.type}`,
        animationClass(element.animation),
        element.animation?.repeat && 'is-animation-repeating',
        active && 'is-active',
        timelineState?.className,
      )}
      style={{ ...style, ...animationStyle(element.animation) }}
      data-dgbook-target={element.id}
      data-widget-step={element.id}
      data-animation-element-id={element.id}
      data-animation-type={element.type}
      data-animation-role={element.role}
      data-animation-layer={element.layer}
      data-animation-phase={element.phase}
      data-layer-state={phaseState}
      data-timeline-visible={timelineState ? String(timelineState.visible) : undefined}
      data-timeline-active={timelineState ? String(timelineState.active) : undefined}
      data-timeline-effects={timelineState?.effects.join(' ') || undefined}
    >
      <div className="dg-stage-element-content">
        {renderElement(element, timelineState)}
        {timelineState?.countValue && <span className="dg-stage-countup-badge">{timelineState.countValue}</span>}
      </div>
    </div>
  );
}

export function stageElementPhaseState(phase: number | undefined, activePhase: number | undefined) {
  if (!phase || !activePhase) return 'base';
  if (phase === activePhase) return 'current';
  if (phase < activePhase) return activePhase - phase <= 1 ? 'past' : 'distant-past';
  return phase - activePhase <= 1 ? 'next' : 'future';
}

function stagePhaseVisible(phaseState: string) {
  return ['base', 'current', 'past', 'next'].includes(phaseState);
}

function stagePhaseOpacity(phaseState: string, active: boolean, baseOpacity: number) {
  if (active || phaseState === 'base' || phaseState === 'current') return baseOpacity;
  if (phaseState === 'past') return Math.min(baseOpacity, 0.52);
  if (phaseState === 'next') return Math.min(baseOpacity, 0.64);
  return 0;
}

export function StageLine({
  sceneId,
  element,
  active,
  timelineState,
  activePhase,
}: {
  sceneId: string;
  element: AnimationLineElement;
  active: boolean;
  timelineState?: TimelineElementState | null;
  activePhase?: number;
}) {
  const markerStart = element.points?.[0] === 'arrow' ? `url(#${sceneId}-${element.id}-arrow)` : undefined;
  const markerEnd = element.points?.[1] === 'arrow' ? `url(#${sceneId}-${element.id}-arrow)` : undefined;
  const [startDx = 0, startDy = 0] = element.start;
  const [endDx = 0, endDy = 0] = element.end;
  const start: [number, number] = [element.left + startDx, element.top + startDy];
  const end: [number, number] = [element.left + endDx, element.top + endDy];
  const hitLeft = Math.min(start[0], end[0]) - 8;
  const hitTop = Math.min(start[1], end[1]) - 8;
  const hitWidth = Math.max(16, Math.abs(end[0] - start[0]) + 16);
  const hitHeight = Math.max(16, Math.abs(end[1] - start[1]) + 16);
  const phaseState = stageElementPhaseState(element.phase, activePhase);
  const timelineActive = Boolean(timelineState?.active);
  const visible = active || timelineActive || (timelineState?.visible !== false && stagePhaseVisible(phaseState));
  const opacity = stagePhaseOpacity(phaseState, active || timelineActive, 1);
  const drawActive = Boolean(timelineState?.effects.includes('has-cue-draw'));
  const drawLength = drawActive ? getLineLength(element) : 0;
  const drawProgress = Math.min(1, Math.max(0, timelineState?.cueProgress ?? 0));
  const lineStyle = {
    ...animationStyle(element.animation),
    ...(drawActive
      ? {
          strokeDasharray: drawLength,
          strokeDashoffset: drawLength * (1 - drawProgress),
        }
      : {}),
  } as CSSProperties;

  return (
    <g
      id={element.id}
      data-dgbook-target={element.id}
      data-widget-step={element.id}
      data-animation-element-id={element.id}
      data-animation-layer={element.layer}
      data-animation-phase={element.phase}
      data-layer-state={phaseState}
      data-timeline-visible={timelineState ? String(timelineState.visible) : undefined}
      data-timeline-active={timelineState ? String(timelineState.active) : undefined}
      data-timeline-effects={timelineState?.effects.join(' ') || undefined}
      className={classNames(active && 'is-active', timelineState?.className)}
      style={{ color: element.color, opacity: visible ? opacity : 0, visibility: visible ? undefined : 'hidden' }}
    >
      <rect
        className="dg-stage-line-hitbox"
        x={hitLeft}
        y={hitTop}
        width={hitWidth}
        height={hitHeight}
        fill="transparent"
        pointerEvents="none"
      />
      <path
        className={classNames('dg-stage-line-path', animationClass(element.animation))}
        data-animation-element-id={element.id}
        data-animation-type="line"
        data-animation-role={element.role}
        d={getLinePath(element)}
        fill="none"
        stroke={element.color}
        strokeWidth={Math.max(2, Math.min(8, element.width))}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={drawActive ? undefined : lineDash(element.style)}
        markerStart={drawActive && drawProgress < 0.98 ? undefined : markerStart}
        markerEnd={drawActive && drawProgress < 0.98 ? undefined : markerEnd}
        style={lineStyle}
      />
      {element.points?.[0] === 'dot' && <circle cx={start[0]} cy={start[1]} r="5" fill={element.color} />}
      {element.points?.[1] === 'dot' && <circle cx={end[0]} cy={end[1]} r="5" fill={element.color} />}
    </g>
  );
}

function renderElement(element: Exclude<AnimationPPTElement, AnimationLineElement>, timelineState?: TimelineElementState | null) {
  if (element.type === 'text') return <TextElement element={element} timelineState={timelineState} />;
  if (element.type === 'shape') return <ShapeElement element={element} />;
  if (element.type === 'image') return <ImageElement element={element} />;
  if (element.type === 'video') return <VideoElement element={element} />;
  if (element.type === 'chart') return <ChartElement element={element} />;
  if (element.type === 'table') return <TableElement element={element} timelineState={timelineState} />;
  if (element.type === 'latex') return <LatexElement element={element} />;
  if (element.type === 'code') return <CodeElement element={element} />;
  return <div className="dg-stage-generic-element">{String(element.content ?? element.type)}</div>;
}

function TextElement({ element, timelineState }: { element: AnimationTextElement; timelineState?: TimelineElementState | null }) {
  const fit = fitTextElement(element);
  const style = {
    color: element.defaultColor ?? '#0f172a',
    background: element.fill,
    fontFamily: element.defaultFontName || undefined,
    lineHeight: element.lineHeight,
    letterSpacing: element.wordSpace ? `${element.wordSpace}px` : undefined,
    '--dg-stage-fit-font-size': `${fit.fontSize}px`,
    '--dg-stage-fit-lines': fit.maxLines,
    '--dg-stage-fit-line-height': fit.lineHeight,
  } as CSSProperties;
  const captionText = timelineState?.captionText ?? timelineState?.typeText;

  if (captionText) {
    return (
      <div
        className={classNames(
          'dg-stage-text-content',
          'is-caption-updated',
          fit.mode === 'scale' ? 'is-fit-scaled' : 'is-fit-clamped',
        )}
        style={style}
        data-text-fit={fit.mode}
        data-text-max-lines={fit.maxLines}
      >
        <p>{captionText}</p>
      </div>
    );
  }

  return (
    <div
      className={classNames(
        'dg-stage-text-content',
        fit.mode === 'scale' ? 'is-fit-scaled' : 'is-fit-clamped',
        fit.overflowing && 'is-overflowing',
      )}
      style={style}
      data-text-fit={fit.mode}
      data-text-max-lines={fit.maxLines}
      data-text-overflow={fit.overflowing ? 'true' : undefined}
      dangerouslySetInnerHTML={{ __html: element.content }}
    />
  );
}

function ShapeElement({ element }: { element: AnimationShapeElement }) {
  const fillId = `${element.id}-fill`;
  const patternId = `${element.id}-pattern`;
  const fill = element.gradient ? `url(#${fillId})` : element.pattern ? `url(#${patternId})` : element.fill;
  return (
    <svg className="dg-stage-shape-svg" viewBox={`0 0 ${element.viewBox[0]} ${element.viewBox[1]}`} preserveAspectRatio={element.fixedRatio ? 'xMidYMid meet' : 'none'}>
      <defs>
        {element.gradient && (
          <linearGradient id={fillId} x1="0%" y1="0%" x2="100%" y2="100%" gradientTransform={element.gradient.rotate ? `rotate(${element.gradient.rotate})` : undefined}>
            {element.gradient.colors.map((stop) => <stop key={`${stop.pos}-${stop.color}`} offset={`${stop.pos * 100}%`} stopColor={stop.color} />)}
          </linearGradient>
        )}
        {element.pattern && (
          <pattern id={patternId} width={element.pattern.size ?? 18} height={element.pattern.size ?? 18} patternUnits="userSpaceOnUse">
            <PatternShape kind={element.pattern.kind} color={element.pattern.color ?? element.fill} opacity={element.pattern.opacity ?? 0.16} size={element.pattern.size ?? 18} />
          </pattern>
        )}
      </defs>
      {element.shadow && (
        <filter id={`${element.id}-shadow`} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx={element.shadow.h} dy={element.shadow.v} stdDeviation={element.shadow.blur} floodColor={element.shadow.color} />
        </filter>
      )}
      <path
        d={element.path}
        fill={fill}
        stroke={element.outline?.color}
        strokeWidth={element.outline?.width}
        strokeDasharray={lineDash(element.outline?.style)}
        filter={element.shadow ? `url(#${element.id}-shadow)` : undefined}
      />
      {element.label && (
        <text x="50%" y="52%" textAnchor="middle" dominantBaseline="middle" fill={element.labelColor ?? '#0f172a'}>
          {element.label}
        </text>
      )}
    </svg>
  );
}

function PatternShape({ kind, color, opacity, size }: { kind: string; color: string; opacity: number; size: number }) {
  if (kind === 'grid') return <path d={`M ${size} 0 L 0 0 0 ${size}`} fill="none" stroke={color} strokeWidth="1.2" opacity={opacity} />;
  if (kind === 'diagonal') return <path d={`M 0 ${size} L ${size} 0`} stroke={color} strokeWidth="1.4" opacity={opacity} />;
  if (kind === 'circuit') {
    return (
      <g fill="none" stroke={color} strokeWidth="1.2" opacity={opacity}>
        <path d={`M 2 ${size / 2} H ${size - 2} M ${size / 2} 2 V ${size - 2}`} />
        <circle cx={size / 2} cy={size / 2} r="2" fill={color} />
      </g>
    );
  }
  return <circle cx={size / 2} cy={size / 2} r="2" fill={color} opacity={opacity} />;
}

function ImageElement({ element }: { element: AnimationImageElement }) {
  const clipPath = clipPathFor(element.clipPath);
  const style = {
    objectFit: element.objectFit ?? 'cover',
    borderRadius: element.radius,
    filter: element.filter,
    clipPath,
    border: element.outline ? `${element.outline.width ?? 1}px ${element.outline.style ?? 'solid'} ${element.outline.color ?? '#cbd5e1'}` : undefined,
    boxShadow: element.shadow ? `${element.shadow.h}px ${element.shadow.v}px ${element.shadow.blur}px ${element.shadow.color}` : undefined,
  } as CSSProperties;
  return (
    <span className="dg-stage-image-shell">
      <img className="dg-stage-media-element" src={element.src} alt={element.alt ?? ''} style={style} />
      {element.colorMask && <span className="dg-stage-image-mask" style={{ background: element.colorMask, clipPath }} />}
    </span>
  );
}

function VideoElement({ element }: { element: AnimationVideoElement }) {
  if (!element.src) {
    return (
      <div className="dg-stage-video-shell is-placeholder">
        {element.poster && <img src={element.poster} alt="" />}
        <span>VIDEO</span>
      </div>
    );
  }
  return (
    <div className="dg-stage-video-shell">
      <video
        className="dg-stage-media-element"
        data-animation-element-id={element.id}
        src={element.src}
        poster={element.poster}
        muted={element.muted ?? true}
        playsInline
        preload="metadata"
      />
      <span>PLAY</span>
    </div>
  );
}

function ChartElement({ element }: { element: AnimationGenericElement }) {
  const series = normalizeSeries(element);
  const max = Math.max(1, ...series.map((item) => item.value));
  if (element.chartType === 'line') return <LineChart element={element} series={series} max={max} />;
  if (element.chartType === 'gauge') return <GaugeChart element={element} value={Math.min(1, series[0]?.value ?? 0)} />;
  if (element.chartType === 'pie') return <PieChart element={element} series={series} />;
  return <BarChart series={series} max={max} />;
}

function LineChart({ element, series, max }: { element: AnimationGenericElement; series: SeriesItem[]; max: number }) {
  const points = series.map((item, index) => {
    const x = 40 + index * ((element.width - 80) / Math.max(1, series.length - 1));
    const y = element.height - 34 - (item.value / max) * (element.height - 70);
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg className="dg-stage-chart" viewBox={`0 0 ${element.width} ${element.height}`}>
      <polyline points={points} fill="none" stroke="#0f766e" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      {series.map((item, index) => {
        const x = 40 + index * ((element.width - 80) / Math.max(1, series.length - 1));
        const y = element.height - 34 - (item.value / max) * (element.height - 70);
        return <circle key={`${index}-${item.label}`} cx={x} cy={y} r="6" fill={item.color ?? '#14b8a6'} />;
      })}
    </svg>
  );
}

function GaugeChart({ element, value }: { element: AnimationGenericElement; value: number }) {
  return (
    <svg className="dg-stage-chart dg-stage-gauge" viewBox={`0 0 ${element.width} ${element.height}`}>
      <path d={`M ${element.width * 0.18} ${element.height * 0.72} A ${element.width * 0.32} ${element.width * 0.32} 0 0 1 ${element.width * 0.82} ${element.height * 0.72}`} fill="none" stroke="#dbeafe" strokeWidth="18" strokeLinecap="round" />
      <path d={`M ${element.width * 0.18} ${element.height * 0.72} A ${element.width * 0.32} ${element.width * 0.32} 0 0 1 ${element.width * (0.18 + 0.64 * value)} ${element.height * (0.72 - 0.32 * Math.sin(Math.PI * value))}`} fill="none" stroke="#0f766e" strokeWidth="18" strokeLinecap="round" />
      <text x="50%" y="58%" textAnchor="middle">{Math.round(value * 100)}%</text>
    </svg>
  );
}

function PieChart({ element, series }: { element: AnimationGenericElement; series: SeriesItem[] }) {
  const total = Math.max(1, series.reduce((sum, item) => sum + Math.max(0, item.value), 0));
  let offset = 0;
  return (
    <svg className="dg-stage-chart dg-stage-pie" viewBox={`0 0 ${element.width} ${element.height}`}>
      {series.map((item, index) => {
        const value = Math.max(0, item.value) / total;
        const path = pieSlicePath(element.width / 2, element.height / 2, Math.min(element.width, element.height) * 0.34, offset, offset + value);
        offset += value;
        return <path key={`${index}-${item.label}`} d={path} fill={item.color ?? palette(index)} />;
      })}
      <circle cx="50%" cy="50%" r={Math.min(element.width, element.height) * 0.17} fill="rgba(255,255,255,.92)" />
      <text x="50%" y="52%" textAnchor="middle">{series[0]?.label ?? 'KPI'}</text>
    </svg>
  );
}

function BarChart({ series, max }: { series: SeriesItem[]; max: number }) {
  return (
    <div className="dg-stage-bar-chart">
      {series.map((item, index) => (
        <span key={`${index}-${item.label}`}>
          <b style={{ height: `${Math.max(8, (item.value / max) * 100)}%`, background: item.color ?? '#14b8a6' }} />
          <em>{item.label}</em>
        </span>
      ))}
    </div>
  );
}


function LatexElement({ element }: { element: AnimationGenericElement }) {
  return <div className="dg-stage-latex">{String(element.content ?? '')}</div>;
}

function CodeElement({ element }: { element: AnimationGenericElement }) {
  return (
    <pre className="dg-stage-code">
      <code>
        {String(element.content ?? '').split(/\r?\n/).map((line, index) => (
          <span key={`${index}-${line}`} data-line={index + 1}>{line || ' '}</span>
        ))}
      </code>
    </pre>
  );
}

type SeriesItem = { label: string; value: number; color?: string };

function normalizeSeries(element: AnimationGenericElement): SeriesItem[] {
  if (Array.isArray(element.series) && element.series.length > 0) return element.series;
  if (Array.isArray(element.data)) {
    return element.data.map((item, index) => {
      const record = item as Record<string, unknown>;
      return {
        label: String(record.label ?? record.name ?? `S${index + 1}`),
        value: Number(record.value ?? record.y ?? 0),
        color: typeof record.color === 'string' ? record.color : undefined,
      };
    });
  }
  return [
    { label: 'RSRP', value: 72, color: '#0f766e' },
    { label: 'SINR', value: 58, color: '#f59e0b' },
    { label: '速率', value: 86, color: '#2563eb' },
  ];
}

function clipPathFor(value?: AnimationImageElement['clipPath']) {
  if (!value) return undefined;
  if (value === 'circle') return 'circle(50% at 50% 50%)';
  if (value === 'rounded') return 'inset(0 round 16px)';
  if (value === 'hexagon') return 'polygon(25% 4%, 75% 4%, 100% 50%, 75% 96%, 25% 96%, 0 50%)';
  if (value === 'diamond') return 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)';
  return value;
}

function pieSlicePath(cx: number, cy: number, r: number, start: number, end: number) {
  const startAngle = start * Math.PI * 2 - Math.PI / 2;
  const endAngle = end * Math.PI * 2 - Math.PI / 2;
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  const largeArc = end - start > 0.5 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

function palette(index: number) {
  return ['#0f766e', '#2563eb', '#f59e0b', '#db2777', '#7c3aed'][index % 5]!;
}

function fitTextElement(element: AnimationTextElement) {
  const baseFontSize = extractFontSize(element.content) ?? 16;
  const padding = 12;
  const maxLines = element.maxLines ?? Math.max(1, Math.floor((element.height - padding) / (baseFontSize * 1.22)));
  const availableWidth = Math.max(24, element.width - padding);
  const capacity = Math.max(4, (availableWidth / Math.max(8, baseFontSize * 0.58)) * maxLines);
  const budget = element.textBudget ?? capacity;
  const units = estimateSlideTextUnits(stripSlideHtmlText(element.content));
  const effectiveCapacity = Math.min(capacity, budget);
  const overflowing = units > effectiveCapacity;
  const minFontSize = element.minFontSize ?? 10;
  const mode = element.fit ?? 'scale';
  const fontSize = mode === 'scale' && overflowing
    ? Math.max(minFontSize, Math.floor(baseFontSize * (effectiveCapacity / Math.max(units, 1))))
    : baseFontSize;
  return { mode, fontSize, maxLines, overflowing: overflowing && fontSize <= minFontSize, lineHeight: element.lineHeight ?? 1.22 };
}

function extractFontSize(content: string): number | null {
  const matches = [...content.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/gi)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value > 0);
  return matches.length > 0 ? Math.max(...matches) : null;
}

function animationClass(track?: AnimationTrack): string {
  const preset = track?.preset;
  return preset && preset !== 'none' ? `dg-stage-track-${preset}` : '';
}

function animationStyle(track?: AnimationTrack): CSSProperties {
  if (!track || track.preset === 'none') return {};
  return {
    animationDelay: `${track.delayMs ?? 0}ms`,
    animationDuration: `${track.durationMs ?? 560}ms`,
    animationIterationCount: track.repeat ? 'infinite' : undefined,
  };
}

function classNames(...values: Array<string | false | undefined | null>): string {
  return values.filter(Boolean).join(' ');
}
