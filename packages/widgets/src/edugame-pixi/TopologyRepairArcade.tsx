import type { GameItem } from '@dgbook/edugame-core';
import { useEffect, useMemo, useRef } from 'react';
import { stableChallengeOrder } from './challenge-order';

type Target = { id: string; label: string };

export function TopologyRepairArcade({ items, targets, selected, doneIds, combo, result, active, levelStep, onSelect, onDrop }: {
  items: GameItem[]; targets: Target[]; selected: GameItem | null; doneIds: string[]; combo: number;
  result: 'idle' | 'correct' | 'wrong' | 'complete'; active: boolean; levelStep: number;
  onSelect: (item: GameItem) => void; onDrop: (targetId: string) => void;
}) {
  const nodes = useMemo(() => stableChallengeOrder(items, `topology-repair-${levelStep}`), [items, levelStep]);
  const orderedTargets = useMemo(() => stableChallengeOrder(targets, `topology-target-${levelStep}`), [levelStep, targets]);
  const wires = nodes.filter((item) => doneIds.includes(item.id)).map((item) => ({
    id: item.id,
    source: nodes.findIndex((entry) => entry.id === item.id),
    target: Math.max(0, orderedTargets.findIndex((entry) => entry.id === item.target_id)),
  }));
  return (
    <section className={`eg-topology-repair${result === 'wrong' ? ' is-shake' : ''}`} data-topology-repair-arcade data-stage={levelStep + 1}>
      <header><ol>{['识别设备', '修复链路', '运行验收'].map((label, index) => <li className={index <= levelStep ? 'is-active' : ''} key={label}><i>{index + 1}</i><span>{label}</span></li>)}</ol>{combo > 1 ? <strong>连续修复 x{combo}</strong> : <small>选择左侧现场对象，再接入右侧正确端口</small>}</header>
      <div className="eg-topology-stage">
        <TopologyRepairCanvas />
        <svg aria-hidden="true" className="eg-topology-wires" preserveAspectRatio="none" viewBox="0 0 100 100">{wires.map((wire) => { const y1 = ((wire.source + .5) / Math.max(1, nodes.length)) * 100; const y2 = ((wire.target + .5) / Math.max(1, orderedTargets.length)) * 100; return <path d={`M28 ${y1} C43 ${y1},57 ${y2},72 ${y2}`} key={wire.id} vectorEffect="non-scaling-stroke" />; })}</svg>
        <div className="eg-topology-col is-device">{nodes.map((item) => { const done = doneIds.includes(item.id); return <button className={`${selected?.id === item.id ? 'is-selected' : ''}${done ? ' is-done' : ''}`} data-edugame-correct={item.correct !== false ? 'true' : 'false'} data-edugame-item={item.id} data-edugame-target-id={item.target_id ?? ''} disabled={!active || done} key={item.id} onClick={() => onSelect(item)} type="button"><span>{item.correct === false ? '风险项' : '现场对象'}</span><strong>{item.label}</strong><i /></button>; })}</div>
        <div className="eg-topology-col is-port">{orderedTargets.map((target) => <button className={selected?.target_id === target.id ? 'is-match' : ''} data-edugame-correct={selected ? selected.correct !== false && selected.target_id === target.id : false} data-edugame-target={target.id} disabled={!active || !selected} key={target.id} onClick={() => onDrop(target.id)} type="button"><i /><strong>{target.label}</strong><span>证据端口</span></button>)}</div>
        <div className="eg-topology-core"><span>机房数字孪生</span><strong>BBU 02 · 槽位 3</strong><i /><i /><i /><em>LINK ACTIVE</em></div>
      </div>
      <style>{styles}</style>
    </section>
  );
}

