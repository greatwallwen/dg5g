import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameConfig, GameItem } from '@dgbook/edugame-core';
import { ArcadeCanvas } from './ArcadeCanvas';
import { GameIcon } from './icons';

// 雷达快打 (radar quick-strike): a real-time whack-a-mole over the radar canvas.
// Target chips surface at random positions, pulse with a countdown ring, and
// expire if not tapped. Tap the elements that answer the goal; avoid distractors.
// Chips are real DOM buttons (keyboard-reachable, [data-edugame-item] for audits)
// laid over the live PixiJS radar backdrop.

interface Chip { key: string; item: GameItem; x: number; y: number; correct: boolean; ttl: number; timerId: number }
interface Pop { key: string; x: number; y: number; text: string; kind: 'correct' | 'wrong' }

const BASE_TARGET_CHIPS = 3;   // keep the first training round readable inside a textbook page
const MAX_TARGET_CHIPS = 4;
const REFILL_MS = 600;    // top-up cadence after taps/expiries
const TTL_MIN = 7200;
const TTL_VAR = 3000;

export interface QuickHitArcadeProps {
  config: GameConfig;
  items: GameItem[];
  doneIds: string[];
  score: number;
  combo: number;
  progress: number;
  result: 'idle' | 'correct' | 'wrong' | 'complete';
  active: boolean;
  goal?: string;
  onHit: (item: GameItem) => void;
  onExpire?: (item: GameItem) => void;
}

