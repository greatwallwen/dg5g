import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { cssEscape } from './stage-geometry';

export type StageEffect =
  | {
      id?: string;
      type: 'highlight' | 'spotlight' | 'laser';
      target?: string;
      targets?: string[];
      color?: string;
      caption?: string;
      dimOpacity?: number;
      holdPolicy?: 'until-next-focus' | 'timed';
      minHoldMs?: number;
    }
  | null;

export type StageEffects = NonNullable<StageEffect>[];

type MeasuredBox = {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

const LASER_MIN_HOLD_MS = 2400;
const LASER_MAX_HOLD_MS = 3600;
const DEFAULT_SPOTLIGHT_DIM = 0.002;
const MAX_TEACHING_SPOTLIGHT_DIM = 0.008;
const MIN_TEACHING_SPOTLIGHT_DIM = 0.001;

export function StageOverlays({
  stageRef,
  effect,
  width,
  height,
}: {
  stageRef: RefObject<HTMLDivElement>;
  effect: StageEffect | StageEffects;
  width: number;
  height: number;
}) {
  const retainedLaser = useRetainedLaserEffect(effect);
  const effects = useMemo(() => {
    const activeEffects = Array.isArray(effect) ? effect : effect ? [effect] : [];
    if (!retainedLaser || activeEffects.some((item) => item.id === retainedLaser.id)) return activeEffects;
    return [...activeEffects, retainedLaser];
  }, [effect, retainedLaser]);

  if (effects.length === 0) return null;
  return (
    <>
      {effects.flatMap((stageEffect) => {
        const targets = stageEffect.targets?.length ? stageEffect.targets : stageEffect.target ? [stageEffect.target] : [];
        return targets.map((target) => (
          <StageOverlayItem
            key={`${stageEffect.id ?? stageEffect.type}-${target}`}
            stageRef={stageRef}
            effect={stageEffect}
            target={target}
            width={width}
            height={height}
          />
        ));
      })}
    </>
  );
}

function useRetainedLaserEffect(effect: StageEffect | StageEffects) {
  const [retainedLaser, setRetainedLaser] = useState<NonNullable<StageEffect> | null>(null);
  const previousLaserRef = useRef<{ effect: NonNullable<StageEffect>; startedAt: number } | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const effects = Array.isArray(effect) ? effect : effect ? [effect] : [];
    const laserEffect = effects.find((item) => item.type === 'laser' && hasEffectTarget(item));
    const hasActiveEffect = effects.some(hasEffectTarget);

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (laserEffect) {
      previousLaserRef.current = { effect: laserEffect, startedAt: performance.now() };
      setRetainedLaser(null);
      return undefined;
    }

    if (hasActiveEffect) {
      previousLaserRef.current = null;
      setRetainedLaser(null);
      return undefined;
    }

    const previousLaser = previousLaserRef.current;
    if (!previousLaser) {
      setRetainedLaser(null);
      return undefined;
    }

    const minimumHoldMs = clampLaserHold(previousLaser.effect.minHoldMs ?? LASER_MIN_HOLD_MS);
    const remainingMs = minimumHoldMs - (performance.now() - previousLaser.startedAt);
    if (remainingMs <= 0) {
      previousLaserRef.current = null;
      setRetainedLaser(null);
      return undefined;
    }

    setRetainedLaser(previousLaser.effect);
    timerRef.current = window.setTimeout(() => {
      if (previousLaserRef.current?.effect === previousLaser.effect) previousLaserRef.current = null;
      setRetainedLaser((current) => current?.id === previousLaser.effect.id ? null : current);
      timerRef.current = null;
    }, remainingMs);

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [effect]);

  return retainedLaser;
}

function clampLaserHold(value: number) {
  return Math.max(LASER_MIN_HOLD_MS, Math.min(LASER_MAX_HOLD_MS, value));
}

function hasEffectTarget(effect: NonNullable<StageEffect>) {
  return Boolean(effect.target || effect.targets?.length);
}

function StageOverlayItem({
  stageRef,
  effect,
  target,
  width,
  height,
}: {
  stageRef: RefObject<HTMLDivElement>;
  effect: NonNullable<StageEffect>;
  target: string;
  width: number;
  height: number;
}) {
  const box = useMeasuredTarget(stageRef, target, width, height, effect.id);
  if (!box) return null;
  if (effect.type === 'spotlight') {
    return (
      <SpotlightOverlay
        box={box}
        width={width}
        height={height}
        dimOpacity={teachingSpotlightDim(effect.dimOpacity, box, width, height)}
        color={effect.color ?? '#14b8a6'}
        caption={effect.caption}
      />
    );
  }
  if (effect.type === 'laser') {
    return <LaserOverlay box={box} color={effect.color ?? '#ef4444'} width={width} height={height} caption={effect.caption} />;
  }
  return <HighlightOverlay box={box} color={effect.color ?? '#f59e0b'} />;
}

