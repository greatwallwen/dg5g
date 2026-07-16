'use client';

import { useMemo, useState } from 'react';
import type { DemoUnit } from '@/features/platform/deep-textbook-demo-data';
import { Icon } from '@/ui/foundation/icons';
import { practiceKindForNode } from './micro-practice-model';

export function MicroPractice({ unit, onResult }: { unit: DemoUnit; onResult: (correct: boolean) => void }) {
  const kind = practiceKindForNode(unit.capabilityNodeId);
  if (kind === 'connection') return <ConnectionPractice unit={unit} onResult={onResult} />;
  if (kind === 'ordering') return <OrderingPractice unit={unit} onResult={onResult} />;
  if (kind === 'card-flip') return <EvidenceCards unit={unit} onResult={onResult} />;
  return <ChoicePractice unit={unit} onResult={onResult} />;
}

function ChoicePractice({ unit, onResult }: { unit: DemoUnit; onResult: (correct: boolean) => void }) {
  const [choice, setChoice] = useState<number | null>(null);
  const options = [unit.counterexample, unit.requiredEvidence, unit.summary];
  const correct = choice === 1;
  function choose(index: number) {
    setChoice(index);
    onResult(index === 1);
  }
  return (
    <div className="micro-choice">
      <header><span>单点判断</span><strong>哪条记录能直接支撑“{unit.output}”？</strong></header>
      <div>{options.map((option, index) => <button className={choice === index ? correct ? 'is-correct' : 'is-wrong' : ''} key={option} onClick={() => choose(index)} type="button"><i>{String.fromCharCode(65 + index)}</i><span>{option}</span>{choice === index ? <Icon name={correct ? 'check' : 'close'} size={16} /> : null}</button>)}</div>
      {choice !== null ? <p className={correct ? 'is-correct' : 'is-wrong'}>{correct ? unit.correction : `这条信息还不能独立复核。${unit.correction}`}</p> : <small>选择后立即反馈，不计入正式测试成绩。</small>}
    </div>
  );
}

function ConnectionPractice({ unit, onResult }: { unit: DemoUnit; onResult: (correct: boolean) => void }) {
  const data = useMemo(() => connectionData(unit.capabilityNodeId), [unit.capabilityNodeId]);
  const [activeSource, setActiveSource] = useState<number | null>(null);
  const [connections, setConnections] = useState<Record<number, number>>({});
  const [checked, setChecked] = useState(false);
  const complete = Object.keys(connections).length === data.sources.length;
  const correct = complete && data.answer.every((target, source) => connections[source] === target);

  function connect(target: number) {
    if (activeSource === null) return;
    setConnections((current) => ({ ...current, [activeSource]: target }));
    setActiveSource(null);
    setChecked(false);
  }

  function check() {
    if (!complete) return;
    setChecked(true);
    onResult(correct);
  }

  return (
    <div className="micro-connection">
      <header><span>工程连线</span><strong>把判断对象连接到能够直接证明它的现场证据</strong><small>先选左侧对象，再选右侧证据</small></header>
      <div className="connection-board">
        <div className="connection-column is-source">{data.sources.map((label, index) => <button aria-pressed={activeSource === index} className={activeSource === index ? 'is-active' : ''} key={label} onClick={() => { setActiveSource(index); setChecked(false); }} type="button"><Icon name="target" size={16} /><span>{label}</span><i /></button>)}</div>
        <svg aria-hidden="true" className="connection-lines" preserveAspectRatio="none" viewBox="0 0 100 232">{Object.entries(connections).map(([sourceKey, target]) => { const source = Number(sourceKey); const valid = data.answer[source] === target; const y1 = 38 + source * 78; const y2 = 38 + target * 78; return <path className={checked ? valid ? 'is-correct' : 'is-wrong' : ''} d={`M24 ${y1} C42 ${y1}, 58 ${y2}, 76 ${y2}`} key={source} vectorEffect="non-scaling-stroke" />; })}</svg>
        <div className="connection-column is-target">{data.targets.map((label, index) => <button key={label} onClick={() => connect(index)} type="button"><i /><span>{label}</span><Icon name="file" size={16} /></button>)}</div>
      </div>
      <footer><span>{checked ? correct ? '三条证据关系全部成立' : '存在错连，请重新核对对象与证据' : `${Object.keys(connections).length} / ${data.sources.length} 已连接`}</span><button disabled={!complete} onClick={check} type="button">核验连线<Icon name="check" size={16} /></button></footer>
    </div>
  );
}