export function QuickHitArcade(props: QuickHitArcadeProps) {
  const { items, doneIds, combo, progress, result, active, goal, onHit, onExpire } = props;
  const [chips, setChips] = useState<Chip[]>([]);
  const [pops, setPops] = useState<Pop[]>([]);
  const [shake, setShake] = useState(false);
  const live = useRef({ items, doneIds, active, onHit, onExpire, combo, progress });
  live.current = { items, doneIds, active, onHit, onExpire, combo, progress };
  const seq = useRef(0);
  const timers = useRef<Set<number>>(new Set());

  const pickPosition = (current: Chip[]): { x: number; y: number } => {
    const slots = [
      { x: 15, y: 25 }, { x: 38, y: 23 }, { x: 62, y: 26 }, { x: 84, y: 24 },
      { x: 18, y: 52 }, { x: 42, y: 50 }, { x: 62, y: 54 }, { x: 82, y: 51 },
      { x: 16, y: 78 }, { x: 39, y: 75 }, { x: 63, y: 79 }, { x: 84, y: 76 },
    ];
    const ranked = slots
      .map((slot) => ({
        slot,
        gap: current.reduce((min, c) => Math.min(min, Math.hypot(c.x - slot.x, c.y - slot.y)), 999),
        jitter: Math.random(),
      }))
      .sort((a, b) => (b.gap - a.gap) || (b.jitter - a.jitter));
    const best = ranked[0]?.slot ?? { x: 50, y: 50 };
    return { x: best.x + (Math.random() - 0.5) * 3, y: best.y + (Math.random() - 0.5) * 3 };
  };

  // Top up the field toward TARGET_CHIPS in one pass, so a burst of taps/expiries
  // refills immediately (keeps the contact count reliably >=3 and play continuous).
  const ensureField = useCallback(() => {
    setChips((current) => {
      const cur = live.current;
      if (!cur.active) return current;
      const next = [...current];
      const targetChips = cur.combo >= 3 || cur.progress > 0.55 ? MAX_TARGET_CHIPS : BASE_TARGET_CHIPS;
      for (let guard = 0; next.length < targetChips && guard < 8; guard += 1) {
        const onField = new Set(next.map((c) => c.item.id));
        const pending = cur.items.filter((i) => i.correct !== false && !cur.doneIds.includes(i.id) && !onField.has(i.id));
        const distract = cur.items.filter((i) => i.correct === false && !onField.has(i.id));
        let pool: GameItem[];
        const needsCorrect = !next.some((chip) => chip.correct) && next.length >= targetChips - 1 && pending.length > 0;
        const needsDistractor = !next.some((chip) => !chip.correct) && next.length >= targetChips - 1 && distract.length > 0;
        const roll = Math.random();
        if (needsCorrect) pool = pending;
        else if (needsDistractor) pool = distract;
        else if (pending.length && (roll < 0.64 || distract.length === 0)) pool = pending;
        else if (distract.length) pool = distract;
        else if (pending.length) pool = pending;
        else break;
        const item = pool[Math.floor(Math.random() * pool.length)]!;
        const { x, y } = pickPosition(next);
        const key = `chip-${seq.current++}`;
        const progressPressure = Math.max(0, cur.doneIds.length / Math.max(1, cur.items.length)) * 0.22;
        const comboPressure = Math.min(0.22, cur.combo * 0.045);
        const pressure = Math.min(0.42, progressPressure + comboPressure);
        const ttl = Math.round((TTL_MIN + Math.floor(Math.random() * TTL_VAR)) * (1 - pressure));
        const t = window.setTimeout(() => {
          timers.current.delete(t);
          setChips((cs) => cs.filter((c) => c.key !== key));
          if (item.correct !== false && !live.current.doneIds.includes(item.id)) {
            live.current.onExpire?.(item);
            addPop(x, y, '超时', 'wrong');
          }
        }, ttl);
        timers.current.add(t);
        next.push({ key, item, x, y, correct: item.correct !== false, ttl, timerId: t });
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const clearTimers = () => { timers.current.forEach((t) => window.clearTimeout(t)); timers.current.clear(); };
    if (!active) { setChips([]); clearTimers(); return clearTimers; }
    ensureField();
    const id = window.setInterval(ensureField, REFILL_MS);
    return () => { window.clearInterval(id); clearTimers(); };
  }, [active, ensureField]);

  function addPop(x: number, y: number, text: string, kind: 'correct' | 'wrong') {
    const key = `pop-${seq.current++}`;
    setPops((cur) => [...cur, { key, x, y, text, kind }]);
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      setPops((cur) => cur.filter((p) => p.key !== key));
    }, 760);
    timers.current.add(t);
  }

  const tap = (chip: Chip) => {
    window.clearTimeout(chip.timerId);
    timers.current.delete(chip.timerId);
    setChips((cs) => cs.filter((c) => c.key !== chip.key));
    live.current.onHit(chip.item);
    addPop(chip.x, chip.y, chip.correct ? '✓ 命中' : '✗ 干扰', chip.correct ? 'correct' : 'wrong');
    if (!chip.correct) { setShake(true); window.setTimeout(() => setShake(false), 320); }
  };

  return (
    <div className="eg-arcade">
      <div className="eg-arcade-bar">
        <strong>新手提示</strong>
        <span>{goal || '点中正确目标'}</span>
        <em>点亮正确网元 / 指标，避开干扰项；连击越高，目标停留越短。</em>
        {combo > 1 && <span className="eg-arcade-combo" data-combo={combo}>连击 x{combo}</span>}
      </div>
      <div className={`eg-stage-wrap${shake ? ' is-shake' : ''}`} data-edugame-result={result}>
        <ArcadeCanvas />
        <div className="eg-field">
          {chips.map((chip, index) => (
            (() => {
              const tone = chipTone(index);
              const drift = chipDrift(chip.item.id);
              return (
            <button
              key={chip.key}
              type="button"
              className={`eg-chip tone-${tone}`}
              data-edugame-item={chip.item.id}
              data-edugame-correct={chip.correct ? 'true' : 'false'}
              data-edugame-chip-tone={tone}
              style={{
                left: `${chip.x}%`,
                top: `${chip.y}%`,
                ['--ttl' as string]: `${chip.ttl}ms`,
                ['--chip-dx' as string]: `${drift.x}px`,
                ['--chip-dy' as string]: `${drift.y}px`,
                ['--chip-hue' as string]: String(184 + tone * 28),
              }}
              onClick={() => tap(chip)}
            >
              <span className="eg-chip-ring" aria-hidden="true" />
              <GameIcon label={chip.item.label} className="eg-chip-ic" />
              <span className="eg-chip-label">{chip.item.label}</span>
            </button>
              );
            })()
          ))}
          {pops.map((pop) => (
            <span key={pop.key} className={`eg-pop eg-pop-${pop.kind}`} style={{ left: `${pop.x}%`, top: `${pop.y}%` }}>{pop.text}</span>
          ))}
          {chips.length === 0 && active && <span className="eg-field-hint">目标即将出现…</span>}
        </div>
      </div>
    </div>
  );
}

function chipTone(index: number): number {
  return index % 5;
}

function chipDrift(id: string): { x: number; y: number } {
  const hash = stableHash(id);
  return {
    x: ((hash % 7) - 3) || 3,
    y: (((Math.floor(hash / 7) % 7) - 3) || -3),
  };
}

function stableHash(value: string): number {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}
