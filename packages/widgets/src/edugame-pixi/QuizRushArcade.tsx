import { useEffect, useRef, useState } from 'react';
import type { GameItem } from '@dgbook/edugame-core';
import { stableChallengeOrder } from './challenge-order';
import { GateRushCanvas } from './GateRushCanvas';

// 闸门冲刺 (gate rush): an incoming signal rushes down the track; route it into the
// correct gate before your lives run out. Reuses the gate-routing data (item.target_id)
// that the quiz-rush projects actually ship. Gates are real DOM buttons
// (keyboard-reachable, data-edugame-target) over the rushing-track canvas.

export interface QuizRushArcadeProps {
  item?: GameItem;
  targets: { id: string; label: string }[];
  doneIds: string[];
  levelTarget: number;
  combo: number;
  mistakeCount: number;
  maxLives: number;
  result: 'idle' | 'correct' | 'wrong' | 'complete';
  feedback: string;
  goal?: string;
  active: boolean;
  onGate: (gateId: string) => void;
  onTimeout: (item: GameItem) => void;
  onDefeat: () => void;
}

export function QuizRushArcade(props: QuizRushArcadeProps) {
  const { item, targets, doneIds, levelTarget, combo, mistakeCount, maxLives, result, feedback, goal, active, onGate, onTimeout, onDefeat } = props;
  const livesLeft = Math.max(0, maxLives - mistakeCount);
  const challengeSeconds = Math.max(5, 9 - Math.min(3, combo));
  const [signalTime, setSignalTime] = useState(challengeSeconds);
  const timedOutKey = useRef('');

  useEffect(() => {
    if (active && livesLeft <= 0) onDefeat();
  }, [active, livesLeft, onDefeat]);

  useEffect(() => {
    setSignalTime(challengeSeconds);
    timedOutKey.current = '';
  }, [item?.id, challengeSeconds]);

  useEffect(() => {
    if (!active || !item) return undefined;
    const timer = window.setInterval(() => {
      setSignalTime((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [active, item?.id]);

  useEffect(() => {
    if (!active || !item || signalTime > 0) return;
    if (timedOutKey.current === item.id) return;
    timedOutKey.current = item.id;
    onTimeout(item);
  }, [active, item, signalTime, onTimeout]);

  const cleared = Math.min(doneIds.length, levelTarget);
  const gates = avoidFirstCorrectGate(stableChallengeOrder(targets, item?.id ?? 'quiz-gate'), item?.target_id);
  const rushPct = Math.max(8, Math.round((signalTime / Math.max(1, challengeSeconds)) * 100));
  const chain = Math.min(3, combo);
  const pressureState = livesLeft <= 1 ? 'danger' : chain >= 3 ? 'boost' : active ? 'rush' : 'ready';

  return (
    <div className="eg-gaterush">
      <div className="eg-arcade-bar">
        <strong>新手提示</strong>
        <span>{goal || '把信号送进正确闸门'}</span>
        <em>看清来袭信号，选对应闸门；选错或超时扣血。</em>
        <span className="eg-gr-lives" aria-label={`剩余 ${livesLeft} 次容错`}>容错 {livesLeft}/{maxLives}</span>
        <span className="eg-gr-clear">闯关 {cleared}/{levelTarget}</span>
        {combo > 1 && <span className="eg-arcade-combo">连击 x{combo}</span>}
      </div>
      <div className="eg-gr-hud" data-edugame-quiz-rush-meter data-edugame-quiz-pressure={pressureState}>
        <span>信号倒计时 {signalTime}s</span>
        <i><b style={{ width: `${rushPct}%` }} /></i>
        <ol data-edugame-quiz-chain aria-label="连击链">
          {[0, 1, 2].map((step) => (
            <li key={step} data-edugame-quiz-chain-step={step < chain ? 'hot' : 'idle'}>{step + 1}</li>
          ))}
        </ol>
      </div>
      <div className={`eg-stage-wrap eg-gr-wrap${result === 'wrong' ? ' is-shake' : ''}`} data-edugame-result={result}>
        <GateRushCanvas />
        <div className="eg-gr-overlay">
          {item ? (
            <div className="eg-gr-signal" data-edugame-item={item.id} key={item.id}>
              <span className="eg-gr-tag">来袭信号</span>
              <strong>{item.label}</strong>
              <small>{item.text || item.prompt || ''}</small>
            </div>
          ) : (
            <div className="eg-gr-signal"><strong>准备…</strong></div>
          )}
          <div className="eg-gr-gates">
            {gates.map((gate) => (
              <button
                key={gate.id}
                type="button"
                className="eg-gr-gate"
                data-edugame-target={gate.id}
                data-edugame-correct={item ? gate.id === item.target_id : false}
                disabled={!item || !active}
                onClick={() => onGate(gate.id)}
              >
              <span className="eg-gr-gate-id">目标门</span>
                <span className="eg-gr-gate-label">{gate.label}</span>
              </button>
            ))}
          </div>
          <div className={`eg-gr-flash eg-gr-flash-${result}`} key={`${result}-${doneIds.length}-${mistakeCount}`}>
            {result === 'correct' ? '✓ 通过闸门' : result === 'wrong' ? '✗ 闸门错误' : ''}
          </div>
          {result === 'wrong' && <div className="eg-gr-shock" data-edugame-quiz-shock>闸门冲击</div>}
        </div>
      </div>
      <div className="eg-gr-explain">{feedback}</div>
    </div>
  );
}

function avoidFirstCorrectGate(gates: { id: string; label: string }[], targetId?: string): { id: string; label: string }[] {
  if (!targetId || gates.length < 2 || gates[0]?.id !== targetId) return gates;
  return [...gates.slice(1), gates[0]!];
}
