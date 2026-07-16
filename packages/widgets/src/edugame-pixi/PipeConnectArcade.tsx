import type { GameItem } from '@dgbook/edugame-core';
import { BoardCanvas } from './BoardCanvas';
import { avoidIndexAlignedTargets, stableChallengeOrder } from './challenge-order';
import { GameIcon } from './icons';

export interface PipeConnectArcadeProps {
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

export function PipeConnectArcade({
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
}: PipeConnectArcadeProps) {
  const rowY = (index: number, count: number) => ((index + 0.5) / Math.max(1, count)) * 100;
  const nodes = stableChallengeOrder(items, 'pipe-node');
  const ports = avoidIndexAlignedTargets(nodes, stableChallengeOrder(targets, 'pipe-port'));
  const portIndex = (id: string) => ports.findIndex((target) => target.id === id);
  const wires = nodes
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => doneIds.includes(item.id))
    .map(({ item, index }) => ({
      id: item.id,
      y1: rowY(index, nodes.length),
      y2: rowY(Math.max(0, portIndex(item.target_id ?? '')), ports.length),
    }));

  return (
    <div className="eg-pipe">
      <div className="eg-arcade-bar">
        <strong>新手提示</strong>
        <span>{goal || '把每个设备节点连到正确接口'}</span>
        <em>先点左侧节点，再点右侧接口；连对会锁定发光链路，连错会闪烁扣分。</em>
        <span className="eg-gr-clear">已连 {doneIds.length}/{items.length}</span>
        {combo > 1 && <span className="eg-arcade-combo">连击 x{combo}</span>}
      </div>
      <div className={`eg-stage-wrap eg-pipe-stage${result === 'wrong' ? ' is-shake' : ''}${selected && active ? ' is-armed' : ''}`} data-edugame-result={result}>
        <BoardCanvas />
        <div className="eg-pipe-field">
          <svg className="eg-pipe-wires" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {wires.map((wire) => (
              <line key={wire.id} x1="3" y1={wire.y1} x2="97" y2={wire.y2} className="eg-pipe-wire" />
            ))}
          </svg>
          <div className="eg-pipe-col eg-pipe-src">
            {nodes.map((item) => {
              const done = doneIds.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`eg-pipe-node${selected?.id === item.id ? ' is-sel' : ''}${done ? ' is-done' : ''}`}
                  data-edugame-item={item.id}
                  data-edugame-correct={item.correct !== false ? 'true' : 'false'}
                  data-edugame-target-id={item.target_id ?? ''}
                  disabled={!active || done}
                  onClick={() => onSelect(item)}
                >
                  <GameIcon label={item.label} className="eg-pipe-ic" />
                  <span>{item.label}</span>
                  <span className="eg-pipe-jack" aria-hidden="true" />
                </button>
              );
            })}
          </div>
          <div className="eg-pipe-col eg-pipe-dst">
            {ports.map((target) => (
              <button
                key={target.id}
                type="button"
                className={`eg-pipe-port${selected && active ? ' is-armed' : ''}`}
                data-edugame-target={target.id}
                data-edugame-correct={selected ? selected.target_id === target.id : false}
                disabled={!active || !selected}
                onClick={() => onDrop(target.id)}
              >
                <span className="eg-pipe-jack" aria-hidden="true" />
                <span className="eg-pipe-port-label">{target.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
