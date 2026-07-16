import type { GameConfig, GameItem } from '@dgbook/edugame-core';
import { QuickHitArcade } from './QuickHitArcade';

const BOSS_WAVES = [
  { label: '识别', hint: '先压制风险信号' },
  { label: '核证', hint: '再确认工程证据' },
  { label: '交付', hint: '最后形成复盘结论' },
];

export interface BossReviewArcadeProps {
  config: GameConfig;
  items: GameItem[];
  doneIds: string[];
  score: number;
  combo: number;
  progress: number;
  result: 'idle' | 'correct' | 'wrong' | 'complete';
  active: boolean;
  goal?: string;
  levelStep: number;
  levelCount: number;
  onHit: (item: GameItem) => void;
  onExpire?: (item: GameItem) => void;
}

export function BossReviewArcade(props: BossReviewArcadeProps) {
  const { doneIds, items, combo, progress, result, levelStep, levelCount } = props;
  const hp = Math.max(0, 100 - Math.round(progress * 100));
  const phase = Math.min(BOSS_WAVES.length, Math.max(1, levelStep + 1));
  const wave = BOSS_WAVES[phase - 1] ?? BOSS_WAVES[0]!;
  const pressure = result === 'wrong' ? 'counter' : combo >= 3 ? 'break' : props.active ? 'engaged' : 'ready';
  const remaining = Math.max(0, items.filter((item) => item.correct !== false && !doneIds.includes(item.id)).length);

  return (
    <div className="eg-boss" data-edugame-boss-review data-edugame-boss-pressure={pressure} data-edugame-boss-wave={phase}>
      <div className="eg-boss-hud">
        <div className="eg-boss-name">
          <span>综合复盘 Boss</span>
          <strong>风险压制战</strong>
        </div>
        <div className="eg-boss-hp" data-edugame-boss-hp={hp} aria-label={`Boss 剩余 ${hp}%`}>
          <i style={{ width: `${hp}%` }} />
        </div>
        <ol data-edugame-boss-wave-track aria-label="Boss 阶段">
          {BOSS_WAVES.map((entry, index) => {
            const step = index + 1;
            return (
              <li key={entry.label} data-edugame-boss-phase={step < phase ? 'done' : step === phase ? 'active' : 'locked'}>
                <span>{step}</span><b>{entry.label}</b>
              </li>
            );
          })}
        </ol>
        <em data-edugame-boss-stage>{wave.label} {levelStep + 1}/{Math.max(1, levelCount)}</em>
        <em data-edugame-boss-remaining>剩余 {remaining}</em>
      </div>
      <div className="eg-boss-wave-card" data-edugame-boss-wave-card>
        <strong>{wave.label}阶段</strong>
        <span>{wave.hint}</span>
        <i>{Math.round(progress * 100)}%</i>
      </div>
      {result === 'wrong' && (
        <div className="eg-boss-counter" data-edugame-boss-counter>风险反击</div>
      )}
      {combo >= 3 && (
        <div className="eg-boss-break" data-edugame-boss-break>连续压制</div>
      )}
      <QuickHitArcade {...props} goal={props.goal || `${wave.hint}，连续命中可压低 Boss 血量。`} />
    </div>
  );
}