function TopologyRepairCanvas() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let app: any; let destroyed = false;
    import('pixi.js').then(async (PIXI) => {
      if (!hostRef.current || destroyed) return;
      app = new PIXI.Application();
      await app.init({ width: 960, height: 540, background: '#041321', antialias: true, resolution: Math.min(window.devicePixelRatio || 1, 1.5) });
      if (!hostRef.current || destroyed) { app.destroy(true); return; }
      hostRef.current.innerHTML = ''; hostRef.current.appendChild(app.canvas);
      const grid = new PIXI.Graphics(); grid.rect(0, 0, 960, 540).fill(0x041321);
      for (let x = 0; x <= 960; x += 48) grid.moveTo(x, 0).lineTo(x, 540).stroke({ width: 1, color: 0x163a50, alpha: .5 });
      for (let y = 0; y <= 540; y += 48) grid.moveTo(0, y).lineTo(960, y).stroke({ width: 1, color: 0x163a50, alpha: .5 });
      [370, 480, 590].forEach((x) => { grid.roundRect(x, 98, 82, 342, 8).fill({ color: 0x0a2b40, alpha: .96 }).stroke({ width: 2, color: 0x2c637a }); for (let y = 122; y < 420; y += 38) grid.roundRect(x + 11, y, 60, 25, 3).fill(0x123c50).stroke({ width: 1, color: 0x2f7286 }); });
      app.stage.addChild(grid);
      const packets = new PIXI.Graphics(); app.stage.addChild(packets); let tick = 0;
      const animate = (ticker: any) => { tick += (ticker?.deltaTime ?? 1) * .012; packets.clear(); for (let i = 0; i < 9; i += 1) { const p = (tick + i / 9) % 1; packets.circle(260 + p * 440, 270 + Math.sin(p * Math.PI * 2) * 34, 4).fill({ color: i % 2 ? 0x22d3ee : 0x34d399, alpha: .9 }); } };
      animate({ deltaTime: 0 }); if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) app.ticker.add(animate);
    }).catch(() => { if (hostRef.current) hostRef.current.dataset.fallback = 'true'; });
    return () => { destroyed = true; app?.destroy(true, { children: true }); };
  }, []);
  return <div aria-hidden="true" className="eg-pixi-canvas eg-topology-canvas" ref={hostRef} />;
}

const styles = `
.eg-topology-repair{display:grid;gap:9px;color:#e6f6ff}.eg-topology-repair>header{display:flex;align-items:center;justify-content:space-between;gap:14px}.eg-topology-repair ol{display:flex;gap:8px;margin:0;padding:0;list-style:none}.eg-topology-repair li{display:flex;align-items:center;gap:6px;color:#6f8fa3;font-size:11px;font-weight:850}.eg-topology-repair li i{width:22px;height:22px;display:grid;place-items:center;border:1px solid #31576d;border-radius:50%;font-style:normal}.eg-topology-repair li.is-active{color:#dffcff}.eg-topology-repair li.is-active i{border-color:#2dd4bf;color:#062532;background:#4ff2d0}.eg-topology-repair header strong{color:#f6c65d;font-size:11px}.eg-topology-repair header small{color:#7898aa;font-size:10px}.eg-topology-stage{position:relative;height:400px;overflow:hidden;border:1px solid #214b63;border-radius:7px;background:#041321}.eg-topology-canvas,.eg-topology-canvas canvas{position:absolute!important;inset:0;width:100%!important;height:100%!important;object-fit:cover}.eg-topology-wires{position:absolute;z-index:3;inset:0;width:100%;height:100%;pointer-events:none}.eg-topology-wires path{fill:none;stroke:#34d399;stroke-width:3;filter:drop-shadow(0 0 4px #34d39999)}.eg-topology-col{position:absolute;z-index:4;top:14px;bottom:14px;width:28%;display:grid;grid-auto-rows:1fr;gap:7px}.eg-topology-col.is-device{left:0}.eg-topology-col.is-port{right:0}.eg-topology-col button{position:relative;min-height:0;display:grid;align-content:center;gap:2px;border:1px solid #31566d;padding:7px 12px;color:#dff5ff;background:#071f31e8;text-align:left}.eg-topology-col.is-device button{border-radius:0 6px 6px 0}.eg-topology-col.is-port button{border-radius:6px 0 0 6px}.eg-topology-col button span{color:#5fbec0;font-size:8px}.eg-topology-col button strong{font-size:10px}.eg-topology-col button>i{position:absolute;top:50%;width:9px;height:9px;border:2px solid #041321;border-radius:50%;background:#38bdf8;box-shadow:0 0 0 1px #38bdf8;transform:translateY(-50%)}.eg-topology-col.is-device button>i{right:-5px}.eg-topology-col.is-port button>i{left:-5px}.eg-topology-col button.is-selected,.eg-topology-col button.is-match{border-color:#fde047;box-shadow:0 0 18px #fde04733}.eg-topology-col button.is-done{opacity:.35}.eg-topology-core{position:absolute;z-index:2;left:34%;right:34%;top:29%;bottom:29%;display:grid;place-items:center;align-content:center;gap:5px;border:1px solid #31748a;border-radius:8px;color:#dffcff;background:#071e31d9;box-shadow:0 0 35px #22d3ee26}.eg-topology-core span{color:#6fb4c8;font-size:9px}.eg-topology-core strong{font-size:13px}.eg-topology-core>i{width:76%;height:4px;border-radius:2px;background:linear-gradient(90deg,#22d3ee,#34d399);animation:egTopoSignal 1.5s ease-in-out infinite alternate}.eg-topology-core>em{color:#4ff2d0;font-size:8px;font-style:normal}@keyframes egTopoSignal{from{opacity:.35;transform:scaleX(.5)}to{opacity:1;transform:scaleX(1)}}.eg-topology-repair.is-shake{animation:egTopoShake .24s linear}@keyframes egTopoShake{25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
`;
