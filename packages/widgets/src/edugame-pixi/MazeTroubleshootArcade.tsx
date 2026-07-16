import type { GameItem } from '@dgbook/edugame-core';
import { BoardCanvas } from './BoardCanvas';
import { avoidIndexAlignedTargets, stableChallengeOrder } from './challenge-order';
import { GameIcon } from './icons';

export interface MazeTroubleshootArcadeProps {
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

export function MazeTroubleshootArcade({
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
}: MazeTroubleshootArcadeProps) {
  const faults = stableChallengeOrder(items, 'maze-fault');
  const branches = avoidIndexAlignedTargets(faults, stableChallengeOrder(targets, selected?.id ?? 'maze-branch'));
  return (
    <div className="eg-maze">
      <div className="eg-arcade-bar">
        <strong>新手提示</strong>
        <span>{goal || '沿正确分支排除故障'}</span>
        <em>先点左侧故障节点，再选右侧排查分支；走错是死路，会抖动并扣分。</em>
        <span className="eg-gr-clear">已排除 {doneIds.length}/{items.length}</span>
        {combo > 1 && <span className="eg-arcade-combo">连击 x{combo}</span>}
      </div>
      <div className={`eg-stage-wrap eg-maze-stage${result === 'wrong' ? ' is-shake' : ''}${selected && active ? ' is-armed' : ''}`} data-edugame-result={result}>
        <BoardCanvas />
        <div className="eg-maze-field">
          <ol className="eg-maze-ladder" aria-label="故障节点">
            {faults.map((item, index) => {
              const done = doneIds.includes(item.id);
              return (
                <li key={item.id} className="eg-maze-rung-item">
                  <button
                    type="button"
                    className={`eg-maze-rung${selected?.id === item.id ? ' is-sel' : ''}${done ? ' is-done' : ''}`}
                    data-edugame-item={item.id}
                    data-edugame-correct={item.correct !== false ? 'true' : 'false'}
                    data-edugame-target-id={item.target_id ?? ''}
                    disabled={!active || done}
                    onClick={() => onSelect(item)}
                  >
                    <span className="eg-maze-rung-dot">{done ? '✓' : index + 1}</span>
                    <GameIcon label={item.label} className="eg-gr-ic" />
                    <span className="eg-maze-rung-label">{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="eg-maze-panel">
            {selected && active ? (
              <>
                <p className="eg-maze-prompt"><span className="eg-maze-tag">排查</span>{selected.label}</p>
                <div className="eg-maze-branches" role="group" aria-label="排查分支">
                  {branches.map((target) => (
                    <button
                      key={target.id}
                      type="button"
                      className="eg-maze-branch"
                      data-edugame-target={target.id}
                      data-edugame-correct={selected.target_id === target.id}
                      onClick={() => onDrop(target.id)}
                    >
                      <span className="eg-maze-branch-fork" aria-hidden="true" />
                      <span className="eg-maze-branch-label">{target.label}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="eg-maze-idle">先选中左侧故障节点，再查看可走的排查分支。</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
