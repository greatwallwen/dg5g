import type { GameItem } from '@dgbook/edugame-core';
import { useEffect, useMemo, useRef } from 'react';
import { stableChallengeOrder } from './challenge-order';

type SurveyTarget = { id: string; label: string };

export function CoverageSurveyArcade({
  items,
  targets,
  selected,
  doneIds,
  combo,
  result,
  active,
  levelStep = 0,
  onSelect,
  onDrop,
}: {
  items: GameItem[];
  targets: SurveyTarget[];
  selected: GameItem | null;
  doneIds: string[];
  combo: number;
  result: 'idle' | 'correct' | 'wrong' | 'complete';
  active: boolean;
  levelStep?: number;
  onSelect: (item: GameItem) => void;
  onDrop: (targetId: string) => void;
}) {
  const orderedItems = useMemo(() => stableChallengeOrder(items, 'coverage-survey-item'), [items]);
  const targetPositions = [['8%', '12%'], ['48%', '10%'], ['18%', '39%'], ['57%', '38%'], ['7%', '67%'], ['48%', '68%']] as const;
  const phase = Math.min(3, levelStep + 1);
  return (
    <div className={`eg-coverage-survey${result === 'wrong' ? ' is-shake' : ''}`} data-survey-phase={phase}>
      <header className="eg-survey-steps" aria-label="外场取证阶段">
        {['校准姿态', '标注场景', '布置路线'].map((label, index) => <span className={phase >= index + 1 ? 'is-active' : ''} key={label}><b>{index + 1}</b>{label}</span>)}
        {combo > 1 ? <em>连续正确 x{combo}</em> : null}
      </header>
      <div className="eg-survey-stage">
        <CoverageSurveyCanvas />
        <div className="eg-survey-map-ui">
          <span className="eg-survey-site">5G站点<small>东南扇区</small></span>
          <span className="eg-survey-building">高层楼体<small>潜在遮挡</small></span>
          <span className="eg-survey-hotspot">商圈热点</span>
          <svg viewBox="0 0 720 360" aria-hidden="true"><path d="M98 282 C205 220 255 302 365 214 S535 104 642 152" /><circle cx="98" cy="282" r="7" /><circle cx="365" cy="214" r="7" /><circle cx="642" cy="152" r="7" /></svg>
          <div className="eg-survey-targets">
            {targets.map((target, index) => (
              <button
                className={selected?.target_id === target.id ? 'is-match' : ''}
                data-edugame-correct={selected ? selected.target_id === target.id : false}
                data-edugame-target={target.id}
                disabled={!active || !selected}
                key={target.id}
                onClick={() => onDrop(target.id)}
                style={{ left: targetPositions[index % targetPositions.length]?.[0], top: targetPositions[index % targetPositions.length]?.[1] }}
                type="button"
              >
                <i />{target.label}
              </button>
            ))}
          </div>
        </div>
        <aside className="eg-survey-evidence" aria-label="待布置的外场证据">
          <strong>现场证据</strong>
          <small>先选材料，再点地图中的对应证据门</small>
          <div>
            {orderedItems.map((item) => {
              const done = doneIds.includes(item.id);
              return <button className={`${selected?.id === item.id ? 'is-selected' : ''}${done ? ' is-done' : ''}`} data-edugame-correct={item.correct !== false ? 'true' : 'false'} data-edugame-item={item.id} data-edugame-target-id={item.target_id ?? ''} disabled={!active || done} key={item.id} onClick={() => onSelect(item)} type="button"><span>{done ? '已布置' : item.correct === false ? '风险' : '证据'}</span><strong>{item.label}</strong></button>;
            })}
          </div>
        </aside>
      </div>
      <style>{coverageSurveyStyles}</style>
    </div>
  );
}

function CoverageSurveyCanvas() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let app: any;
    let destroyed = false;
    import('pixi.js').then(async (PIXI) => {
      if (!hostRef.current || destroyed) return;
      hostRef.current.innerHTML = '';
      app = new PIXI.Application();
      await app.init({ width: 960, height: 540, background: '#061422', antialias: true, resolution: Math.min(window.devicePixelRatio || 1, 1.5) });
      if (!hostRef.current || destroyed) { app.destroy(true); return; }
      hostRef.current.appendChild(app.canvas);
      drawSurveyMap(PIXI, app);
    }).catch(() => { if (hostRef.current) hostRef.current.dataset.fallback = 'true'; });
    return () => { destroyed = true; app?.destroy(true, { children: true }); };
  }, []);
  return <div className="eg-pixi-canvas eg-survey-canvas" ref={hostRef} aria-hidden="true" />;
}

