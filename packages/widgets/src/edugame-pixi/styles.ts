// Extracted edugame styles (kept out of the component to keep it lean).
export const styles = `
.dg-edugame-pixi{display:grid;gap:10px;padding:12px;border:1px solid rgba(14,116,144,.22);border-radius:14px;background:#f8fbff;color:#0f172a}
.eg-topbar{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:18px;align-items:center}
.eg-title-copy{min-width:0}.eg-eyebrow{color:#0891b2;font-size:12px;font-weight:900}.eg-topbar h3{margin:4px 0;font-size:24px;line-height:1.15}.eg-topbar p{margin:0;color:#475569;font-size:13px}
.eg-stats{display:grid;grid-template-columns:repeat(4,72px) repeat(3,86px);gap:6px}.eg-stat,.eg-stats button{min-height:48px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;padding:6px 8px}.eg-stats button{font-weight:900;cursor:pointer;background:#083344;color:#ecfeff;border-color:#155e75}.eg-stat span{display:block;color:#64748b;font-size:11px}.eg-stat strong{font-size:18px}
.eg-mission{display:grid;grid-template-columns:minmax(320px,1fr) 150px;align-items:center;gap:10px;padding:10px 12px;border:1px solid rgba(14,165,233,.18);border-radius:12px;background:linear-gradient(135deg,#ecfeff,#fff)}
.eg-mission span{display:block;color:#0e7490;font-size:12px;font-weight:900}.eg-mission strong{display:block;margin-top:2px;font-size:17px}.eg-mission p{margin:4px 0 0;color:#475569;font-size:13px}
.eg-mission-meter{height:8px;border-radius:999px;background:#dbeafe;overflow:hidden}.eg-mission-meter i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#0891b2,#22c55e)}
.eg-reward-meter{display:grid;gap:5px;align-self:center}.eg-reward-meter span{color:#0f766e;font-size:12px;font-weight:900}.eg-reward-meter i{display:block;height:8px;border-radius:999px;background:#cffafe;overflow:hidden}.eg-reward-meter b{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#22d3ee,#fde047,#fb923c);box-shadow:0 0 18px rgba(251,146,60,.28)}
.eg-pressure-meter{grid-column:2;display:grid;gap:5px}.eg-pressure-meter span{color:#9a3412;font-size:12px;font-weight:900}.eg-pressure-meter i{display:grid;grid-template-columns:repeat(auto-fit,minmax(10px,1fr));gap:4px}.eg-pressure-meter b{height:8px;border-radius:999px;background:#cbd5e1}.eg-pressure-meter .is-live{background:linear-gradient(90deg,#22c55e,#fde047);box-shadow:0 0 12px rgba(34,197,94,.24)}.eg-pressure-meter .is-lost{background:#fecaca}
.eg-pressure-meter[data-edugame-pressure-meter="danger"] .is-live{background:#ef4444;animation:eg-pressure-pulse .72s ease-in-out infinite alternate}.eg-pressure-meter[data-edugame-pressure-meter="watch"] .is-live{background:#f59e0b}
.eg-badge-track{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;list-style:none;margin:0;padding:0}.eg-badge-track li,.eg-review-badges li{display:flex;align-items:center;gap:7px;min-height:34px;border:1px solid rgba(14,165,233,.22);border-radius:999px;background:rgba(255,255,255,.72);padding:5px 9px;color:#155e75;font-size:12px;font-weight:900}.eg-badge-track span,.eg-review-badges span{display:grid;place-items:center;width:21px;height:21px;border-radius:999px;background:#cbd5e1;color:#0f172a;font-size:11px}.eg-badge-track [data-edugame-badge-state="unlocked"],.eg-review-badges [data-edugame-badge-state="unlocked"]{border-color:rgba(250,204,21,.55);background:linear-gradient(135deg,#fffbeb,#ecfeff);color:#92400e}.eg-badge-track [data-edugame-badge-state="unlocked"] span,.eg-review-badges [data-edugame-badge-state="unlocked"] span{background:#facc15;color:#422006;box-shadow:0 0 12px rgba(250,204,21,.28)}
.eg-stage-milestones{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;list-style:none;margin:0;padding:0}.eg-stage-milestones li{display:flex;align-items:center;gap:8px;min-height:36px;padding:6px 10px;border:1px solid rgba(125,211,252,.28);border-radius:12px;background:linear-gradient(135deg,rgba(255,255,255,.86),rgba(236,254,255,.78));color:#155e75;font-size:12px;font-weight:900}.eg-stage-milestones span{display:grid;place-items:center;min-width:34px;height:22px;border-radius:999px;background:#dbeafe;color:#0f172a;font-size:11px}.eg-stage-milestones [data-edugame-stage-state="active"]{border-color:#22d3ee;box-shadow:0 0 0 2px rgba(34,211,238,.14),0 10px 22px rgba(14,165,233,.12);animation:eg-stage-pulse 1.2s ease-in-out infinite alternate}.eg-stage-milestones [data-edugame-stage-state="done"]{border-color:rgba(34,197,94,.5);background:linear-gradient(135deg,#ecfdf5,#ecfeff)}.eg-stage-milestones [data-edugame-stage-state="done"] span{background:#22c55e;color:#ecfdf5}.eg-stage-milestones [data-edugame-stage-state="danger"]{border-color:rgba(239,68,68,.5);background:#fff1f2;color:#9f1239}
@keyframes eg-stage-pulse{from{filter:brightness(1)}to{filter:brightness(1.08);transform:translateY(-1px)}}
.eg-guide-steps{grid-column:1/-1;list-style:none;margin:0;padding:0;display:flex;gap:6px;align-items:center;justify-content:flex-start;flex-wrap:nowrap;overflow:hidden}.eg-guide-steps li{border-radius:999px;background:#dff7ff;color:#155e75;padding:6px 9px;font-size:12px;font-weight:900;white-space:nowrap}
.eg-kp-tags{display:none}
.eg-layout{display:grid;grid-template-columns:minmax(560px,1fr) minmax(330px,.42fr);gap:14px}.eg-pixi-canvas canvas{width:100%;height:auto;border-radius:18px;box-shadow:0 18px 44px rgba(15,23,42,.24)}
.eg-panel{display:grid;gap:12px;align-content:start}.eg-guide{display:flex;flex-wrap:wrap;gap:8px;padding:12px;border:1px solid #bae6fd;border-radius:12px;background:#ecfeff}.eg-guide strong{width:100%;color:#0e7490}.eg-guide span{border-radius:999px;background:#fff;padding:7px 10px;color:#155e75;font-size:13px}
.eg-card-grid,.eg-memory{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.eg-card-grid button,.eg-memory button,.eg-quiz button,.eg-drag button{min-height:54px;border:1px solid #bae6fd;border-radius:12px;background:#fff;font-weight:800;color:#0f172a}.eg-card-grid button:hover,.eg-quiz button:hover,.eg-drag button:hover{border-color:#0891b2;box-shadow:0 10px 24px rgba(8,145,178,.16)}
.eg-quiz,.eg-drag{display:grid;gap:10px}.eg-quiz strong{padding:12px;border-radius:12px;background:#e0f2fe}.eg-drag{grid-template-columns:1fr 1fr}.eg-drag>div{display:grid;gap:8px}.eg-drag .active{background:#cffafe;border-color:#0891b2}
.eg-feedback{display:flex;align-items:center;gap:10px;min-height:54px;border:1px solid #cbd5e1;border-radius:12px;background:#fff;padding:10px 14px}.eg-feedback strong{color:#0891b2;white-space:nowrap}.eg-feedback span{flex:1;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.eg-feedback small{color:#64748b;white-space:nowrap}
.eg-reward-toast{position:absolute;right:24px;bottom:86px;z-index:23;display:grid;gap:2px;padding:10px 14px;border:1px solid rgba(253,224,71,.7);border-radius:16px;background:linear-gradient(135deg,rgba(253,224,71,.94),rgba(251,146,60,.92));color:#3b2404;font-size:20px;font-weight:900;box-shadow:0 18px 42px rgba(251,146,60,.28);animation:eg-pop-rise .62s ease both;pointer-events:none}.eg-reward-toast small{font-size:12px;font-weight:900;color:#7c2d12}
.eg-score-moment{position:absolute;left:50%;top:42%;z-index:26;transform:translate(-50%,-50%);display:grid;place-items:center;gap:2px;min-width:132px;padding:12px 18px;border-radius:18px;border:1px solid rgba(125,211,252,.55);background:linear-gradient(135deg,rgba(6,28,44,.94),rgba(8,47,73,.9));color:#ecfeff;box-shadow:0 22px 54px rgba(2,6,23,.32),0 0 28px rgba(34,211,238,.18);animation:eg-score-burst 1.18s ease both;pointer-events:none}.eg-score-moment strong{font-size:30px;line-height:1;font-weight:950;letter-spacing:0}.eg-score-moment span{font-size:12px;font-weight:900;color:#bae6fd}.eg-score-moment.is-correct strong,.eg-score-moment.is-finish strong{color:#86efac}.eg-score-moment.is-wrong strong{color:#fecaca}.eg-score-moment.is-level strong{color:#fde68a}
.eg-action-feedback{position:absolute;left:50%;top:58%;z-index:25;transform:translate(-50%,-50%);display:grid;place-items:center;gap:2px;width:148px;height:148px;border-radius:50%;color:#eaffff;pointer-events:none;animation:eg-action-pop .88s ease both}.eg-action-feedback i{position:absolute;inset:8px;border-radius:50%;border:2px solid rgba(125,211,252,.7);box-shadow:0 0 34px rgba(34,211,238,.24);animation:eg-action-ring .88s ease-out both}.eg-action-feedback i:nth-child(2){inset:22px;animation-delay:.08s}.eg-action-feedback strong{z-index:1;font-size:26px;font-weight:950;text-shadow:0 2px 12px rgba(2,6,23,.48)}.eg-action-feedback span{z-index:1;font-size:12px;font-weight:900;color:#bae6fd}.eg-action-feedback.is-correct i{border-color:rgba(52,211,153,.78);box-shadow:0 0 34px rgba(52,211,153,.28)}.eg-action-feedback.is-wrong i{border-color:rgba(248,113,113,.78);box-shadow:0 0 34px rgba(248,113,113,.28)}.eg-action-feedback.is-complete i{border-color:rgba(253,224,71,.8);box-shadow:0 0 34px rgba(253,224,71,.28)}
.eg-placeholder{padding:24px}
.eg-start-panel{position:absolute;left:50%;top:50%;z-index:20;transform:translate(-50%,-50%);width:min(460px,calc(100% - 48px));display:grid;gap:10px;padding:18px;border:1px solid rgba(125,211,252,.55);border-radius:18px;background:linear-gradient(180deg,rgba(7,29,44,.96),rgba(4,16,31,.96));color:#eaffff;box-shadow:0 24px 60px rgba(2,6,23,.45);text-align:center}
.eg-start-panel span{font-size:12px;color:#7dd3fc;font-weight:900;letter-spacing:.12em}.eg-start-panel strong{font-size:22px}.eg-start-panel p{margin:0;color:#cbe9ff}.eg-start-panel button{justify-self:center;min-height:46px;padding:0 24px;border:0;border-radius:999px;background:#06b6d4;color:#04101f;font-weight:900;cursor:pointer;box-shadow:0 12px 28px rgba(6,182,212,.28)}
.eg-start-panel button:hover{background:#22d3ee}
.eg-review{position:absolute;left:18px;right:18px;top:112px;bottom:18px;z-index:32;display:grid;gap:12px;overflow:auto;border:1px solid #bae6fd;border-radius:14px;background:linear-gradient(180deg,rgba(255,255,255,.98),rgba(248,251,255,.98));padding:16px;box-shadow:0 28px 72px rgba(2,6,23,.24)}
.eg-review[data-edugame-phase="failed"]{border-color:#fca5a5;background:linear-gradient(180deg,#fff7f7,#fff)}
.eg-review-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
.eg-review-kicker{display:block;margin-bottom:4px;color:#0891b2;font-size:12px;font-weight:900;letter-spacing:.08em}
.eg-review-head strong{display:block;font-size:20px;line-height:1.25;color:#0e7490}
.eg-review-head p{margin:6px 0 0;max-width:56ch;color:#475569;font-size:13px;line-height:1.55}
.eg-review[data-edugame-phase="failed"] .eg-review-head strong{color:#dc2626}
.eg-review-score{text-align:right;min-width:124px}.eg-review-num{font-size:36px;font-weight:900;line-height:1}.eg-review-stars{display:block;color:#f59e0b;font-size:18px;letter-spacing:1px}.eg-review-score small{display:block;color:#64748b}
.eg-review-badges{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.eg-review-awards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.eg-review-awards div{min-height:68px;padding:9px 10px;border:1px solid rgba(14,165,233,.26);border-radius:12px;background:linear-gradient(135deg,#ecfeff,#fff7ed);box-shadow:inset 0 0 18px rgba(255,255,255,.42)}.eg-review-awards span{display:block;color:#0e7490;font-size:12px;font-weight:900}.eg-review-awards strong{display:block;margin-top:2px;color:#0f172a;font-size:18px;line-height:1.2}.eg-review-awards small{display:block;margin-top:3px;color:#64748b;font-size:12px;font-weight:800}
.eg-drill-route{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.eg-drill-route li{display:flex;align-items:center;gap:8px;min-height:44px;padding:8px 10px;border:1px solid rgba(20,184,166,.26);border-radius:12px;background:linear-gradient(135deg,#f0fdfa,#f8fafc)}.eg-drill-route span{display:grid;place-items:center;width:24px;height:24px;border-radius:999px;background:#0e7490;color:#ecfeff;font-size:12px;font-weight:900}.eg-drill-route strong{color:#0f172a;font-size:13px}
.eg-review-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:0}
.eg-review-metrics div{min-height:54px;border:1px solid #dbeafe;border-radius:10px;background:#f8fafc;padding:8px 10px}
.eg-review-metrics dt{color:#64748b;font-size:12px;font-weight:800}.eg-review-metrics dd{margin:2px 0 0;color:#0f172a;font-size:18px;font-weight:900}
.eg-review-block h4{margin:0 0 6px;font-size:14px;color:#334155}
.eg-review-list{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.eg-review-list li{display:flex;justify-content:space-between;gap:10px;padding:8px 10px;border-radius:8px;background:#f1f5f9}
.eg-review-list span{color:#475569;text-align:right}
.eg-review-answer-list{grid-template-columns:repeat(2,minmax(0,1fr))}
.eg-review-answer-list li{align-items:center;border:1px solid rgba(14,165,233,.18);background:linear-gradient(135deg,#ecfeff,#f8fafc)}
.eg-review-answer-list strong{color:#0e7490}.eg-review-answer-list span{font-weight:800;color:#0f172a}
.eg-review-error-list li{align-items:center;border:1px solid rgba(248,113,113,.24);background:linear-gradient(135deg,#fff1f2,#fff7ed)}
.eg-review-error-list strong{color:#be123c}.eg-review-error-list span{font-weight:800;color:#7f1d1d}
.eg-review-empty{color:#16a34a;margin:0}.eg-review-summary{color:#64748b;display:block;margin-top:6px}
.eg-review-foot{display:flex;justify-content:space-between;align-items:center;gap:10px}
.eg-review-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.eg-retry{min-height:46px;padding:0 18px;border:none;border-radius:10px;background:#0891b2;color:#fff;font-weight:900;cursor:pointer}
.eg-retry:hover{background:#0e7490}
.eg-drill{min-height:46px;padding:0 18px;border:1px solid #fed7aa;border-radius:10px;background:#fff7ed;color:#9a3412;font-weight:900;cursor:pointer}
.eg-drill:hover{background:#ffedd5;border-color:#fdba74}
.eg-layout-arcade{grid-template-columns:1fr}
.eg-arcade{display:grid;gap:12px}
.eg-arcade-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;padding:9px 12px;border:1px solid #bae6fd;border-radius:12px;background:#ecfeff}
.eg-arcade-bar strong{color:#0e7490}.eg-arcade-bar span{font-weight:800;color:#155e75}.eg-arcade-bar em{color:#0891b2;font-style:normal;font-size:13px;flex:1 1 420px}
.eg-arcade-combo{margin-left:auto;border-radius:999px;background:#0891b2;color:#fff!important;padding:5px 12px;animation:eg-pop-rise 0s, eg-combo .4s ease}
@keyframes eg-combo{from{transform:scale(.6)}to{transform:scale(1)}}
.eg-boss{position:relative;display:grid;gap:10px}.eg-boss-hud{display:grid;grid-template-columns:auto minmax(180px,1fr) auto auto auto;align-items:center;gap:10px;padding:9px 12px;border:1px solid rgba(251,146,60,.42);border-radius:14px;background:linear-gradient(135deg,rgba(69,26,3,.9),rgba(6,28,44,.88));color:#fff7ed}.eg-boss-name{display:grid;gap:1px}.eg-boss-name span{font-size:11px;font-weight:900;color:#fed7aa;letter-spacing:.08em}.eg-boss-name strong{font-size:15px;color:#fffbeb}.eg-boss-hp{height:12px;border-radius:999px;background:rgba(15,23,42,.62);overflow:hidden;box-shadow:inset 0 0 0 1px rgba(251,146,60,.28)}.eg-boss-hp i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#22d3ee,#fde047,#ef4444);box-shadow:0 0 22px rgba(251,146,60,.34);transition:width .28s ease}.eg-boss-hud ol{display:flex;gap:6px;list-style:none;margin:0;padding:0}.eg-boss-hud li{display:grid;grid-template-columns:auto auto;place-items:center;align-items:center;gap:4px;width:auto;min-width:58px;height:28px;padding:0 8px;border-radius:999px;background:rgba(148,163,184,.24);color:#cbd5e1;font-size:11px;font-weight:950}.eg-boss-hud li span{display:grid;place-items:center;width:18px;height:18px;border-radius:999px;background:rgba(255,255,255,.16)}.eg-boss-hud [data-edugame-boss-phase="done"]{background:#22c55e;color:#ecfdf5}.eg-boss-hud [data-edugame-boss-phase="active"]{background:#fde047;color:#422006;box-shadow:0 0 14px rgba(253,224,71,.32);animation:eg-combo .42s ease}.eg-boss-hud em{font-style:normal;font-size:12px;font-weight:900;color:#fed7aa}.eg-boss-wave-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:8px;padding:9px 12px;border:1px solid rgba(125,211,252,.35);border-radius:12px;background:linear-gradient(135deg,rgba(6,28,44,.84),rgba(8,47,73,.74));color:#eaffff}.eg-boss-wave-card strong{color:#fde047}.eg-boss-wave-card span{color:#cbe9ff;font-size:12px;font-weight:900;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.eg-boss-wave-card i{font-style:normal;color:#a7f3d0;font-weight:950}.eg-boss-counter,.eg-boss-break{position:absolute;right:18px;top:114px;z-index:8;padding:9px 14px;border-radius:16px;font-weight:950;pointer-events:none;animation:eg-score-burst .8s ease both}.eg-boss-counter{border:1px solid rgba(248,113,113,.72);background:rgba(69,10,10,.88);color:#fecaca;box-shadow:0 0 34px rgba(248,113,113,.3)}.eg-boss-break{border:1px solid rgba(52,211,153,.72);background:rgba(6,78,59,.88);color:#d1fae5;box-shadow:0 0 34px rgba(52,211,153,.3)}.eg-boss[data-edugame-boss-pressure="counter"] .eg-boss-hp i{animation:eg-pressure-pulse .68s ease-in-out infinite alternate}
.eg-stage-wrap{position:relative;border-radius:18px;overflow:hidden;background:#04101f;box-shadow:0 18px 44px rgba(15,23,42,.24)}
.eg-stage-wrap canvas{display:block;width:100%;height:auto}
.eg-stage-wrap.is-shake{animation:eg-shake .32s cubic-bezier(.36,.07,.19,.97)}
@keyframes eg-shake{10%,90%{transform:translateX(-2px)}20%,80%{transform:translateX(4px)}30%,50%,70%{transform:translateX(-7px)}40%,60%{transform:translateX(7px)}}
.eg-stage-wrap[data-edugame-result="wrong"]::after{content:"";position:absolute;inset:0;background:rgba(239,68,68,.16);pointer-events:none;animation:eg-flash .35s ease}
@keyframes eg-flash{from{opacity:1}to{opacity:0}}
.eg-field{position:absolute;inset:0;pointer-events:none}
.eg-field-hint{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);color:#7dd3fc;font-weight:800;letter-spacing:.04em;opacity:.7}
.eg-chip{--chip-hue:184;position:absolute;transform:translate(-50%,-50%);pointer-events:auto;display:grid;place-items:center;min-width:96px;max-width:168px;min-height:58px;padding:8px 12px;border:2px solid hsl(var(--chip-hue) 88% 58% / .78);border-radius:14px;background:radial-gradient(circle at 50% 18%,hsl(var(--chip-hue) 88% 64% / .22),transparent 34%),linear-gradient(180deg,rgba(8,47,73,.94),rgba(2,28,46,.96));color:#eaffff;font-weight:800;font-size:14px;cursor:pointer;box-shadow:0 10px 26px rgba(2,28,46,.5),0 0 18px 3px hsl(var(--chip-hue) 88% 58% / .26);animation:eg-chip-in .18s ease-out,eg-chip-glow 1.8s ease-in-out .2s infinite alternate}
.eg-chip:hover{border-color:#7dd3fc}
.eg-chip:focus-visible{outline:3px solid #fde047;outline-offset:2px}
.eg-chip-label{position:relative;z-index:2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-align:center}
.eg-chip-ring{position:absolute;inset:-6px;border:2px solid rgba(125,211,252,.85);border-radius:18px;box-shadow:0 0 18px rgba(56,189,248,.36);animation:eg-ring var(--ttl,2400ms) linear forwards;pointer-events:none}
@keyframes eg-chip-in{from{opacity:0}to{opacity:1}}
@keyframes eg-chip-drift{from{transform:translate(-50%,-50%)}to{transform:translate(calc(-50% + var(--chip-dx,4px)),calc(-50% + var(--chip-dy,-3px)))}}
@keyframes eg-chip-glow{from{box-shadow:0 10px 26px rgba(2,28,46,.5),0 0 0 0 rgba(56,189,248,.45)}to{box-shadow:0 10px 26px rgba(2,28,46,.5),0 0 22px 5px rgba(56,189,248,.35)}}
@keyframes eg-ring{0%{transform:scale(1.35);opacity:.2}15%{opacity:.85}100%{transform:scale(.46);opacity:0}}
.eg-pop{position:absolute;transform:translate(-50%,-50%);pointer-events:none;font-weight:900;font-size:18px;text-shadow:0 2px 6px rgba(0,0,0,.4);animation:eg-pop-rise .76s ease-out forwards;z-index:5}
.eg-pop-correct{color:#34d399}.eg-pop-wrong{color:#f87171}
@keyframes eg-pop-rise{0%{transform:translate(-50%,-50%) scale(.7);opacity:0}20%{transform:translate(-50%,-90%) scale(1.1);opacity:1}100%{transform:translate(-50%,-170%) scale(1);opacity:0}}
@keyframes eg-score-burst{0%{opacity:0;transform:translate(-50%,-38%) scale(.72)}18%{opacity:1;transform:translate(-50%,-50%) scale(1.06)}72%{opacity:1;transform:translate(-50%,-58%) scale(1)}100%{opacity:0;transform:translate(-50%,-70%) scale(.96)}}
@keyframes eg-action-ring{0%{opacity:0;transform:scale(.62)}22%{opacity:1}100%{opacity:0;transform:scale(1.24)}}@keyframes eg-action-pop{0%{opacity:0;filter:blur(2px)}18%,72%{opacity:1;filter:blur(0)}100%{opacity:0;filter:blur(1px)}}
@keyframes eg-pressure-pulse{from{filter:brightness(1)}to{filter:brightness(1.42);box-shadow:0 0 16px rgba(239,68,68,.36)}}
@keyframes eg-audio-bounce{0%,100%{transform:scaleY(.55)}50%{transform:scaleY(1.18)}}
@media (prefers-reduced-motion:reduce){.eg-chip,.eg-chip-ring,.eg-pop,.eg-score-moment,.eg-action-feedback,.eg-action-feedback i,.eg-boss-counter,.eg-boss-break,.eg-boss[data-edugame-boss-pressure="counter"] .eg-boss-hp i,.eg-pressure-meter .is-live,.eg-stage-wrap.is-shake{animation-duration:.01ms!important}}
.eg-gaterush{display:grid;gap:12px}
.eg-gr-lives{border-radius:999px;background:#0f766e;color:#ecfeff!important;padding:5px 10px;font-size:13px;font-weight:900}
.eg-gr-clear{border-radius:999px;background:#fff;padding:5px 12px;color:#155e75;font-weight:800}
.eg-gr-hud{display:grid;grid-template-columns:auto minmax(160px,1fr) auto;align-items:center;gap:10px;padding:8px 12px;border:1px solid rgba(125,211,252,.35);border-radius:12px;background:linear-gradient(135deg,rgba(6,28,44,.88),rgba(8,47,73,.76));color:#eaffff}
.eg-gr-hud span{font-size:12px;font-weight:900;color:#7dd3fc}.eg-gr-hud i{display:block;height:8px;border-radius:999px;background:rgba(125,211,252,.18);overflow:hidden}.eg-gr-hud b{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#22d3ee,#fde047,#fb923c);box-shadow:0 0 18px rgba(34,211,238,.28);transition:width .25s ease}
.eg-gr-hud[data-edugame-quiz-pressure="danger"] b{background:#ef4444;animation:eg-pressure-pulse .72s ease-in-out infinite alternate}.eg-gr-hud ol{display:flex;gap:5px;list-style:none;margin:0;padding:0}.eg-gr-hud li{display:grid;place-items:center;width:24px;height:24px;border-radius:999px;background:rgba(148,163,184,.28);color:#cbd5e1;font-size:11px;font-weight:900}.eg-gr-hud [data-edugame-quiz-chain-step="hot"]{background:#fde047;color:#422006;box-shadow:0 0 14px rgba(253,224,71,.32);animation:eg-combo .42s ease}
.eg-gr-wrap{position:relative}
.eg-gr-overlay{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:space-between;padding:18px;pointer-events:none}
.eg-gr-overlay .eg-gr-gate{pointer-events:auto}
.eg-gr-signal{align-self:center;max-width:74%;text-align:center;padding:14px 20px;border-radius:16px;background:linear-gradient(180deg,rgba(8,47,73,.92),rgba(2,28,46,.92));border:2px solid #38bdf8;box-shadow:0 14px 36px rgba(2,28,46,.5);animation:eg-gr-incoming .4s ease}
.eg-gr-signal .eg-gr-tag{display:inline-block;font-size:11px;font-weight:900;color:#7dd3fc;letter-spacing:.12em}
.eg-gr-signal strong{display:block;font-size:26px;color:#eaffff;margin:4px 0}
.eg-gr-signal small{color:#cbe9ff;font-size:13px}
@keyframes eg-gr-incoming{from{transform:translateY(-26px) scale(.86);opacity:0}to{transform:translateY(0) scale(1);opacity:1}}
.eg-gr-gates{display:grid;grid-template-columns:repeat(auto-fit,minmax(126px,1fr));gap:12px}
.eg-gr-gate{display:grid;gap:4px;padding:14px 12px;border:2px solid rgba(125,211,252,.7);border-radius:14px;background:linear-gradient(180deg,rgba(15,52,70,.95),rgba(6,28,44,.96));color:#eaffff;cursor:pointer;text-align:center;transition:transform .12s,border-color .12s,box-shadow .12s}
.eg-gr-gate:not(:disabled){animation:eg-gate-idle 2.8s ease-in-out infinite alternate}
.eg-gr-gate:hover:not(:disabled){transform:translateY(-3px);border-color:#fde047;box-shadow:0 12px 26px rgba(56,189,248,.28)}
.eg-gr-gate:focus-visible{outline:3px solid #fde047;outline-offset:2px}
.eg-gr-gate:disabled{opacity:.6;cursor:default}
.eg-gr-gate-id{font-size:11px;font-weight:900;color:#7dd3fc;letter-spacing:.14em}
.eg-gr-gate-label{font-size:15px;font-weight:800}
.eg-gr-flash{align-self:center;font-size:22px;font-weight:900;min-height:26px;text-shadow:0 2px 8px rgba(0,0,0,.5)}
.eg-gr-flash-correct{color:#34d399;animation:eg-pop-rise .7s ease-out}
.eg-gr-flash-wrong{color:#f87171;animation:eg-pop-rise .7s ease-out}
.eg-gr-shock{position:absolute;left:50%;top:50%;z-index:8;transform:translate(-50%,-50%);padding:10px 16px;border:1px solid rgba(248,113,113,.65);border-radius:16px;background:rgba(69,10,10,.82);color:#fecaca;font-weight:950;box-shadow:0 0 34px rgba(248,113,113,.3);animation:eg-score-burst .8s ease both;pointer-events:none}
.eg-gr-explain{min-height:44px;display:flex;align-items:center;padding:10px 14px;border:1px solid #cbd5e1;border-radius:12px;background:#fff;color:#334155;font-size:14px}
@keyframes eg-gate-idle{from{filter:brightness(1);transform:translateY(0)}to{filter:brightness(1.08);transform:translateY(-2px)}}
@keyframes eg-pressure-pulse{from{filter:brightness(1);box-shadow:0 0 10px rgba(239,68,68,.28)}to{filter:brightness(1.45);box-shadow:0 0 22px rgba(239,68,68,.46)}}
@media (prefers-reduced-motion:reduce){.eg-gr-signal,.eg-gr-gate:not(:disabled),.eg-gr-flash-correct,.eg-gr-flash-wrong,.eg-gr-shock,.eg-gr-hud [data-edugame-quiz-chain-step="hot"],.eg-gr-hud[data-edugame-quiz-pressure="danger"] b{animation-duration:.01ms!important}}
.eg-memboard,.eg-assemble{display:grid;gap:12px}
.eg-mcards{position:absolute;inset:0;display:grid;gap:14px;padding:30px 46px;place-content:center;grid-template-columns:repeat(4,minmax(112px,1fr))}
.eg-mcards[data-count="6"],.eg-mcards[data-count="8"]{grid-template-columns:repeat(4,minmax(116px,1fr))}
.eg-mcards[data-count="14"],.eg-mcards[data-count="16"],.eg-mcards[data-count="18"]{grid-template-columns:repeat(6,minmax(82px,1fr));gap:10px;padding:24px 34px}
.eg-mcards[data-count="14"] .eg-mcard,.eg-mcards[data-count="16"] .eg-mcard,.eg-mcards[data-count="18"] .eg-mcard{height:84px}
.eg-mcards[data-count="14"] .eg-mcard-mark,.eg-mcards[data-count="16"] .eg-mcard-mark,.eg-mcards[data-count="18"] .eg-mcard-mark{font-size:22px}
.eg-mcards[data-count="14"] .eg-mcard-kind,.eg-mcards[data-count="16"] .eg-mcard-kind,.eg-mcards[data-count="18"] .eg-mcard-kind{left:7px;top:6px;font-size:10px;padding:1px 6px}
.eg-mcards[data-count="14"] .eg-mcard-back,.eg-mcards[data-count="16"] .eg-mcard-back,.eg-mcards[data-count="18"] .eg-mcard-back{font-size:12px}
.eg-mcard{perspective:800px;background:none;border:none;padding:0;cursor:pointer;height:112px}
.eg-mcard:disabled{cursor:default}
.eg-memory-preview{position:absolute;left:50%;top:50%;z-index:8;transform:translate(-50%,-50%);display:grid;place-items:center;gap:3px;min-width:132px;padding:13px 18px;border:1px solid rgba(253,224,71,.62);border-radius:18px;background:linear-gradient(135deg,rgba(6,28,44,.94),rgba(8,47,73,.92));color:#ecfeff;box-shadow:0 20px 48px rgba(2,6,23,.36),0 0 26px rgba(253,224,71,.2);pointer-events:none;animation:eg-score-burst 1s ease both}.eg-memory-preview strong{font-size:34px;line-height:1;color:#fde047}.eg-memory-preview span{font-size:13px;font-weight:900;color:#bae6fd}
.eg-mcard-inner{position:relative;display:block;width:100%;height:100%;transition:transform .45s cubic-bezier(.2,1,.3,1);transform-style:preserve-3d}
.eg-mcard.is-open .eg-mcard-inner{transform:rotateY(180deg)}
.eg-mcard-face{position:absolute;inset:0;display:grid;place-items:center;border-radius:14px;backface-visibility:hidden;padding:10px;text-align:center}
.eg-mcard-front{background:linear-gradient(135deg,#0e3a52,#072234);border:2px solid #1d6e8c}
.eg-mcard-mark{font-size:26px;font-weight:900;color:#38bdf8;opacity:.7;letter-spacing:.06em}
.eg-mcard-kind{position:absolute;left:10px;top:8px;border-radius:999px;background:rgba(125,211,252,.14);border:1px solid rgba(125,211,252,.36);color:#a7f3d0;padding:2px 7px;font-size:11px;font-weight:900}
.eg-mcard-back{background:linear-gradient(180deg,#0b2c3f,#07202f);border:2px solid #38bdf8;color:#eaffff;font-weight:800;font-size:14px;transform:rotateY(180deg);overflow:hidden}
.eg-mcard-back span:last-child{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.eg-mcard.is-done .eg-mcard-back{border-color:#34d399;box-shadow:0 0 0 2px rgba(52,211,153,.4),0 0 22px rgba(52,211,153,.35)}
.eg-mcard.is-miss .eg-mcard-inner{animation:eg-mcard-miss .34s ease}
.eg-mcard.is-miss .eg-mcard-back{border-color:#fb7185;box-shadow:0 0 0 2px rgba(251,113,133,.35),0 0 24px rgba(251,113,133,.28)}
.eg-mcard:hover:not(:disabled) .eg-mcard-front{border-color:#38bdf8}
@keyframes eg-mcard-miss{10%,90%{transform:rotateY(180deg) translateX(-2px)}20%,80%{transform:rotateY(180deg) translateX(5px)}30%,50%,70%{transform:rotateY(180deg) translateX(-7px)}40%,60%{transform:rotateY(180deg) translateX(7px)}}
.eg-asm-overlay{position:absolute;inset:0;display:grid;grid-template-columns:minmax(300px,.45fr) minmax(380px,.55fr);grid-template-rows:auto minmax(0,1fr);grid-template-areas:"clue clue" "tokens slots";gap:14px 18px;padding:18px 22px}
.eg-asm-wires{position:absolute;inset:78px 22px 20px;width:calc(100% - 44px);height:calc(100% - 98px);z-index:1;pointer-events:none;overflow:visible}.eg-asm-wire{stroke:#34d399;stroke-width:.9;stroke-linecap:round;opacity:.92;filter:drop-shadow(0 0 5px rgba(52,211,153,.72));vector-effect:non-scaling-stroke;animation:eg-pipe-draw .36s ease}.eg-asm-wire.is-guide{stroke:#fde047;stroke-dasharray:5 7;opacity:.68;animation:eg-asm-guide 1s linear infinite}.eg-asm-wire.is-guide.is-armed{opacity:.95;stroke:#22d3ee}
.eg-asm-clue{grid-area:clue;display:flex;align-items:center;gap:12px;min-height:54px;padding:10px 14px;border:1px solid rgba(125,211,252,.55);border-radius:14px;background:rgba(6,28,44,.82);color:#eaffff;box-shadow:0 10px 26px rgba(2,28,46,.25)}
.eg-asm-clue strong{white-space:nowrap;color:#fde047}.eg-asm-clue span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;color:#cbe9ff;font-size:13px}
.eg-asm-col{display:grid;gap:9px;align-content:center;min-width:0}
.eg-asm-tokens{grid-area:tokens;grid-template-columns:repeat(2,minmax(0,1fr))}
.eg-asm-slots{grid-area:slots;grid-template-columns:repeat(2,minmax(0,1fr))}
.eg-asm-col h4{margin:0;color:#7dd3fc;font-size:13px;letter-spacing:.06em}
.eg-asm-token,.eg-asm-slot{min-height:48px;padding:9px 11px;border-radius:12px;font-weight:800;cursor:pointer;text-align:left;color:#eaffff;border:2px solid rgba(125,211,252,.6);background:linear-gradient(180deg,rgba(15,52,70,.94),rgba(6,28,44,.95));transition:transform .12s,border-color .12s,box-shadow .12s;min-width:0}
.eg-asm-token span,.eg-asm-slot span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.eg-asm-token.is-sel{border-color:#fde047;box-shadow:0 0 0 2px rgba(253,224,71,.4),0 10px 24px rgba(56,189,248,.25);transform:translateX(4px)}
.eg-asm-token.is-done{border-color:#34d399;opacity:.7}
.eg-asm-token:disabled{cursor:default}
.eg-stage-wrap.is-armed .eg-asm-slot{border-color:#fde047;animation:eg-chip-glow 1s ease-in-out infinite alternate}
.eg-asm-slot:hover:not(:disabled){transform:translateX(-4px);border-color:#fde047}
.eg-asm-slot:disabled{opacity:.55;cursor:default}
.eg-asm-token:focus-visible,.eg-asm-slot:focus-visible,.eg-mcard:focus-visible{outline:3px solid #fde047;outline-offset:2px}
@media (prefers-reduced-motion:reduce){.eg-mcard-inner{transition-duration:.01ms!important}.eg-mcard.is-miss .eg-mcard-inner{animation-duration:.01ms!important}}
@keyframes eg-asm-guide{from{stroke-dashoffset:12}to{stroke-dashoffset:0}}
.eg-asm-token{touch-action:none}
.eg-asm-token.is-drag{opacity:.35}
.eg-asm-slot.is-over{border-color:#34d399;box-shadow:0 0 0 2px rgba(52,211,153,.5),0 0 22px rgba(52,211,153,.4)}
.eg-asm-ghost{position:fixed;transform:translate(-50%,-50%);z-index:9999;pointer-events:none;padding:10px 14px;border-radius:12px;font-weight:800;color:#04101f;background:#fde047;box-shadow:0 12px 30px rgba(0,0,0,.45)}
.eg-chip-ic{color:#7dd3fc;margin-bottom:2px}
.eg-asm-token{display:flex;align-items:center;gap:9px}
.eg-asm-ic{color:#7dd3fc;flex:0 0 auto}
.eg-mcard-back{gap:5px}
.eg-mcard-ic{color:#67e8f9}
.eg-gr-ic{vertical-align:-4px;margin-right:5px;color:#7dd3fc}
.eg-sortflow{display:grid;gap:10px}
.eg-sf-overlay{position:absolute;inset:0;display:grid;grid-template-rows:auto auto minmax(0,1fr);gap:10px;padding:18px 22px;overflow:auto}
.eg-sf-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
.eg-sf-head h4{margin:0;color:#7dd3fc;font-size:13px;letter-spacing:.06em}.eg-sf-head span{border-radius:999px;background:rgba(253,224,71,.16);border:1px solid rgba(253,224,71,.45);color:#fde047;padding:5px 10px;font-size:12px;font-weight:900}
.eg-sf-track{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}
.eg-sf-slot{display:grid;gap:3px;min-height:48px;padding:8px;border:1px dashed rgba(125,211,252,.45);border-radius:12px;background:rgba(6,28,44,.58);color:#9bd6ea;font-weight:900;min-width:0}.eg-sf-slot i{font-style:normal;color:#7dd3fc;font-size:11px}.eg-sf-slot b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.eg-sf-slot.is-armed{border-style:solid;border-color:#fde047;background:rgba(253,224,71,.12);box-shadow:0 0 18px rgba(253,224,71,.18)}.eg-sf-slot.is-filled{border-style:solid;border-color:#34d399;background:rgba(20,184,166,.18);color:#eaffff;animation:eg-sf-place .26s ease-out}
.eg-sf-list{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;align-content:center;max-width:860px}
.eg-sf-step{display:flex;align-items:center;gap:11px;width:100%;min-height:48px;padding:10px 12px;border:2px solid rgba(125,211,252,.6);border-radius:12px;background:linear-gradient(180deg,rgba(15,52,70,.94),rgba(6,28,44,.95));color:#eaffff;font-weight:800;text-align:left;cursor:pointer;transition:transform .12s,border-color .12s,box-shadow .12s}
.eg-sf-step:hover:not(:disabled){transform:translateX(4px);border-color:#fde047;box-shadow:0 10px 24px rgba(56,189,248,.25)}
.eg-sf-step:focus-visible{outline:3px solid #fde047;outline-offset:2px}
.eg-sf-step.is-done{border-color:#34d399;box-shadow:0 0 0 2px rgba(52,211,153,.35);opacity:.64;cursor:default;animation:eg-sf-place .26s ease-out}
.eg-sf-num{display:grid;place-items:center;min-width:30px;height:30px;border-radius:50%;background:#0e3a52;color:#7dd3fc;font-size:14px;font-weight:900;flex:0 0 auto}
.eg-sf-step.is-done .eg-sf-num{background:#34d399;color:#04101f}
.eg-sf-ic{color:#7dd3fc;flex:0 0 auto}
.eg-sf-label{flex:1;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.eg-sf-check{color:#34d399;font-size:12px}
@keyframes eg-sf-place{0%{transform:translateY(-8px) scale(.96);opacity:.35}70%{transform:translateY(2px) scale(1.03);opacity:1}100%{transform:translateY(0) scale(1)}}
.eg-pipe,.eg-maze{display:grid;gap:10px}
.eg-pipe-field,.eg-maze-field{position:absolute;inset:0;display:grid;gap:18px;padding:20px;z-index:2}
.eg-pipe-field{grid-template-columns:1fr 1fr}
.eg-pipe-wires{position:absolute;inset:20px;width:calc(100% - 40px);height:calc(100% - 40px);pointer-events:none;overflow:visible}
.eg-pipe-wire{stroke:#34d399;stroke-width:.95;stroke-linecap:round;opacity:.95;filter:drop-shadow(0 0 4px rgba(52,211,153,.85));vector-effect:non-scaling-stroke;animation:eg-pipe-draw .36s ease}
@keyframes eg-pipe-draw{from{opacity:0;stroke-dasharray:4 10}to{opacity:.95;stroke-dasharray:12 0}}
.eg-pipe-col{position:relative;display:flex;flex-direction:column;justify-content:space-around;gap:8px;z-index:1;min-width:0}
.eg-pipe-node,.eg-pipe-port,.eg-maze-rung,.eg-maze-branch{display:flex;align-items:center;gap:9px;min-height:46px;padding:9px 12px;border:2px solid rgba(125,211,252,.6);border-radius:12px;background:linear-gradient(180deg,rgba(15,52,70,.94),rgba(6,28,44,.95));color:#eaffff;font-weight:800;text-align:left;cursor:pointer;transition:transform .12s,border-color .12s,box-shadow .12s;min-width:0}
.eg-pipe-node span:not(.eg-pipe-jack),.eg-pipe-port-label,.eg-maze-rung-label,.eg-maze-branch-label{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.eg-pipe-node:hover:not(:disabled),.eg-maze-rung:hover:not(:disabled){transform:translateX(3px);border-color:#fde047}
.eg-pipe-port:hover:not(:disabled),.eg-maze-branch:hover{transform:translateX(-3px);border-color:#34d399;box-shadow:0 0 0 2px rgba(52,211,153,.35)}
.eg-pipe-node.is-sel,.eg-maze-rung.is-sel{border-color:#fde047;box-shadow:0 0 0 2px rgba(253,224,71,.35),0 0 20px rgba(56,189,248,.28)}
.eg-pipe-node.is-done,.eg-maze-rung.is-done{border-color:#34d399;box-shadow:0 0 0 2px rgba(52,211,153,.32);opacity:.94;cursor:default}
.eg-pipe-port{justify-content:flex-end}.eg-pipe-port-label{flex:1;text-align:right}
.eg-stage-wrap.is-armed .eg-pipe-port{border-color:#fde047;animation:eg-chip-glow 1s ease-in-out infinite alternate}
.eg-pipe-port:disabled,.eg-pipe-node:disabled,.eg-maze-rung:disabled{opacity:.58;cursor:default}
.eg-pipe-jack{width:12px;height:12px;border-radius:50%;background:#0e3a52;border:2px solid #7dd3fc;flex:0 0 auto}
.eg-pipe-node.is-done .eg-pipe-jack,.eg-pipe-port:not(:disabled):hover .eg-pipe-jack{background:#34d399;border-color:#34d399}
.eg-pipe-ic{color:#7dd3fc;flex:0 0 auto}
.eg-maze-field{grid-template-columns:minmax(260px,.9fr) minmax(340px,1.1fr)}
.eg-maze-ladder{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;justify-content:space-around;gap:8px;min-width:0}
.eg-maze-rung-dot{display:grid;place-items:center;min-width:26px;height:26px;border-radius:50%;background:#0e3a52;color:#7dd3fc;font-size:12px;font-weight:900;flex:0 0 auto}
.eg-maze-rung.is-done .eg-maze-rung-dot{background:#34d399;color:#04101f}
.eg-maze-panel{display:flex;flex-direction:column;gap:12px;justify-content:center;padding:14px;border:2px dashed rgba(125,211,252,.42);border-radius:14px;background:rgba(6,28,44,.62);min-width:0}
.eg-maze-idle{margin:0;color:#9be7ff;font-weight:800;text-align:center}
.eg-maze-prompt{margin:0;color:#eaffff;font-weight:900;font-size:17px;display:flex;align-items:center;gap:9px}
.eg-maze-tag{font-size:12px;font-weight:900;color:#04101f;background:#7dd3fc;padding:3px 9px;border-radius:999px}
.eg-maze-branches{display:grid;gap:10px}.eg-maze-branch{animation:eg-gr-incoming .25s ease}
.eg-maze-branch-fork{width:0;height:0;border-top:7px solid transparent;border-bottom:7px solid transparent;border-left:10px solid #7dd3fc;flex:0 0 auto}
.eg-pipe-node:focus-visible,.eg-pipe-port:focus-visible,.eg-maze-rung:focus-visible,.eg-maze-branch:focus-visible{outline:3px solid #fde047;outline-offset:2px}
.eg-clrun{display:grid;gap:10px}
.eg-clrun-hud{display:grid;grid-template-columns:auto minmax(160px,1fr) auto minmax(98px,auto) auto;align-items:center;gap:10px;padding:8px 12px;border:1px solid rgba(125,211,252,.35);border-radius:12px;background:linear-gradient(135deg,rgba(6,28,44,.88),rgba(8,47,73,.76));color:#eaffff}.eg-clrun-hud span{font-size:12px;font-weight:900;color:#7dd3fc}.eg-clrun-hud i{display:block;height:8px;border-radius:999px;background:rgba(125,211,252,.18);overflow:hidden}.eg-clrun-hud b{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#22d3ee,#fde047,#fb923c);box-shadow:0 0 18px rgba(34,211,238,.28);transition:width .25s ease}.eg-clrun-hud em{font-style:normal;font-size:12px;font-weight:900;color:#fef08a}.eg-clrun-hud ol{display:flex;gap:5px;list-style:none;margin:0;padding:0}.eg-clrun-hud li{display:grid;place-items:center;width:24px;height:24px;border-radius:999px;background:rgba(148,163,184,.28);color:#cbd5e1;font-size:11px;font-weight:900}.eg-clrun-hud [data-edugame-classrun-chain-step="hot"]{background:#fde047;color:#422006;box-shadow:0 0 14px rgba(253,224,71,.32);animation:eg-combo .42s ease}.eg-clrun[data-edugame-classrun-pressure="danger"] .eg-clrun-hud b{background:#ef4444;animation:eg-pressure-pulse .72s ease-in-out infinite alternate}
.eg-clrun-ttl{display:grid!important;grid-template-columns:auto 58px;align-items:center;gap:6px;min-width:98px;color:#eaffff!important}.eg-clrun-ttl strong{font-size:16px;color:#fef08a}.eg-clrun-ttl i{height:7px!important}.eg-clrun-ttl[data-edugame-item-ttl="warn"] strong{color:#fb923c}.eg-clrun-ttl[data-edugame-item-ttl="danger"] strong{color:#fecaca;animation:eg-pressure-pulse .55s ease-in-out infinite alternate}.eg-clrun-chip-timer{position:absolute;left:8px;top:8px;display:grid;place-items:center;width:30px;height:30px;border-radius:999px;background:#fef08a;color:#422006;font-size:13px;font-weight:950;box-shadow:0 0 18px rgba(253,224,71,.45)}
.eg-clrun[data-edugame-classrun-ttl="danger"] .eg-clrun-chip.is-front{border-color:#f87171;box-shadow:0 0 0 3px rgba(248,113,113,.32),0 0 32px rgba(248,113,113,.34)}
.eg-clrun-stage{background:radial-gradient(circle at 18% 22%,rgba(34,211,238,.2),transparent 28%),linear-gradient(135deg,#04101f,#08283a)}
.eg-clrun-field{position:absolute;inset:0;display:grid;grid-template-columns:minmax(360px,.58fr) minmax(260px,.42fr);gap:18px;padding:18px;z-index:2}
.eg-clrun-belt{position:relative;display:flex;align-items:center;gap:10px;min-width:0;padding:16px;border:2px solid rgba(125,211,252,.45);border-radius:16px;background:linear-gradient(90deg,rgba(2,28,46,.76),rgba(8,47,73,.9));overflow:hidden}
.eg-clrun-belt::before{content:"";position:absolute;inset:auto 0 12px;height:18px;background:repeating-linear-gradient(90deg,rgba(125,211,252,.35) 0 28px,rgba(125,211,252,.08) 28px 56px);animation:eg-clrun-belt 1.2s linear infinite}
@keyframes eg-clrun-belt{from{background-position:0 0}to{background-position:56px 0}}
.eg-clrun-chip{position:relative;z-index:1;display:grid;place-items:center;gap:5px;min-width:112px;max-width:138px;min-height:92px;padding:10px;border:2px solid rgba(125,211,252,.68);border-radius:16px;background:linear-gradient(180deg,rgba(15,52,70,.98),rgba(6,28,44,.98));color:#eaffff;font-weight:900;cursor:pointer;box-shadow:0 12px 24px rgba(2,6,23,.28);transform:translateX(calc(var(--clrun-depth,0) * 5px));transition:transform .14s,border-color .14s,box-shadow .14s}
.eg-clrun-chip.is-front{border-color:#fde047;box-shadow:0 0 0 3px rgba(253,224,71,.28),0 0 28px rgba(56,189,248,.28);animation:eg-chip-glow 1s ease-in-out infinite alternate}
.eg-clrun-chip.is-sel{transform:translateY(-8px) scale(1.04);border-color:#34d399;box-shadow:0 0 0 3px rgba(52,211,153,.35),0 16px 34px rgba(20,184,166,.28)}
.eg-clrun-chip:disabled{opacity:.6;cursor:default}.eg-clrun-chip:focus-visible,.eg-clrun-lane:focus-visible{outline:3px solid #fde047;outline-offset:2px}
.eg-clrun-ic{color:#67e8f9}.eg-clrun-chip-label{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-align:center;font-size:14px}
.eg-clrun-front-tag{position:absolute;right:8px;top:8px;border-radius:999px;background:#fde047;color:#422006;padding:2px 7px;font-size:11px}
.eg-clrun-scan{position:absolute;left:9px;right:9px;bottom:8px;height:4px;border-radius:999px;background:linear-gradient(90deg,transparent,#fde047,#22d3ee,transparent);box-shadow:0 0 16px rgba(34,211,238,.55);animation:eg-clrun-scan .78s linear infinite}
.eg-clrun-empty{margin:auto;color:#99f6e4;font-weight:900}
.eg-clrun-lanes{display:grid;align-content:center;gap:10px;min-width:0}
.eg-clrun-lane{display:grid;grid-template-columns:22px minmax(0,1fr);align-items:center;gap:9px;min-height:58px;padding:10px 12px;border:2px solid rgba(125,211,252,.6);border-radius:14px;background:linear-gradient(180deg,rgba(15,52,70,.95),rgba(6,28,44,.96));color:#eaffff;font-weight:900;text-align:left;cursor:pointer;transition:transform .14s,border-color .14s,box-shadow .14s}
.eg-clrun-lane.is-armed:not(:disabled){border-color:#fde047;box-shadow:0 0 0 2px rgba(253,224,71,.18)}
.eg-clrun-lane.is-armed:not(:disabled){animation:eg-clrun-lane-scan 1.7s ease-in-out infinite alternate}
.eg-clrun-lane.is-reject{border-color:rgba(251,146,60,.78);background:linear-gradient(180deg,rgba(69,26,3,.96),rgba(7,28,44,.98));box-shadow:0 0 0 2px rgba(251,146,60,.12),0 12px 24px rgba(2,6,23,.28)}
.eg-clrun-lane.is-reject .eg-clrun-lane-arrow{border-left-color:#fb923c}
.eg-clrun-lane:hover:not(:disabled){transform:translateX(-5px);border-color:#34d399;box-shadow:0 0 22px rgba(52,211,153,.28)}
.eg-clrun-lane:disabled{opacity:.52;cursor:default}.eg-clrun-lane-arrow{width:0;height:0;border-top:8px solid transparent;border-bottom:8px solid transparent;border-left:13px solid #67e8f9}.eg-clrun-lane-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.eg-clrun-hit{position:absolute;left:50%;top:50%;z-index:8;transform:translate(-50%,-50%);padding:10px 16px;border:1px solid rgba(52,211,153,.72);border-radius:16px;background:rgba(6,78,59,.86);color:#d1fae5;font-weight:950;box-shadow:0 0 34px rgba(52,211,153,.3);animation:eg-score-burst .8s ease both;pointer-events:none}.eg-clrun-hit.is-wrong{border-color:rgba(248,113,113,.72);background:rgba(69,10,10,.86);color:#fecaca;box-shadow:0 0 34px rgba(248,113,113,.3)}
@keyframes eg-clrun-lane-scan{from{filter:brightness(1);transform:translateX(0)}to{filter:brightness(1.12);transform:translateX(-3px)}}
@keyframes eg-clrun-scan{from{background-position:-120px 0;opacity:.55}to{background-position:120px 0;opacity:1}}
@media (prefers-reduced-motion:reduce){.eg-clrun-belt::before,.eg-clrun-chip.is-front,.eg-clrun-lane.is-armed:not(:disabled),.eg-clrun-scan,.eg-clrun-hit,.eg-clrun-hud [data-edugame-classrun-chain-step="hot"],.eg-clrun[data-edugame-classrun-pressure="danger"] .eg-clrun-hud b{animation-duration:.01ms!important}}
.eg-match3{display:grid;gap:10px}
.eg-match3-stage{background:radial-gradient(circle at 16% 22%,rgba(34,211,238,.22),transparent 30%),radial-gradient(circle at 82% 64%,rgba(253,224,71,.16),transparent 24%),linear-gradient(135deg,#04101f,#08283a)}
.eg-match3-field{position:absolute;inset:0;z-index:2;display:grid;grid-template-columns:minmax(420px,1fr) 176px;grid-template-rows:auto minmax(0,1fr);grid-template-areas:"goal legend" "board legend";gap:12px;padding:16px}
.eg-match3-goal{grid-area:goal;display:flex;align-items:center;gap:10px;min-height:48px;padding:10px 14px;border:1px solid rgba(125,211,252,.55);border-radius:14px;background:rgba(6,28,44,.82);color:#eaffff;box-shadow:0 10px 26px rgba(2,28,46,.25)}
.eg-match3-goal strong{color:#fde047;white-space:nowrap}.eg-match3-goal span{color:#cbe9ff;font-size:13px;font-weight:800}
.eg-match3-goal b{color:#fef08a}.eg-match3-objective,.eg-match3-streak{margin-left:auto;border-radius:999px;padding:5px 10px;background:rgba(253,224,71,.16);border:1px solid rgba(253,224,71,.45);color:#fef08a;font-style:normal;font-size:12px;font-weight:900}.eg-match3-streak{margin-left:0;background:rgba(52,211,153,.16);border-color:rgba(52,211,153,.45);color:#bbf7d0;animation:eg-pop-rise .48s ease}
.eg-match3-meter{width:96px;height:8px;border-radius:999px;background:rgba(125,211,252,.18);overflow:hidden;box-shadow:inset 0 0 0 1px rgba(125,211,252,.18)}.eg-match3-meter i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#22d3ee,#a7f3d0,#fde047);box-shadow:0 0 16px rgba(34,211,238,.32);transition:width .28s ease}.eg-match3[data-edugame-match3-pressure="danger"] .eg-match3-move-pill{background:rgba(239,68,68,.22);border-color:rgba(248,113,113,.68);color:#fecaca!important;animation:eg-pressure-pulse .66s ease-in-out infinite alternate}.eg-match3[data-edugame-match3-pressure="combo"] .eg-match3-meter i{background:linear-gradient(90deg,#fde047,#fb923c,#22d3ee);animation:eg-combo .48s ease}
.eg-match3-moves,.eg-match3-move-pill{border-radius:999px;background:rgba(251,146,60,.18);border:1px solid rgba(251,146,60,.42);color:#fed7aa!important;padding:5px 10px;font-size:12px;font-weight:900}.eg-match3-move-pill{margin-left:0;font-style:normal}
.eg-match3-board{grid-area:board;position:relative;display:grid;grid-template-columns:repeat(6,minmax(66px,1fr));grid-template-rows:repeat(6,minmax(0,1fr));gap:8px;min-width:0;min-height:0}
.eg-match3-board::before{content:"";position:absolute;inset:-8px;z-index:0;border-radius:18px;background:linear-gradient(115deg,transparent 0 34%,rgba(34,211,238,.18) 44%,rgba(253,224,71,.22) 50%,rgba(34,211,238,.16) 56%,transparent 66%);transform:translateX(-120%);animation:eg-match3-scan 3.2s ease-in-out infinite;pointer-events:none}
.eg-match3-board::after{content:"";position:absolute;inset:-10px;z-index:0;border:1px solid rgba(125,211,252,.24);border-radius:20px;background:radial-gradient(circle at 24% 18%,rgba(34,211,238,.15),transparent 20%),radial-gradient(circle at 78% 74%,rgba(52,211,153,.12),transparent 22%);pointer-events:none}
.eg-match3-board[data-edugame-match3-board-state="swapping"]{animation:eg-match3-board-surge .3s ease}
.eg-match3-board[data-edugame-match3-board-state="clearing"]::after{border-color:rgba(253,224,71,.62);box-shadow:0 0 32px rgba(253,224,71,.22)}
.eg-match3-board[data-edugame-match3-board-state="falling"]::before{animation-duration:.9s}
.eg-match3-swap-beam{position:absolute;z-index:4;height:5px;transform-origin:left center;border-radius:999px;background:linear-gradient(90deg,transparent,#fde047,#22d3ee,transparent);box-shadow:0 0 18px rgba(34,211,238,.58),0 0 10px rgba(253,224,71,.45);pointer-events:none;animation:eg-match3-beam .34s ease-out forwards}
.eg-match3-motion-pulse{position:absolute;inset:8px;z-index:3;border-radius:18px;border:1px solid rgba(253,224,71,.72);box-shadow:0 0 0 0 rgba(253,224,71,.42),0 0 34px rgba(34,211,238,.2);pointer-events:none;animation:eg-match3-pulse .72s ease-out forwards}
.eg-match3-tile{--m3-hue:calc(184 + var(--m3-color,0) * 32);position:relative;z-index:1;display:grid;place-items:center;align-content:center;gap:4px;min-height:0;padding:5px 7px;border:2px solid hsl(var(--m3-hue) 88% 58% / .75);border-radius:14px;background:radial-gradient(circle at 50% 18%,hsl(var(--m3-hue) 88% 64% / .24),transparent 32%),linear-gradient(180deg,hsl(var(--m3-hue) 64% 20% / .98),rgba(4,16,31,.98));color:#eaffff;cursor:pointer;box-shadow:0 10px 22px rgba(2,6,23,.28),inset 0 0 18px hsl(var(--m3-hue) 88% 58% / .12);transition:transform .12s,border-color .12s,box-shadow .12s,opacity .12s;overflow:hidden}
.eg-match3-tile::after{content:"";position:absolute;inset:-30%;background:linear-gradient(115deg,transparent 35%,rgba(255,255,255,.2) 50%,transparent 65%);transform:translateX(-120%);animation:eg-match3-tile-shine 3.6s ease-in-out var(--m3-delay,0ms) infinite;pointer-events:none}
.eg-match3-tile.is-objective{box-shadow:0 12px 28px rgba(2,6,23,.34),0 0 0 2px rgba(253,224,71,.28) inset,0 0 20px rgba(253,224,71,.2);animation:eg-match3-target 1.55s ease-in-out infinite}
.eg-match3-tile:not(.is-picked):not(.is-wrong):not(.is-clear):not(.is-swap):not(.is-fall){animation:eg-match3-idle 3.4s ease-in-out var(--m3-delay,0ms) infinite}
.eg-match3-tile:hover:not(:disabled){transform:translateY(-3px);box-shadow:0 14px 28px rgba(2,6,23,.35),0 0 18px hsl(var(--m3-hue) 88% 58% / .28)}
.eg-match3-tile.is-picked{border-color:#fde047;transform:translateY(-5px) scale(1.03);box-shadow:0 0 0 3px rgba(253,224,71,.28),0 16px 32px rgba(2,6,23,.36)}
.eg-match3-tile.is-swap{animation:eg-match3-swap .22s ease-out}
.eg-match3-tile.is-wrong{border-color:#f87171;animation:eg-match3-bounce .34s cubic-bezier(.36,.07,.19,.97)}
.eg-match3-tile.is-clear{pointer-events:none;animation:eg-match3-clear .36s ease-in forwards}
.eg-match3-tile.is-fall{animation:eg-match3-drop .34s cubic-bezier(.2,.75,.2,1.08)}
.eg-match3-tile:focus-visible{outline:3px solid #fde047;outline-offset:2px}
@keyframes eg-match3-swap{0%{transform:scale(.96)}45%{transform:translateY(-7px) scale(1.07)}100%{transform:translateY(0) scale(1)}}
@keyframes eg-match3-beam{0%{opacity:0;filter:blur(3px)}28%{opacity:1;filter:blur(0)}100%{opacity:0;filter:blur(2px)}}
@keyframes eg-match3-idle{0%,100%{transform:translateY(0);filter:brightness(1)}50%{transform:translateY(-3px);filter:brightness(1.08)}}
@keyframes eg-match3-bounce{10%,90%{transform:translateX(-3px)}20%,80%{transform:translateX(6px)}30%,50%,70%{transform:translateX(-9px)}40%,60%{transform:translateX(9px)}}
@keyframes eg-match3-clear{0%{opacity:1;filter:brightness(1)}55%{opacity:1;transform:scale(1.1);filter:brightness(1.8)}100%{opacity:0;transform:scale(.25) rotate(12deg);filter:brightness(2)}}
@keyframes eg-match3-drop{0%{opacity:0;transform:translateY(-28px) scale(.92)}70%{opacity:1;transform:translateY(4px) scale(1.02)}100%{opacity:1;transform:translateY(0) scale(1)}}
@keyframes eg-match3-target{0%,100%{border-color:rgba(253,224,71,.78)}50%{border-color:rgba(45,212,191,.95);filter:brightness(1.12)}}
@keyframes eg-match3-pulse{0%{opacity:0;transform:scale(.96);box-shadow:0 0 0 0 rgba(253,224,71,.42),0 0 34px rgba(34,211,238,.18)}35%{opacity:1}100%{opacity:0;transform:scale(1.04);box-shadow:0 0 0 18px rgba(253,224,71,0),0 0 48px rgba(34,211,238,.28)}}
.eg-match3-burst{position:absolute;z-index:5;transform:translate(-50%,-50%);min-width:48px;padding:5px 9px;border-radius:999px;background:linear-gradient(135deg,#fde047,#22d3ee);color:#072234;font-size:14px;font-weight:950;text-align:center;box-shadow:0 12px 28px rgba(34,211,238,.35),0 0 22px rgba(253,224,71,.34);pointer-events:none;animation:eg-match3-burst .88s ease-out forwards}
.eg-match3-burst.is-miss{background:linear-gradient(135deg,#fecaca,#fb7185);color:#450a0a;box-shadow:0 14px 30px rgba(248,113,113,.38),0 0 22px rgba(248,113,113,.32)}
.eg-match3-burst.is-cascade{background:linear-gradient(135deg,#bbf7d0,#fde047);color:#052e16;box-shadow:0 14px 30px rgba(52,211,153,.34),0 0 24px rgba(250,204,21,.32)}
.eg-match3[data-edugame-match3-cascade]:not([data-edugame-match3-cascade="0"]) .eg-match3-board{animation:eg-match3-board-pop .42s ease}
@keyframes eg-match3-burst{0%{opacity:0;transform:translate(-50%,-20%) scale(.62)}20%{opacity:1;transform:translate(-50%,-56%) scale(1.1)}100%{opacity:0;transform:translate(-50%,-140%) scale(.92)}}
@keyframes eg-match3-board-pop{0%{filter:brightness(1)}45%{filter:brightness(1.18)}100%{filter:brightness(1)}}
@keyframes eg-match3-scan{0%,16%{transform:translateX(-120%);opacity:0}35%,70%{opacity:1}88%,100%{transform:translateX(120%);opacity:0}}
@keyframes eg-match3-board-surge{0%{transform:scale(.995)}50%{transform:scale(1.012)}100%{transform:scale(1)}}
@keyframes eg-match3-tile-shine{0%,55%{transform:translateX(-120%);opacity:0}68%{opacity:.85}86%,100%{transform:translateX(120%);opacity:0}}
.eg-match3-ic{width:26px;height:26px;color:#7dd3fc;filter:drop-shadow(0 0 9px rgba(125,211,252,.38))}.eg-match3-label{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:950;letter-spacing:0}.eg-match3-tile small{display:none}
.eg-match3-side{grid-area:legend;display:grid;align-content:center;gap:8px;min-width:0}.eg-match3-side span{display:flex;align-items:center;gap:8px;min-height:38px;padding:8px;border:1px solid rgba(125,211,252,.45);border-radius:12px;background:rgba(6,28,44,.72);color:#eaffff;font-size:12px;font-weight:900}.eg-match3-side i{--m3-hue:calc(184 + var(--m3-color,0) * 32);width:12px;height:12px;border-radius:50%;background:hsl(var(--m3-hue) 88% 58%);box-shadow:0 0 14px hsl(var(--m3-hue) 88% 58% / .7);flex:0 0 auto}
@media (prefers-reduced-motion:reduce){.eg-match3-tile{transition-duration:.01ms!important}.eg-match3-board,.eg-match3-board::before,.eg-match3-tile::after,.eg-match3-tile:not(.is-picked):not(.is-wrong):not(.is-clear):not(.is-swap):not(.is-fall),.eg-match3-tile.is-objective,.eg-match3-tile.is-wrong,.eg-match3-tile.is-clear,.eg-match3-tile.is-swap,.eg-match3-tile.is-fall,.eg-match3-burst,.eg-match3-swap-beam,.eg-match3-motion-pulse,.eg-match3[data-edugame-match3-pressure="danger"] .eg-match3-move-pill,.eg-match3[data-edugame-match3-pressure="combo"] .eg-match3-meter i{animation-duration:.01ms!important}}
.dg-edugame-pixi{position:relative;isolation:isolate;gap:8px;padding:10px;background:linear-gradient(180deg,#f8fbff,#eefcff)}
.eg-topbar{padding:10px 12px;border:1px solid rgba(14,116,144,.18);border-radius:12px;background:linear-gradient(135deg,#062235,#0b3b4f);color:#ecfeff;box-shadow:0 16px 34px rgba(15,23,42,.14)}
.eg-eyebrow{color:#67e8f9}.eg-topbar h3{font-size:22px;color:#f8feff}.eg-topbar p{color:#cbe9ff;max-width:68ch}
.eg-mode-badge{display:inline-flex;align-items:center;width:max-content;margin-top:5px;border:1px solid rgba(253,224,71,.55);border-radius:999px;background:rgba(253,224,71,.16);color:#fde047;padding:4px 9px;font-size:12px;font-style:normal;font-weight:900}
.eg-stat,.eg-stats button{border-color:rgba(125,211,252,.35);background:rgba(248,250,252,.95)}.eg-stats button{background:linear-gradient(135deg,#06b6d4,#0f766e);border-color:rgba(167,243,208,.7);color:#042f2e;font-size:14px}
.eg-title-copy h3{color:#f8feff!important;text-shadow:0 2px 10px rgba(0,0,0,.35)}
.eg-title-copy p{color:#d8f7ff!important;font-weight:800}
.eg-title-copy .eg-eyebrow{color:#67e8f9!important}
.eg-stats{grid-template-columns:repeat(4,minmax(64px,74px)) minmax(80px,92px) minmax(92px,108px) minmax(76px,88px);align-items:stretch}
.eg-stat span{color:#315267}.eg-stat strong{color:#083344}.eg-stats button{min-height:58px}
.eg-audio-toggle{display:inline-flex;align-items:center;justify-content:center;gap:6px;background:linear-gradient(135deg,#0f766e,#14b8a6)!important;border-color:rgba(94,234,212,.75)!important;color:#ecfeff!important}
.eg-audio-toggle[data-edugame-audio-toggle="off"]{background:#e2e8f0!important;color:#334155!important;border-color:#cbd5e1!important}
.eg-audio-bars{display:inline-grid;grid-template-columns:repeat(3,3px);align-items:end;gap:2px;height:14px}.eg-audio-bars i{display:block;width:3px;height:7px;border-radius:999px;background:currentColor;animation:eg-audio-bounce .62s ease-in-out infinite}.eg-audio-bars i:nth-child(2){height:12px;animation-delay:.12s}.eg-audio-bars i:nth-child(3){height:9px;animation-delay:.24s}.eg-audio-toggle[data-edugame-audio-toggle="off"] .eg-audio-bars i{animation:none;opacity:.45}
.eg-answer-toggle{position:relative;z-index:34;background:linear-gradient(135deg,#fde047,#fb923c)!important;border-color:rgba(253,224,71,.9)!important;color:#3b2404!important}
.eg-answer-toggle[aria-expanded="true"]{box-shadow:0 0 0 3px rgba(253,224,71,.28),0 12px 28px rgba(251,146,60,.22)}
.eg-mission strong{color:#071827;font-size:19px;line-height:1.35}.eg-mission p{color:#245064;font-size:14px;line-height:1.6}
.eg-answer-panel{position:absolute;right:16px;top:152px;z-index:28;width:min(520px,calc(100% - 32px));max-height:min(430px,calc(100% - 184px));overflow:auto;display:grid;gap:10px;padding:12px;border:1px solid rgba(251,146,60,.36);border-radius:14px;background:linear-gradient(135deg,rgba(255,247,237,.98),rgba(236,254,255,.96));box-shadow:0 24px 58px rgba(15,23,42,.22)}
.eg-answer-panel[hidden]{display:none}
.eg-answer-panel header{display:flex;align-items:center;justify-content:space-between;gap:12px;position:sticky;top:0;z-index:1;padding-bottom:4px;background:inherit}
.eg-answer-panel header strong{font-size:15px;color:#9a3412}.eg-answer-panel header span{color:#475569;font-size:13px;font-weight:800}
.eg-answer-panel ol{margin:0;padding:0;list-style:none;display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:8px}
.eg-answer-panel li{display:grid;grid-template-columns:minmax(82px,.45fr) minmax(0,1fr);gap:8px;align-items:center;min-height:42px;padding:8px 10px;border:1px solid rgba(14,165,233,.22);border-radius:10px;background:rgba(255,255,255,.82)}
.eg-answer-panel li b{color:#0e7490}.eg-answer-panel li span{color:#0f172a;font-weight:800}
.eg-mission{grid-template-columns:minmax(0,1fr) 210px;padding:9px 12px;background:linear-gradient(135deg,#ecfeff,#f8fafc)}
.eg-guide-steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;overflow:visible}.eg-guide-steps li{overflow:hidden;text-overflow:ellipsis}
.eg-stage-wrap{height:clamp(320px,30vw,460px);min-height:0;border-radius:14px;background:radial-gradient(circle at 30% 20%,rgba(34,211,238,.14),transparent 32%),#04101f}
.eg-pixi-canvas{height:100%}
.eg-stage-wrap::before{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;background:radial-gradient(circle at 15% 12%,rgba(56,189,248,.22),transparent 18%),radial-gradient(circle at 82% 72%,rgba(20,184,166,.18),transparent 20%),linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px),linear-gradient(0deg,rgba(255,255,255,.04) 1px,transparent 1px);background-size:auto,auto,68px 68px,68px 68px;mix-blend-mode:screen}
.eg-pixi-canvas{position:relative;z-index:1}
.eg-field,.eg-gr-overlay,.eg-mcards,.eg-asm-overlay,.eg-sf-overlay,.eg-clrun-field,.eg-match3-field{z-index:2}
.eg-stage-wrap canvas{width:100%;height:100%;object-fit:cover}
.eg-feedback{min-height:48px}
.eg-start-panel{width:min(520px,calc(100% - 56px))}
.eg-start-panel strong{font-size:24px;line-height:1.35}.eg-start-panel button{min-width:128px}
.dg-edugame-pixi:fullscreen{width:100vw;height:100vh;min-height:100vh!important;box-sizing:border-box;grid-template-rows:auto auto minmax(0,1fr) auto;background:#06111d;overflow:hidden}
.dg-edugame-pixi:fullscreen .eg-layout,.dg-edugame-pixi:fullscreen .eg-arcade,.dg-edugame-pixi:fullscreen .eg-boss,.dg-edugame-pixi:fullscreen .eg-gaterush,.dg-edugame-pixi:fullscreen .eg-memboard,.dg-edugame-pixi:fullscreen .eg-assemble,.dg-edugame-pixi:fullscreen .eg-sortflow,.dg-edugame-pixi:fullscreen .eg-clrun,.dg-edugame-pixi:fullscreen .eg-match3{min-height:0;height:100%}
.dg-edugame-pixi:fullscreen .eg-stage-wrap{height:100%;min-height:0}
.dg-edugame-pixi:fullscreen .eg-stage-wrap canvas{height:100%;object-fit:cover}
.dg-edugame-pixi:fullscreen .eg-review{position:absolute;left:18px;right:18px;bottom:18px;z-index:24}
.dg-edugame-pixi{overflow:hidden;border-color:rgba(20,184,166,.28);background:radial-gradient(circle at 12% 4%,rgba(34,211,238,.2),transparent 28%),linear-gradient(180deg,#061626,#f0fdff 44%,#f8fbff);box-shadow:0 18px 44px rgba(15,23,42,.12)}
.dg-edugame-pixi::before{content:"";position:absolute;inset:0 0 auto;height:180px;pointer-events:none;background:linear-gradient(120deg,rgba(125,211,252,.12),transparent 42%),repeating-linear-gradient(90deg,rgba(125,211,252,.08) 0 1px,transparent 1px 72px);opacity:.72}
.eg-topbar{position:relative;z-index:40;grid-template-columns:minmax(260px,1fr) minmax(440px,auto);padding:8px 10px;border-color:rgba(125,211,252,.28);background:linear-gradient(135deg,rgba(4,16,31,.94),rgba(8,47,73,.92));backdrop-filter:blur(12px)}
.eg-title-copy{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;align-items:center}
.eg-title-copy h3{grid-column:1;grid-row:2;margin:0!important;font-size:20px!important;line-height:1.1!important}
.eg-title-copy p{grid-column:1;grid-row:3;margin:0!important;font-size:12px!important;line-height:1.25!important}
.eg-eyebrow{grid-column:1;grid-row:1;letter-spacing:.12em}
.eg-hud-route{grid-column:2;grid-row:1/4;align-self:center;list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(52px,1fr));gap:5px;min-width:190px}
.eg-hud-route li{min-height:30px;display:grid;place-items:center;border:1px solid rgba(125,211,252,.34);border-radius:10px;background:rgba(6,28,44,.58);color:#d8f7ff;font-size:11px;font-weight:900;box-shadow:inset 0 0 18px rgba(125,211,252,.08)}
.eg-stats{grid-template-columns:repeat(4,minmax(50px,62px)) minmax(64px,76px) minmax(76px,88px) minmax(64px,76px);gap:5px}
.eg-stat,.eg-stats button{min-height:40px;border-radius:9px;padding:4px 7px}.eg-stat strong{font-size:17px}.eg-stat span{font-size:10px}
.eg-mission{position:relative;z-index:2;grid-template-columns:minmax(0,1fr) 150px 66px;min-height:86px;gap:7px;padding:9px 10px;background:linear-gradient(135deg,rgba(236,254,255,.94),rgba(248,250,252,.92));backdrop-filter:blur(10px)}
.eg-mission-copy strong{display:-webkit-box;font-size:16px;line-height:1.32;white-space:normal;overflow:hidden;text-overflow:ellipsis;-webkit-line-clamp:2;-webkit-box-orient:vertical}.eg-mission-copy p{display:-webkit-box;margin-top:4px;color:#245064;font-size:12px;line-height:1.45;overflow:hidden;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.eg-mission-meter{align-self:end;grid-column:2;height:7px}.eg-reward-meter{grid-column:2;align-self:start}
.eg-mission-radar{grid-column:3;grid-row:1/3;position:relative;place-self:center;width:48px;height:48px;border:1px solid rgba(20,184,166,.25);border-radius:50%;background:radial-gradient(circle,rgba(20,184,166,.18),transparent 68%)}
.eg-mission-radar::before{content:"";position:absolute;left:50%;top:50%;width:2px;height:26px;background:#14b8a6;transform-origin:0 0;animation:eg-radar-spin 2.4s linear infinite;box-shadow:0 0 14px rgba(20,184,166,.8)}
.eg-mission-radar i{position:absolute;width:7px;height:7px;border-radius:50%;background:#22d3ee;box-shadow:0 0 14px rgba(34,211,238,.9)}
.eg-mission-radar i:nth-child(1){left:18px;top:22px}.eg-mission-radar i:nth-child(2){right:16px;top:34px}.eg-mission-radar i:nth-child(3){left:36px;bottom:15px}
@keyframes eg-radar-spin{to{transform:rotate(360deg)}}
.eg-guide-steps,.eg-kp-tags{display:none}
.dg-edugame-pixi:fullscreen .eg-guide-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-column:1/-1}.dg-edugame-pixi:fullscreen .eg-guide-steps li{padding:5px 8px;font-size:11px;background:rgba(207,250,254,.82)}
.dg-edugame-pixi:fullscreen .eg-kp-tags{display:flex;grid-column:1/-1;gap:6px;overflow:hidden}.dg-edugame-pixi:fullscreen .eg-kp-tags em{border-radius:999px;background:#062235;color:#a7f3d0;padding:4px 8px;font-style:normal;font-size:11px;font-weight:900;white-space:nowrap}
.eg-layout{position:relative;z-index:1}.eg-layout-arcade{margin-top:0}
.eg-stage-badge{position:absolute;left:16px;top:14px;z-index:6;display:flex;align-items:center;gap:8px;padding:7px 10px;border:1px solid rgba(125,211,252,.44);border-radius:999px;background:rgba(4,16,31,.76);color:#d8f7ff;box-shadow:0 12px 28px rgba(2,6,23,.22);backdrop-filter:blur(10px);pointer-events:none}
.eg-stage-badge span{color:#67e8f9;font-size:11px;font-weight:900;letter-spacing:.08em}.eg-stage-badge strong{color:#fef08a;font-size:12px}
.eg-stage-wrap{height:clamp(380px,34vw,520px);border:1px solid rgba(125,211,252,.24);box-shadow:0 20px 48px rgba(2,6,23,.28),inset 0 0 0 1px rgba(255,255,255,.03)}
.eg-stage-wrap::after{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;background:linear-gradient(180deg,rgba(255,255,255,.07),transparent 18%,transparent 78%,rgba(6,182,212,.08)),repeating-linear-gradient(0deg,transparent 0 8px,rgba(125,211,252,.04) 8px 9px);mix-blend-mode:screen}
.eg-chip,.eg-gr-gate,.eg-mcard-front,.eg-mcard-back,.eg-asm-token,.eg-asm-slot,.eg-sf-step,.eg-pipe-node,.eg-pipe-port,.eg-maze-rung,.eg-maze-branch,.eg-match3-tile{box-shadow:0 12px 28px rgba(2,6,23,.34),0 0 0 1px rgba(255,255,255,.04) inset}
.eg-start-panel{border-color:rgba(125,211,252,.72);background:radial-gradient(circle at 20% 18%,rgba(34,211,238,.2),transparent 28%),linear-gradient(180deg,rgba(7,29,44,.97),rgba(3,11,24,.98))}
.eg-feedback{position:relative;z-index:2;border-color:rgba(14,165,233,.22);background:rgba(255,255,255,.92);box-shadow:0 10px 26px rgba(15,23,42,.08)}
.dg-edugame-pixi[data-edugame-result="correct"] .eg-feedback{border-color:rgba(34,197,94,.62);background:linear-gradient(135deg,#ecfdf5,#f8fafc);box-shadow:0 12px 28px rgba(34,197,94,.14)}
.dg-edugame-pixi[data-edugame-result="correct"] .eg-feedback strong{color:#15803d}
.dg-edugame-pixi[data-edugame-result="wrong"] .eg-feedback{border-color:rgba(248,113,113,.68);background:linear-gradient(135deg,#fff1f2,#fff7ed);box-shadow:0 12px 28px rgba(248,113,113,.16)}
.dg-edugame-pixi[data-edugame-result="wrong"] .eg-feedback strong{color:#dc2626}
.eg-action-feedback{animation-duration:1.12s}.eg-action-feedback i{animation-duration:1.12s}
.eg-match3-goal{flex-wrap:wrap}.eg-match3-goal strong{white-space:normal;line-height:1.35}.eg-match3-goal span{white-space:normal}
.eg-match3-label{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;white-space:normal;line-height:1.16}
.dg-edugame-pixi[data-edugame-pressure="high"] .eg-stat:nth-child(3){background:#fff1f2;border-color:#fda4af}.dg-edugame-pixi[data-edugame-pressure="high"] .eg-stat:nth-child(3) strong{color:#dc2626}
.dg-edugame-pixi[data-edugame-audio="on"] .eg-topbar{box-shadow:0 16px 34px rgba(15,23,42,.14),0 0 28px rgba(20,184,166,.16)}
body.dgbook-edugame-active .site-teaching-dock,body.dgbook-edugame-in-view .site-teaching-dock{transform:translate(-50%,calc(100% + 28px));opacity:.08;pointer-events:none;transition:transform .22s ease,opacity .22s ease}
@media (max-width:900px){.eg-topbar{grid-template-columns:1fr}.eg-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.eg-mission{grid-template-columns:1fr}.eg-guide-steps{justify-content:flex-start;flex-wrap:wrap}.eg-asm-overlay,.eg-pipe-field,.eg-maze-field,.eg-clrun-field{grid-template-columns:1fr;grid-template-rows:auto auto 1fr;grid-template-areas:"clue" "tokens" "slots";overflow:auto}.eg-match3-field{grid-template-columns:1fr;grid-template-rows:auto auto 1fr;grid-template-areas:"goal" "legend" "board";overflow:auto}.eg-mcards{grid-template-columns:repeat(3,minmax(96px,1fr));padding:24px}.eg-gr-gates{grid-template-columns:repeat(2,minmax(0,1fr))}.eg-clrun-belt{min-height:120px}.eg-clrun-lanes{align-content:start}.eg-match3-board{grid-template-columns:repeat(4,minmax(72px,1fr))}.eg-match3-side{grid-auto-flow:column;overflow:auto}}
@media (max-width:640px){.dg-edugame-pixi{padding:12px}.eg-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.eg-arcade-bar em{flex-basis:100%}.eg-mcards{grid-template-columns:repeat(2,minmax(96px,1fr));gap:10px}.eg-mcard{height:96px}.eg-asm-tokens,.eg-asm-slots{grid-template-columns:1fr}.eg-start-panel{width:calc(100% - 24px)}}

.dg-edugame-pixi[data-edugame-variant="embedded"]{min-height:0!important;padding:8px;border-radius:8px;background:#041522;box-shadow:none}
.dg-edugame-pixi[data-edugame-variant="embedded"] .eg-title-copy,.dg-edugame-pixi[data-edugame-variant="embedded"] .eg-mission,.dg-edugame-pixi[data-edugame-variant="embedded"] .eg-stage-badge,.dg-edugame-pixi[data-edugame-variant="embedded"] .eg-feedback,.dg-edugame-pixi[data-edugame-variant="embedded"] .eg-answer-toggle,.dg-edugame-pixi[data-edugame-variant="embedded"] [data-edugame-fullscreen]{display:none!important}
.dg-edugame-pixi[data-edugame-variant="embedded"] .eg-topbar{display:block;padding:0;border:0;background:transparent;box-shadow:none;backdrop-filter:none}
.dg-edugame-pixi[data-edugame-variant="embedded"] .eg-stats{grid-template-columns:repeat(4,minmax(0,1fr)) 48px;gap:5px;margin-bottom:8px}
.dg-edugame-pixi[data-edugame-variant="embedded"] .eg-stat,.dg-edugame-pixi[data-edugame-variant="embedded"] .eg-stats button{min-height:42px;border-radius:6px;padding:5px 7px}
.dg-edugame-pixi[data-edugame-variant="embedded"] .eg-stat strong{font-size:16px}
.dg-edugame-pixi[data-edugame-variant="embedded"] .eg-audio-toggle{min-width:0;font-size:0}
.dg-edugame-pixi[data-edugame-variant="embedded"] .eg-audio-toggle .eg-audio-bars{display:inline-grid}
.dg-edugame-pixi[data-edugame-variant="embedded"] .eg-layout{gap:8px}
.dg-edugame-pixi[data-edugame-variant="embedded"] .eg-arcade-bar{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 8px;padding:8px 10px}
.dg-edugame-pixi[data-edugame-variant="embedded"] .eg-arcade-bar strong,.dg-edugame-pixi[data-edugame-variant="embedded"] .eg-arcade-bar>span:not(.eg-gr-clear):not(.eg-arcade-combo){display:none}
.dg-edugame-pixi[data-edugame-variant="embedded"] .eg-arcade-bar em{grid-column:1;font-size:12px;line-height:1.45}
.dg-edugame-pixi[data-edugame-variant="embedded"] .eg-arcade-bar .eg-gr-clear{grid-column:2;grid-row:1;align-self:center}
.dg-edugame-pixi[data-edugame-variant="embedded"] .eg-start-panel{top:auto;bottom:18px;width:min(360px,calc(100% - 28px));gap:6px;padding:12px;border-radius:8px}
.dg-edugame-pixi[data-edugame-variant="embedded"] .eg-start-panel span,.dg-edugame-pixi[data-edugame-variant="embedded"] .eg-start-panel p{display:none}
.dg-edugame-pixi[data-edugame-variant="embedded"] .eg-start-panel strong{font-size:16px;line-height:1.4}
.dg-edugame-pixi[data-edugame-variant="embedded"] .eg-start-panel button{min-height:40px;min-width:112px;border-radius:6px}
@media (max-width:640px){.dg-edugame-pixi[data-edugame-variant="embedded"]{padding:6px}.dg-edugame-pixi[data-edugame-variant="embedded"] .eg-stats{grid-template-columns:repeat(4,minmax(0,1fr)) 42px}.dg-edugame-pixi[data-edugame-variant="embedded"] .eg-stat span{font-size:10px}.dg-edugame-pixi[data-edugame-variant="embedded"] .eg-stat strong{font-size:14px}.dg-edugame-pixi[data-edugame-variant="embedded"] .eg-pipe-field{max-height:430px;overflow:auto}.dg-edugame-pixi[data-edugame-variant="embedded"] .eg-start-panel{bottom:12px}}
`;
