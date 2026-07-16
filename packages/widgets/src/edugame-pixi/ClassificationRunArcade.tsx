import type { GameItem } from '@dgbook/edugame-core';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { BoardCanvas } from './BoardCanvas';
import { avoidIndexAlignedTargets, stableChallengeOrder } from './challenge-order';
import { GameIcon } from './icons';

export const CLASSIFICATION_REJECT_TARGET_ID = '__reject__';

export interface ClassificationRunArcadeProps {
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
  onExpire?: (item: GameItem) => void;
}

export function ClassificationRunArcade({
  items,
  targets,
  selected,
  doneIds,
  combo,
  goal,
  result,
  active,
  onSelect,
  onDrop,
  onExpire,
}: ClassificationRunArcadeProps) {
  const queue = stableChallengeOrder(items.filter((item) => !doneIds.includes(item.id)), 'class-item');
  const front = selected ?? queue[0] ?? null;
  const lanes = avoidIndexAlignedTargets(queue, stableChallengeOrder(targets, front?.id ?? 'class-lane'), targetIdFor);
  const visibleLanes = front?.correct === false ? [...lanes, { id: CLASSIFICATION_REJECT_TARGET_ID, label: '拦截干扰' }] : lanes;
  const progressPct = Math.round((doneIds.length / Math.max(1, items.length)) * 100);
  const waveState = result === 'wrong' ? 'danger' : combo >= 3 ? 'boost' : active ? 'running' : 'ready';
  const chain = Math.min(3, combo);
  const expireRef = useRef(onExpire);
  const ttlMs = Math.max(5200, 10000 - Math.min(combo, 6) * 650);
  const [ttlLeftMs, setTtlLeftMs] = useState(ttlMs);
  const ttlPct = Math.max(0, Math.round((ttlLeftMs / ttlMs) * 100));
  const ttlState = ttlPct <= 24 ? 'danger' : ttlPct <= 48 ? 'warn' : 'safe';

  useEffect(() => {
    expireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    setTtlLeftMs(ttlMs);
    if (!active || !front) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const next = Math.max(0, ttlMs - (Date.now() - startedAt));
      setTtlLeftMs(next);
      if (next <= 0) {
        window.clearInterval(timer);
        expireRef.current?.(front);
      }
    }, 120);
    return () => window.clearInterval(timer);
  }, [active, front?.id, ttlMs]);

  return (
    <div className="eg-clrun" data-edugame-classrun-pressure={waveState} data-edugame-classrun-ttl={ttlState}>
      <div className="eg-arcade-bar">
        <strong>新手提示</strong>
        <span>{goal || '把对象送进正确分类通道'}</span>
        <em>先点传送带最前面的对象，再点它所属的分类通道；送错会抖动并扣分。</em>
        <span className="eg-gr-clear">已分类 {doneIds.length}/{items.length}</span>
        {combo > 1 && <span className="eg-arcade-combo">连击 x{combo}</span>}
      </div>
      <div className="eg-clrun-hud" data-edugame-classrun-wave>
        <span>波次压力</span>
        <i><b style={{ width: `${Math.max(8, 100 - progressPct)}%` }} /></i>
        <em data-edugame-classrun-queue>队列 {queue.length}</em>
        <span className="eg-clrun-ttl" data-edugame-item-ttl={ttlState}>
          <strong>{Math.ceil(ttlLeftMs / 1000)}s</strong>
          <i><b style={{ width: `${ttlPct}%` }} /></i>
        </span>
        <ol aria-label="分类连击链">
          {[0, 1, 2].map((step) => (
            <li key={step} data-edugame-classrun-chain-step={step < chain ? 'hot' : 'idle'}>{step + 1}</li>
          ))}
        </ol>
      </div>
      <div className={`eg-stage-wrap eg-clrun-stage${result === 'wrong' ? ' is-shake' : ''}${front && active ? ' is-armed' : ''}`} data-edugame-result={result}>
        <BoardCanvas />
        <div className="eg-clrun-field">
          <div className="eg-clrun-belt" aria-label="待分类对象传送带">
            {queue.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={`eg-clrun-chip${front?.id === item.id ? ' is-front' : ''}${selected?.id === item.id ? ' is-sel' : ''}`}
                data-edugame-item={item.id}
                data-edugame-correct="true"
                data-edugame-target-id={targetIdFor(item)}
                disabled={!active || (front?.id !== item.id && selected?.id !== item.id)}
                style={{ '--clrun-depth': String(index) } as CSSProperties}
                onClick={() => onSelect(item)}
              >
                <GameIcon label={item.label} className="eg-clrun-ic" />
                <span className="eg-clrun-chip-label">{item.label}</span>
                {front?.id === item.id && <span className="eg-clrun-front-tag" aria-hidden="true">当前</span>}
                {front?.id === item.id && active && <span className="eg-clrun-chip-timer" aria-hidden="true">{Math.ceil(ttlLeftMs / 1000)}</span>}
                {front?.id === item.id && active && <span className="eg-clrun-scan" aria-hidden="true" />}
              </button>
            ))}
            {queue.length === 0 && <p className="eg-clrun-empty">全部分类完成</p>}
          </div>
          <div className="eg-clrun-lanes" role="group" aria-label="分类通道">
            {visibleLanes.map((target) => (
              <button
                key={target.id}
                type="button"
                className={`eg-clrun-lane${front && active ? ' is-armed' : ''}${target.id === CLASSIFICATION_REJECT_TARGET_ID ? ' is-reject' : ''}`}
                data-edugame-target={target.id}
                data-edugame-correct={selected ? targetIdFor(selected) === target.id : false}
                disabled={!active || !selected}
                onClick={() => onDrop(target.id)}
              >
                <span className="eg-clrun-lane-arrow" aria-hidden="true" />
                <span className="eg-clrun-lane-label">{target.label}</span>
              </button>
            ))}
          </div>
          {result === 'correct' && (
            <div className="eg-clrun-hit" data-edugame-classrun-hit>通道命中</div>
          )}
          {result === 'wrong' && (
            <div className="eg-clrun-hit is-wrong" data-edugame-classrun-miss>通道回弹</div>
          )}
        </div>
      </div>
    </div>
  );
}

function targetIdFor(item: GameItem): string {
  return item.correct === false ? CLASSIFICATION_REJECT_TARGET_ID : item.target_id ?? '';
}
