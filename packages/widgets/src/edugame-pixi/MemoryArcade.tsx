import { useEffect, useMemo, useState } from 'react';
import type { GameItem } from '@dgbook/edugame-core';
import { BoardCanvas } from './BoardCanvas';
import { GameIcon } from './icons';

const MEMORY_PREVIEW_SECONDS = 3;

// 配对翻牌 (memory match): flip device/metric cards to find matching term/meaning
// pairs. Real 3D flip cards over the themed board; matched pairs lock with a glow,
// mismatches flip back. Cards are DOM buttons (data-edugame-item, keyboard-reachable).

export interface MemoryArcadeProps {
  items: GameItem[];
  flipped: GameItem[];
  doneIds: string[];
  combo: number;
  goal?: string;
  result: 'idle' | 'correct' | 'wrong' | 'complete';
  active: boolean;
  cardMark?: string;
  onFlip: (item: GameItem) => void;
}

export function MemoryArcade({ items, flipped, doneIds, combo, goal, result, active, cardMark = '知识', onFlip }: MemoryArcadeProps) {
  const itemsKey = useMemo(() => items.map((item) => item.id).join('|'), [items]);
  const [previewLeft, setPreviewLeft] = useState(0);
  const clearedPairs = Math.floor(doneIds.length / 2);
  const totalPairs = Math.max(1, Math.floor(items.length / 2));
  const previewing = active && previewLeft > 0 && doneIds.length === 0 && flipped.length === 0;

  useEffect(() => {
    if (!active) {
      setPreviewLeft(0);
      return undefined;
    }
    setPreviewLeft(MEMORY_PREVIEW_SECONDS);
    const timer = window.setInterval(() => {
      setPreviewLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [active, itemsKey]);

  return (
    <div className="eg-memboard">
      <div className="eg-arcade-bar">
        <strong>记忆挑战</strong>
        <span>{goal || '翻牌配对术语与含义'}</span>
        <em>卡牌已洗牌；先记住位置，再把术语和对应解释配成一组。</em>
        <span className="eg-gr-clear">已配 {clearedPairs}/{totalPairs}</span>
        {combo > 1 && <span className="eg-arcade-combo">连击 x{combo}</span>}
      </div>
      <div className={`eg-stage-wrap${result === 'wrong' ? ' is-shake' : ''}`} data-edugame-result={result}>
        <BoardCanvas />
        {previewing && (
          <div className="eg-memory-preview" data-edugame-memory-preview={previewLeft}>
            <strong>{previewLeft}</strong>
            <span>记住位置</span>
          </div>
        )}
        <div className="eg-mcards" data-count={items.length}>
          {items.map((card) => {
            const done = doneIds.includes(card.id);
            const open = previewing || done || flipped.some((f) => f.id === card.id);
            const kind = memoryCardKind(card);
            const miss = result === 'wrong' && open && !done;
            return (
              <button
                key={card.id}
                type="button"
                className={`eg-mcard${open ? ' is-open' : ''}${done ? ' is-done' : ''}${miss ? ' is-miss' : ''}`}
                data-edugame-item={card.id}
                data-edugame-target-id={card.target_id ?? ''}
                data-edugame-card-kind={kind.id}
                disabled={previewing || done || !active}
                onClick={() => onFlip(card)}
              >
                <span className="eg-mcard-inner">
                  <span className="eg-mcard-face eg-mcard-front" aria-hidden={open}>
                    <span className="eg-mcard-mark">{cardMark}</span>
                    <span className="eg-mcard-kind">{kind.label}</span>
                  </span>
                  <span className="eg-mcard-face eg-mcard-back" aria-hidden={!open}><GameIcon label={card.label} className="eg-mcard-ic" /><span>{card.label}</span></span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function memoryCardKind(card: GameItem): { id: string; label: string } {
  return card.id.endsWith(':meaning') ? { id: 'meaning', label: '解释' } : { id: 'term', label: '术语' };
}