function drawSurveyMap(PIXI: any, app: any) {
  const layer = new PIXI.Graphics();
  layer.rect(0, 0, 960, 540).fill(0x061422);
  for (let x = 0; x < 960; x += 48) layer.moveTo(x, 0).lineTo(x, 540).stroke({ width: 1, color: 0x16364b, alpha: .42 });
  for (let y = 0; y < 540; y += 48) layer.moveTo(0, y).lineTo(960, y).stroke({ width: 1, color: 0x16364b, alpha: .42 });
  layer.poly([70, 500, 290, 318, 470, 390, 820, 120, 930, 180]).stroke({ width: 34, color: 0x102f42, alpha: .9 });
  layer.poly([70, 500, 290, 318, 470, 390, 820, 120, 930, 180]).stroke({ width: 2, color: 0x5a7890, alpha: .75 });
  layer.rect(485, 80, 165, 165).fill({ color: 0x173247, alpha: .95 }).stroke({ width: 2, color: 0xf59e0b, alpha: .75 });
  layer.circle(175, 380, 14).fill(0x22d3ee);
  layer.poly([175, 380, 690, 110, 700, 260]).fill({ color: 0x7c5cff, alpha: .14 }).stroke({ width: 2, color: 0x8b7cff, alpha: .72 });
  app.stage.addChild(layer);
  const signal = new PIXI.Graphics();
  app.stage.addChild(signal);
  let tick = 0;
  const renderSignal = (ticker: any) => {
    tick += (ticker?.deltaTime ?? 1) * .035;
    signal.clear();
    const count = 7;
    for (let i = 0; i < count; i += 1) {
      const progress = ((tick + i / count) % 1);
      const x = 175 + progress * 525;
      const y = 380 - progress * 180 + Math.sin(progress * Math.PI) * 24;
      signal.circle(x, y, 3 + (i % 2)).fill({ color: 0x67e8f9, alpha: .8 });
    }
  };
  renderSignal({ deltaTime: 0 });
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) app.ticker.add(renderSignal);
}

const coverageSurveyStyles = `
.eg-coverage-survey{position:relative;color:#e7f4ff}.eg-survey-steps{display:flex;align-items:center;gap:10px;margin-bottom:10px}.eg-survey-steps span{display:flex;align-items:center;gap:7px;color:#7992a8;font-size:12px}.eg-survey-steps span b{display:grid;place-items:center;width:23px;height:23px;border:1px solid #35536b;border-radius:50%}.eg-survey-steps span.is-active{color:#dffbff}.eg-survey-steps span.is-active b{border-color:#34d6d0;background:#123f4a;color:#72fff4}.eg-survey-steps em{margin-left:auto;color:#f7c45b;font-style:normal}.eg-survey-stage{position:relative;min-height:390px;overflow:hidden;border:1px solid #21445f;border-radius:6px;background:#061422}.eg-coverage-survey .eg-survey-stage>.eg-survey-canvas{position:absolute!important;inset:0;width:100%;height:100%!important}.eg-coverage-survey .eg-survey-canvas canvas{position:absolute;inset:0;width:100%;height:100%!important;object-fit:cover}.eg-survey-map-ui{position:absolute;inset:0 240px 0 0}.eg-survey-map-ui>span{position:absolute;z-index:2;border:1px solid #3a647e;background:#0a2336e8;padding:7px 10px;border-radius:4px;font-size:11px;font-weight:700}.eg-survey-map-ui>span small{display:block;color:#88a9be;font-weight:500}.eg-survey-site{left:12%;bottom:15%}.eg-survey-building{left:55%;top:15%;border-color:#d68f32!important}.eg-survey-hotspot{right:6%;top:24%;color:#ffe7a2}.eg-survey-map-ui>svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}.eg-survey-map-ui>svg path{fill:none;stroke:#50f1c9;stroke-width:3;stroke-dasharray:8 7}.eg-survey-map-ui>svg circle{fill:#071a29;stroke:#8effdf;stroke-width:3}.eg-survey-targets button{position:absolute;z-index:3;max-width:145px;border:1px solid #335b73;background:#08243ad9;color:#c5deec;padding:6px 8px;border-radius:4px;font-size:10px;text-align:left}.eg-survey-targets button i{display:inline-block;width:7px;height:7px;margin-right:6px;border-radius:50%;background:#46d6e6}.eg-survey-targets button:not(:disabled):hover,.eg-survey-targets button.is-match{border-color:#5bf1d4;color:#fff;box-shadow:0 0 16px #2dd4bf55}.eg-survey-evidence{position:absolute;z-index:4;top:0;right:0;bottom:0;width:240px;padding:14px;background:#071827ed;border-left:1px solid #25445b}.eg-survey-evidence>strong,.eg-survey-evidence>small{display:block}.eg-survey-evidence>small{margin:4px 0 10px;color:#7895aa;font-size:10px}.eg-survey-evidence>div{display:grid;gap:6px;max-height:315px;overflow:auto}.eg-survey-evidence button{display:grid;grid-template-columns:42px 1fr;align-items:center;gap:7px;min-height:43px;border:1px solid #26475d;background:#0a2234;color:#d9edf7;padding:6px;text-align:left;border-radius:4px}.eg-survey-evidence button span{font-size:9px;color:#42d7d1}.eg-survey-evidence button strong{font-size:11px}.eg-survey-evidence button.is-selected{border-color:#7c68ff;box-shadow:0 0 0 1px #7c68ff}.eg-survey-evidence button.is-done{opacity:.42}.eg-coverage-survey.is-shake{animation:egSurveyShake .24s linear}@keyframes egSurveyShake{25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}@media(max-width:760px){.eg-survey-stage{min-height:520px}.eg-survey-map-ui{inset:0 0 210px}.eg-survey-evidence{top:auto;left:0;width:auto;height:210px;border-left:0;border-top:1px solid #25445b}.eg-survey-evidence>div{grid-template-columns:1fr 1fr;max-height:145px}.eg-survey-targets button{max-width:112px;font-size:9px}}
`;