function EvidenceCards({ unit, onResult }: { unit: DemoUnit; onResult: (correct: boolean) => void }) {
  const cards = [
    ['对象定位', unit.points[0] ?? unit.summary],
    ['判断动作', unit.correction],
    ['交付证据', unit.requiredEvidence],
  ];
  const [revealed, setRevealed] = useState<number[]>([]);
  const allRevealed = revealed.length === cards.length;
  return (
    <div className="micro-cards">
      <header><span>证据翻卡</span><strong>依次检查一份专业产出必须具备的三层证据</strong></header>
      <div>{cards.map(([label, value], index) => { const open = revealed.includes(index); return <button aria-pressed={open} className={open ? 'is-open' : ''} key={label} onClick={() => setRevealed((current) => current.includes(index) ? current : [...current, index])} type="button"><span className="card-front"><Icon name="file" size={22} /><strong>{label}</strong><small>点击核验</small></span><span className="card-back"><Icon name="check" size={20} /><strong>{value}</strong></span></button>; })}</div>
      <footer><span>{allRevealed ? '三层证据已核验，可以形成节点产出' : `${revealed.length} / ${cards.length} 已核验`}</span><button disabled={!allRevealed} onClick={() => onResult(true)} type="button">确认闭环<Icon name="arrow" size={16} /></button></footer>
    </div>
  );
}

function OrderingPractice({ unit, onResult }: { unit: DemoUnit; onResult: (correct: boolean) => void }) {
  const shuffled = [unit.steps[1], unit.steps[2], unit.steps[0]].filter(Boolean) as string[];
  const [placed, setPlaced] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);
  const correct = placed.length === unit.steps.length && placed.every((step, index) => step === unit.steps[index]);
  function add(step: string) {
    if (placed.includes(step)) return;
    setPlaced((current) => [...current, step]);
    setChecked(false);
  }
  function check() {
    if (placed.length !== unit.steps.length) return;
    setChecked(true);
    onResult(correct);
  }
  return <div className="micro-ordering"><header><span>流程排序</span><strong>按现场作业顺序建立判断链</strong><small>点击下方步骤，依次放入 1–3 号位</small></header><ol>{unit.steps.map((_, index) => <li className={checked ? placed[index] === unit.steps[index] ? 'is-correct' : 'is-wrong' : ''} key={index}><i>{index + 1}</i><strong>{placed[index] ?? '等待步骤'}</strong></li>)}</ol><div>{shuffled.map((step) => <button disabled={placed.includes(step)} key={step} onClick={() => add(step)} type="button">{step}<Icon name="arrow" size={15} /></button>)}</div><footer><button className="is-secondary" disabled={!placed.length} onClick={() => { setPlaced([]); setChecked(false); onResult(false); }} type="button">重新排序</button><span>{checked ? correct ? '顺序正确，判断链成立' : '顺序不成立，请重新排布' : `${placed.length} / ${unit.steps.length} 已放置`}</span><button disabled={placed.length !== unit.steps.length} onClick={check} type="button">核验顺序<Icon name="check" size={15} /></button></footer></div>;
}

function connectionData(nodeId: string) {
  if (nodeId.startsWith('P1T2')) {
    return {
      sources: ['扇区身份', '主瓣方向', '近远覆盖'],
      targets: ['下倾角与挂高', '扇区编号', '方位角'],
      answer: [1, 2, 0],
    };
  }
  return {
    sources: ['设备位置', '设备身份', '连接方向'],
    targets: ['端口标签与走线', '机柜全景', '铭牌近景'],
    answer: [1, 2, 0],
  };
}
