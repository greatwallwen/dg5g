import type { GameItem } from '@dgbook/edugame-core';
import { BoardCanvas } from './BoardCanvas';
import { GameIcon } from './icons';

export interface SortArcadeProps {
  items: GameItem[];
  doneIds: string[];
  combo: number;
  goal?: string;
  result: 'idle' | 'correct' | 'wrong' | 'complete';
  active: boolean;
  onPick: (item: GameItem) => void;
}

export function SortArcade({ items, doneIds, combo, goal, result, active, onPick }: SortArcadeProps) {
  const correctItems = items
    .filter((item) => item.correct !== false)
    .sort((a, b) => (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY));
  const deckItems = buildChallengeDeck(items);
  const placedOrder = (item: GameItem) => doneIds.indexOf(item.id) + 1;
  const remaining = items.filter((item) => !doneIds.includes(item.id));
  const expectedOrder = Math.min(...remaining.map((item) => item.order ?? Number.POSITIVE_INFINITY));
  const nextStep = correctItems.find((item) => !doneIds.includes(item.id));

  return (
    <div className="eg-sortflow">
      <div className="eg-arcade-bar">
        <strong>流程洗牌</strong>
        <span>{goal || '按工程顺序排列步骤'}</span>
        <em>从乱序卡堆中找下一步；干扰卡会扣分，正确卡会进入流程轨道。</em>
        <span className="eg-gr-clear">已排 {doneIds.length}/{correctItems.length}</span>
        {combo > 1 && <span className="eg-arcade-combo">连击 x{combo}</span>}
      </div>
      <div className={`eg-stage-wrap${result === 'wrong' ? ' is-shake' : ''}`} data-edugame-result={result}>
        <BoardCanvas />
        <div className="eg-sf-overlay">
          <div className="eg-sf-head">
            <h4>排出正确流程</h4>
            <span>下一步 {nextStep?.order ?? '-'}</span>
          </div>
          <div className="eg-sf-track" aria-label="流程轨道">
            {correctItems.map((item) => {
              const done = doneIds.includes(item.id);
              return (
                <span key={item.id} className={`eg-sf-slot${done ? ' is-filled' : ''}${nextStep?.id === item.id ? ' is-armed' : ''}`}>
                  <i>{item.order}</i>
                  <b>{done ? item.label : nextStep?.id === item.id ? '待选择' : '待解锁'}</b>
                </span>
              );
            })}
          </div>
          <ol className="eg-sf-list">
            {deckItems.map((item) => {
              const done = doneIds.includes(item.id);
              const isNext = !done && item.order === expectedOrder;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`eg-sf-step${done ? ' is-done' : ''}`}
                    data-edugame-item={item.id}
                    data-edugame-correct={isNext ? 'true' : 'false'}
                    data-edugame-order={item.order ?? ''}
                    disabled={done || !active}
                    onClick={() => onPick(item)}
                  >
                    <span className="eg-sf-num">{done ? placedOrder(item) : '?'}</span>
                    <GameIcon label={item.label} className="eg-sf-ic" />
                    <span className="eg-sf-label">{item.label}</span>
                    {done && <span className="eg-sf-check">OK</span>}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}

function buildChallengeDeck(items: GameItem[]): GameItem[] {
  return [...items].sort((a, b) => {
    const rankA = deckRank(a);
    const rankB = deckRank(b);
    return rankA === rankB ? a.id.localeCompare(b.id) : rankA - rankB;
  });
}

function deckRank(item: GameItem): number {
  const order = item.order ?? 99;
  const seed = [...item.id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return ((order * 7 + seed) % 17) + (item.correct === false ? 3 : 0);
}