function teachingSpotlightDim(value: number | undefined, box: MeasuredBox, width: number, height: number) {
  const areaRatio = (box.width * box.height) / Math.max(1, width * height);
  const contextualDefault = areaRatio < 0.025 ? 0.004 : DEFAULT_SPOTLIGHT_DIM;
  if (typeof value !== 'number' || !Number.isFinite(value)) return contextualDefault;
  return Math.max(MIN_TEACHING_SPOTLIGHT_DIM, Math.min(MAX_TEACHING_SPOTLIGHT_DIM, value));
}

function SpotlightOverlay({
  box,
  width,
  height,
  dimOpacity,
  color,
  caption,
}: {
  box: MeasuredBox;
  width: number;
  height: number;
  dimOpacity: number;
  color: string;
  caption?: string;
}) {
  const maskId = useMemo(() => `dg-stage-spotlight-${box.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`, [box.id]);
  const smallTarget = (box.width * box.height) / Math.max(1, width * height) < 0.035;
  const padding = smallTarget ? Math.max(28, Math.min(64, Math.min(width, height) * 0.075)) : 18;
  const target = {
    x: Math.max(0, box.left - padding),
    y: Math.max(0, box.top - padding),
    width: Math.max(1, Math.min(width, box.width + padding * 2)),
    height: Math.max(1, Math.min(height, box.height + padding * 2)),
  };
  const rectTransition = { duration: 0.24, ease: 'easeOut' as const };

  return (
    <svg
      className="dg-stage-spotlight"
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      data-effect-kind="spotlight"
      data-target-id={box.id}
      data-caption={caption}
      data-dim-opacity={dimOpacity.toFixed(3)}
      style={{ '--spotlight-color': color } as CSSProperties}
    >
      <defs>
        <mask id={maskId}>
          <rect width={width} height={height} fill="white" />
          <motion.rect
            initial={false}
            animate={target}
            transition={rectTransition}
            rx="18"
            fill="black"
          />
        </mask>
      </defs>
      <motion.rect
        width={width}
        height={height}
        fill={`rgba(15,23,42,${dimOpacity})`}
        mask={`url(#${maskId})`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      <motion.rect
        className="dg-stage-spotlight-halo"
        initial={false}
        animate={target}
        transition={rectTransition}
        rx="18"
        fill="rgba(255,255,255,.055)"
      />
      <motion.rect
        className="dg-stage-spotlight-ring"
        initial={false}
        animate={target}
        transition={rectTransition}
        rx="18"
        fill="none"
      />
    </svg>
  );
}

function LaserOverlay({
  box,
  color,
  width,
  height,
  caption,
}: {
  box: MeasuredBox;
  color: string;
  width: number;
  height: number;
  caption?: string;
}) {
  const fromX = box.centerX > width / 2 ? width + 48 : -48;
  const fromY = box.centerY > height / 2 ? height + 48 : -48;
  const beamStart = {
    x: box.centerX > width / 2 ? width - 18 : 18,
    y: box.centerY > height / 2 ? height - 18 : 18,
  };
  const padding = 14;
  const frame = {
    left: Math.max(0, box.left - padding),
    top: Math.max(0, box.top - padding),
    width: Math.min(width, box.width + padding * 2),
    height: Math.min(height, box.height + padding * 2),
  };
  return (
    <>
      <motion.svg
        className="dg-stage-laser-beam"
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true"
        data-effect-kind="laser-beam"
        data-target-id={box.id}
        data-caption={caption}
        style={{ '--laser-color': color } as CSSProperties}
      >
        <motion.line
          x1={beamStart.x}
          y1={beamStart.y}
          x2={box.centerX}
          y2={box.centerY}
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.34, ease: 'easeOut' }}
        />
      </motion.svg>
      <motion.div
        className="dg-stage-laser-frame"
        data-effect-kind="laser-frame"
        data-target-id={box.id}
        data-caption={caption}
        style={{ ...frame, '--laser-color': color } as CSSProperties}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
        aria-hidden="true"
      />
      <AnimatePresence mode="wait">
        <motion.div
          key={`${box.id}-${Math.round(box.centerX)}-${Math.round(box.centerY)}`}
          className="dg-stage-laser"
          data-effect-kind="laser"
          data-target-id={box.id}
          data-caption={caption}
          style={{ left: box.centerX, top: box.centerY, '--laser-color': color } as CSSProperties}
          initial={{ x: fromX - box.centerX, y: fromY - box.centerY, scale: 0.65, opacity: 0 }}
          animate={{ x: 0, y: 0, scale: 1, opacity: 1 }}
          exit={{ opacity: 0, scale: 0.72 }}
          transition={{ type: 'spring', stiffness: 520, damping: 30 }}
          aria-hidden="true"
        >
          <i />
          <b />
        </motion.div>
      </AnimatePresence>
      <motion.div
        className="dg-stage-laser-pin"
        data-effect-kind="laser-pin"
        data-target-id={box.id}
        data-caption={caption}
        style={{ left: box.centerX, top: box.centerY, '--laser-color': color } as CSSProperties}
        initial={{ opacity: 0, scale: 0.74 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        aria-hidden="true"
      />
    </>
  );
}

function HighlightOverlay({ box, color }: { box: MeasuredBox; color: string }) {
  return (
    <motion.div
      className="dg-stage-highlight"
      data-effect-kind="highlight"
      data-target-id={box.id}
      style={{ '--highlight-color': color } as CSSProperties}
      initial={false}
      animate={{
        left: box.left - 8,
        top: box.top - 8,
        width: box.width + 16,
        height: box.height + 16,
      }}
      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
      aria-hidden="true"
    />
  );
}

function useMeasuredTarget(
  stageRef: RefObject<HTMLDivElement>,
  targetId: string | null,
  canvasWidth: number,
  canvasHeight: number,
  refreshKey?: string,
) {
  const [box, setBox] = useState<MeasuredBox | null>(() => (
    targetId ? pendingTargetBox(targetId, canvasWidth, canvasHeight) : null
  ));

  useEffect(() => {
    if (!targetId) {
      setBox(null);
      return undefined;
    }
    setBox((previous) => previous?.id === targetId ? previous : pendingTargetBox(targetId, canvasWidth, canvasHeight));

    let frame = 0;
    let trackingFrame = 0;
    let resolved = false;
    const startedAt = performance.now();
    const settleUntil = startedAt + 900;
    const huntUntil = startedAt + 6000;
    // Stage pages can rebuild elements after the theater layer enters. During
    // that short window, keep the previous box instead of flashing a center
    // fallback that makes the spotlight look detached from narration.
    const keepHunting = () => !resolved && performance.now() < huntUntil;
    const update = () => {
      const stage = stageRef.current;
      if (!stage) {
        setBox(null);
        return;
      }
      const target = findTarget(stage, targetId);
      if (!target) {
        if (keepHunting()) return;
        setBox(null);
        return;
      }
      const stageRect = stage.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      if (!stageRect.width || !stageRect.height || !targetRect.width || !targetRect.height) {
        if (keepHunting()) return;
        setBox(null);
        return;
      }
      const scaleX = canvasWidth / stageRect.width;
      const scaleY = canvasHeight / stageRect.height;
      const left = (targetRect.left - stageRect.left) * scaleX;
      const top = (targetRect.top - stageRect.top) * scaleY;
      const width = targetRect.width * scaleX;
      const height = targetRect.height * scaleY;
      const next = { id: targetId, left, top, width, height, centerX: left + width / 2, centerY: top + height / 2 };
      resolved = true;
      setBox((previous) => boxesMatch(previous, next) ? previous : next);
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };

    schedule();
    const track = () => {
      update();
      const now = performance.now();
      if (now < settleUntil || (!resolved && now < huntUntil)) {
        trackingFrame = requestAnimationFrame(track);
      }
    };
    trackingFrame = requestAnimationFrame(track);
    const observer = new ResizeObserver(schedule);
    if (stageRef.current) observer.observe(stageRef.current);
    const target = stageRef.current ? findTarget(stageRef.current, targetId) : null;
    if (target) observer.observe(target);
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(trackingFrame);
      observer.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [canvasHeight, canvasWidth, refreshKey, stageRef, targetId]);

  return box;
}

function pendingTargetBox(id: string, width: number, height: number): MeasuredBox {
  const boxWidth = Math.max(260, width * 0.42);
  const boxHeight = Math.max(92, height * 0.18);
  return {
    id,
    left: (width - boxWidth) / 2,
    top: Math.max(24, height * 0.12),
    width: boxWidth,
    height: boxHeight,
    centerX: width / 2,
    centerY: Math.max(24, height * 0.12) + boxHeight / 2,
  };
}

function boxesMatch(previous: MeasuredBox | null, next: MeasuredBox) {
  return Boolean(previous
    && previous.id === next.id
    && Math.abs(previous.left - next.left) < 0.5
    && Math.abs(previous.top - next.top) < 0.5
    && Math.abs(previous.width - next.width) < 0.5
    && Math.abs(previous.height - next.height) < 0.5);
}

function findTarget(stage: HTMLElement, id: string): HTMLElement | SVGGraphicsElement | null {
  const escaped = cssEscape(id);
  const target = stage.querySelector<HTMLElement | SVGGraphicsElement>(
    `[data-animation-element-id="${escaped}"], [data-dgbook-target="${escaped}"], #${escaped}`,
  );
  const content = target instanceof HTMLElement ? target.querySelector<HTMLElement>('.dg-stage-element-content') : null;
  if (target instanceof SVGGraphicsElement) {
    const rect = target.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      const path = target.querySelector<SVGGraphicsElement>('.dg-stage-line-path');
      if (path) return path;
    }
  }
  return content ?? target;
}
