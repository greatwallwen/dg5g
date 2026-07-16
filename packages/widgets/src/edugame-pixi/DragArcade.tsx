import { useMemo, useRef, useState } from 'react';
import type { GameItem } from '@dgbook/edugame-core';
import { BoardCanvas } from './BoardCanvas';
import { avoidIndexAlignedTargets, stableChallengeOrder } from './challenge-order';
import { GameIcon } from './icons';

// Evidence assembly: drag a card into the target it supports, or tap a card
// then tap a target. Pointer drag shows a ghost and snaps to the slot under
// the pointer; solved cards lock. DOM buttons keep it auditable.

export interface DragArcadeProps {
  items: GameItem[];
  targets: { id: string; label: string }[];
  selected: GameItem | null;
  doneIds: string[];
  combo: number;
  goal?: string;
  result: 'idle' | 'correct' | 'wrong' | 'complete';
  active: boolean;
  onSelect: (item: GameItem) => void;
  onDrop: (targetId: string) => void;
}

export function DragArcade({ items, targets, selected, doneIds, combo, goal, result, active, onSelect, onDrop }: DragArcadeProps) {
  const [drag, setDrag] = useState<{ item: GameItem; x: number; y: number } | null>(null);
  const [hoverSlot, setHoverSlot] = useState<string | null>(null);
  const movedRef = useRef(false);
  const cleared = doneIds.length;
  const deck = useMemo(() => stableChallengeOrder(items, 'drag-item'), [items]);
  const slots = useMemo(() => avoidIndexAlignedTargets(deck, stableChallengeOrder(targets, 'drag-target')), [deck, targets]);
  const rowY = (index: number, count: number) => ((index + 0.5) / Math.max(1, count)) * 100;
  const slotIndex = (id: string) => slots.findIndex((target) => target.id === id);
  const tokenIndex = (id: string) => deck.findIndex((item) => item.id === id);
  const wires = deck
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => doneIds.includes(item.id))
    .map(({ item, index }) => ({
      id: item.id,
      y1: rowY(index, deck.length),
      y2: rowY(Math.max(0, slotIndex(item.target_id ?? '')), slots.length),
    }));
  const guide = selected && active ? {
    y1: rowY(Math.max(0, tokenIndex(selected.id)), deck.length),
    y2: hoverSlot ? rowY(Math.max(0, slotIndex(hoverSlot)), slots.length) : rowY(Math.max(0, tokenIndex(selected.id)), deck.length),
    armed: Boolean(hoverSlot),
  } : null;

  const slotUnder = (x: number, y: number): string | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    return el?.closest('[data-edugame-target]')?.getAttribute('data-edugame-target') ?? null;
  };

  const startDrag = (e: React.PointerEvent, item: GameItem) => {
    if (doneIds.includes(item.id)) return;
    movedRef.current = false;
    onSelect(item); // arm slots + keep tap-to-select behaviour
    setDrag({ item, x: e.clientX, y: e.clientY });
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
  };
  const moveDrag = (e: React.PointerEvent) => {
    if (!drag) return;
    movedRef.current = true;
    setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
    setHoverSlot(slotUnder(e.clientX, e.clientY));
  };
  const endDrag = (e: React.PointerEvent) => {
    if (!drag) return;
    const slot = slotUnder(e.clientX, e.clientY);
    const moved = movedRef.current;
    setDrag(null);
    setHoverSlot(null);
    if (moved && slot) onDrop(slot); // only a real drag drops; a plain tap just selected
  };

  return (
    <div className="eg-assemble">
      <div className="eg-arcade-bar">
        <strong>新手提示</strong>
        <span>{goal || '把证据卡放入正确目标门'}</span>
        <em>先看证据卡的线索，再拖到能支撑结论的目标门；放错会弹回并扣分。</em>
        <span className="eg-gr-clear">已装 {cleared}/{items.length}</span>
        {combo > 1 && <span className="eg-arcade-combo">连击 x{combo}</span>}
      </div>
      <div className={`eg-stage-wrap${selected && active ? ' is-armed' : ''}${result === 'wrong' ? ' is-shake' : ''}`} data-edugame-result={result}>
        <BoardCanvas />
        <svg className="eg-asm-wires" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {wires.map((wire) => (
            <line key={wire.id} x1="4" y1={wire.y1} x2="96" y2={wire.y2} className="eg-asm-wire" data-edugame-drag-wire />
          ))}
          {guide && <line x1="4" y1={guide.y1} x2={guide.armed ? '96' : '56'} y2={guide.y2} className={`eg-asm-wire is-guide${guide.armed ? ' is-armed' : ''}`} data-edugame-drag-guide />}
        </svg>
        <div className="eg-asm-overlay">
          <div className="eg-asm-clue" data-edugame-guide="true">
            <strong>{selected ? selected.label : '先选择一张证据卡'}</strong>
            <span>{active ? (selected ? selected.definition || selected.prompt || selected.text || '判断它能证明哪个目标。' : '拖拽或点击左侧卡片，右侧目标门会进入待接收状态。') : '点击开始挑战后再进行拖拽。'}</span>
          </div>
          <div className="eg-asm-col eg-asm-tokens">
            <h4>证据卡</h4>
            {deck.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`eg-asm-token${selected?.id === item.id ? ' is-sel' : ''}${doneIds.includes(item.id) ? ' is-done' : ''}${drag?.item.id === item.id ? ' is-drag' : ''}`}
                data-edugame-item={item.id}
                data-edugame-correct={item.correct !== false ? 'true' : 'false'}
                data-edugame-target-id={item.target_id ?? ''}
                disabled={!active || doneIds.includes(item.id)}
                onPointerDown={(e) => startDrag(e, item)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
                <GameIcon label={item.label} className="eg-asm-ic" />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
          <div className="eg-asm-col eg-asm-slots">
            <h4>目标门</h4>
            {slots.map((slot) => (
              <button
                key={slot.id}
                type="button"
                className={`eg-asm-slot${hoverSlot === slot.id ? ' is-over' : ''}`}
                data-edugame-target={slot.id}
                data-edugame-correct={selected ? selected.target_id === slot.id : false}
                disabled={!active || !selected}
                onClick={() => onDrop(slot.id)}
              >
                <span>{slot.label}</span>
              </button>
            ))}
          </div>
        </div>
        {drag && (
          <div className="eg-asm-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">{drag.item.label}</div>
        )}
      </div>
    </div>
  );
}
