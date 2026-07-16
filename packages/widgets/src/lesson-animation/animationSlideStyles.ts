export const animationSlideStyles = `
.dg-teaching-stage-screen { position: relative; width: 100%; height: 100%; overflow: hidden; background: #eef4f6; }
.dg-teaching-stage { position: absolute; left: 0; top: 0; overflow: hidden; color: #0f172a; isolation: isolate; transform-origin: top left; border-radius: 8px; box-shadow: 0 18px 42px rgba(15,23,42,.12); }
.dg-stage-camera { position: absolute; inset: 0; transform-origin: 50% 50%; transition-property: transform; transition-duration: .45s; transition-timing-function: cubic-bezier(.16,1,.3,1); will-change: transform; }
.dg-stage-background-grid { position: absolute; inset: 0; z-index: 0; width: 100%; height: 100%; pointer-events: none; }
.dg-stage-media-tracks { position: absolute; inset: 0; z-index: 24; pointer-events: none; }
.dg-stage-media-track { position: absolute; overflow: hidden; border-radius: 12px; transition: opacity .32s ease, visibility .32s ease; box-shadow: 0 12px 26px rgba(15,23,42,.1); background: rgba(255,255,255,.78); }
.dg-stage-media-track video, .dg-stage-media-track img { display: block; width: 100%; height: 100%; object-fit: inherit; }
.dg-stage-media-track.is-poster { box-shadow: none; background: transparent; }
.dg-stage-lines { position: absolute; inset: 0; z-index: 12; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.dg-stage-line-path { filter: drop-shadow(0 5px 12px rgba(15,23,42,.12)); animation: dg-stage-line-draw .82s cubic-bezier(.16,1,.3,1) both; }
.dg-stage-lines .is-active .dg-stage-line-path { stroke-width: 6; filter: drop-shadow(0 0 14px currentColor); stroke-dasharray: 18 12; animation: dg-stage-line-flow 1s linear infinite; }
.dg-stage-lines .has-cue-flow .dg-stage-line-path, .dg-stage-lines .has-cue-path-flow .dg-stage-line-path { stroke-width: 6; stroke-dasharray: 18 12; filter: drop-shadow(0 0 16px currentColor); animation: dg-stage-line-flow .78s linear infinite; }
.dg-stage-lines .has-cue-draw .dg-stage-line-path { animation: none; transition: stroke-dashoffset .08s linear; }
.dg-stage-packet { filter: drop-shadow(0 0 10px rgba(20,184,166,.72)); stroke: rgba(255,255,255,.9); stroke-width: 2; }
.dg-stage-whiteboard { position: absolute; inset: 0; z-index: 18; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.dg-stage-whiteboard-text { font-size: 18px; font-weight: 950; letter-spacing: 0; paint-order: stroke; stroke: rgba(255,255,255,.9); stroke-width: 4px; stroke-linejoin: round; filter: drop-shadow(0 8px 16px rgba(15,23,42,.18)); }
.dg-stage-whiteboard-line { filter: drop-shadow(0 0 14px currentColor); stroke-dasharray: 12 8; animation: dg-stage-line-flow .82s linear infinite; }
.dg-stage-whiteboard-shape { filter: drop-shadow(0 0 18px currentColor); stroke-linejoin: round; }
.dg-stage-whiteboard-chart, .dg-stage-whiteboard-table, .dg-stage-whiteboard-code, .dg-stage-whiteboard-formula { filter: drop-shadow(0 0 16px currentColor); stroke-linecap: round; stroke-linejoin: round; }
.dg-stage-transition { position: absolute; inset: 0; z-index: 56; pointer-events: none; overflow: hidden; mix-blend-mode: multiply; }
.dg-stage-transition span, .dg-stage-transition i, .dg-stage-transition b { position: absolute; inset: -18% -34%; transform: translateX(var(--transition-x, -78%)) rotate(-9deg); border-radius: 999px; background: linear-gradient(90deg, transparent 0%, rgba(20,184,166,.06) 20%, rgba(37,99,235,.18) 48%, rgba(245,158,11,.14) 68%, transparent 100%); filter: blur(.2px); }
.dg-stage-transition i { inset: -10% -44%; transform: translateX(var(--transition-x-alt, -86%)) rotate(7deg); background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,.08) 35%, rgba(14,165,233,.22) 52%, transparent 74%); }
.dg-stage-transition b { inset: 45% -34% 38%; transform: translateX(var(--transition-x-line, -74%)) rotate(0deg); background: linear-gradient(90deg, transparent 0%, rgba(15,118,110,.2) 45%, transparent 75%); box-shadow: 0 0 24px rgba(15,118,110,.2); }
.dg-stage-transition strong { position: absolute; left: 50%; bottom: 56px; transform: translateX(-50%); min-width: 120px; max-width: 360px; border: 1px solid rgba(15,118,110,.22); border-radius: 999px; padding: 8px 18px; background: rgba(255,255,255,.82); color: #0f766e; font-size: 14px; font-weight: 950; text-align: center; box-shadow: 0 14px 32px rgba(15,23,42,.12); }
.dg-stage-element { position: absolute; overflow: visible; transform-origin: center; animation: dg-stage-in .45s cubic-bezier(.16,1,.3,1) both; pointer-events: none; }
.dg-stage-element-content { position: relative; width: 100%; height: 100%; }
.dg-stage-element.is-timeline-hidden, .dg-stage-lines .is-timeline-hidden { opacity: 0; }
.dg-stage-element.is-timeline-visible, .dg-stage-lines .is-timeline-visible { transition: opacity .28s ease; }
.dg-stage-element.is-timeline-active { filter: drop-shadow(0 16px 30px rgba(15,23,42,.16)); }
.dg-stage-element[data-layer-state="current"] { filter: drop-shadow(0 18px 34px rgba(15,23,42,.18)); }
.dg-stage-lines [data-layer-state="current"] .dg-stage-line-path { filter: drop-shadow(0 0 16px currentColor); }
.dg-stage-element[data-layer-state="past"] { opacity: .26; transform: translateY(5px) scale(.988); filter: saturate(.62); transition: opacity .42s ease, filter .42s ease, transform .42s ease; }
.dg-stage-element[data-layer-state="next"] { opacity: .18; transform: translateY(6px) scale(.985); filter: saturate(.5); transition: opacity .42s ease, filter .42s ease, transform .42s ease; }
.dg-stage-element[data-layer-state="distant-past"],
.dg-stage-element[data-layer-state="future"] { opacity: 0; transform: translateY(8px) scale(.985); filter: saturate(.45); transition: opacity .42s ease, filter .42s ease, transform .42s ease; }
.dg-stage-lines [data-layer-state="past"] { opacity: .26; transition: opacity .42s ease; }
.dg-stage-lines [data-layer-state="next"] { opacity: .18; transition: opacity .42s ease; }
.dg-stage-lines [data-layer-state="distant-past"],
.dg-stage-lines [data-layer-state="future"] { opacity: 0; transition: opacity .42s ease; }
.dg-stage-element-text[data-layer-state="future"],
.dg-stage-element-text[data-layer-state="distant-past"] { opacity: 0; }
.dg-stage-element[data-layer-state="current"].is-active { transform: scale(1.012); }
.dg-stage-page-chrome { position: absolute; left: 60px; bottom: 52px; z-index: 57; display: inline-flex; align-items: center; gap: 8px; max-width: 420px; border: 1px solid rgba(15,118,110,.22); border-radius: 999px; padding: 7px 14px; background: rgba(255,255,255,.82); box-shadow: 0 14px 30px rgba(15,23,42,.1); color: #0f766e; pointer-events: none; }
.dg-stage-page-chrome span { border-radius: 999px; padding: 3px 8px; background: #0f766e; color: #fff; font-size: 10px; font-weight: 950; letter-spacing: .02em; }
.dg-stage-page-chrome strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 950; }
.dg-stage-phase-rail { position: absolute; right: 50px; top: 48px; z-index: 57; display: flex; gap: 7px; pointer-events: none; }
.dg-stage-phase-rail span { position: relative; width: 9px; height: 9px; border-radius: 999px; background: rgba(148,163,184,.36); box-shadow: inset 0 0 0 1px rgba(255,255,255,.78); }
.dg-stage-phase-rail span.is-past { background: rgba(15,118,110,.52); }
.dg-stage-phase-rail span.is-current { width: 34px; background: rgba(15,118,110,.2); overflow: hidden; }
.dg-stage-phase-rail span.is-current::after { content: ""; position: absolute; inset: 0; transform: scaleX(var(--phase-progress, .1)); transform-origin: left center; border-radius: inherit; background: #0f766e; }
.dg-stage-track-fade { animation-name: dg-stage-fade; }
.dg-stage-track-rise { animation-name: dg-stage-in; }
.dg-stage-track-scale { animation-name: dg-stage-pop; }
.dg-stage-track-draw { animation-name: dg-stage-line-draw; }
.dg-stage-track-flow { animation-name: dg-stage-flow-pulse; animation-direction: alternate; }
.dg-stage-track-pulse { animation-name: dg-stage-active-pulse; animation-direction: alternate; }
.dg-stage-track-metric { animation-name: dg-stage-metric-rise; }
.dg-stage-element.is-active { filter: drop-shadow(0 16px 30px rgba(15,23,42,.16)); }
.dg-stage-element.is-active::after { content: ""; position: absolute; inset: -6px; border: 2px solid rgba(20,184,166,.72); border-radius: 14px; pointer-events: none; animation: dg-stage-active-ring 1.15s ease-in-out infinite; }
.dg-stage-text-content { box-sizing: border-box; width: 100%; height: 100%; padding: 2px 6px; display: block; overflow: hidden; font-size: var(--dg-stage-fit-font-size, 16px); line-height: var(--dg-stage-fit-line-height, 1.22); }
.dg-stage-text-content :where(h1,h2,h3,h4,h5,h6,p,span,strong,em,small) { margin: 0 !important; letter-spacing: 0; max-width: 100%; overflow-wrap: anywhere; }
.dg-stage-element-text[data-animation-role="title"] .dg-stage-text-content { display: grid; align-items: center; justify-items: start; }
.dg-stage-element-text[data-animation-role="subtitle"] .dg-stage-text-content { display: grid; align-items: center; }
.dg-stage-element-text[data-animation-role="step"] .dg-stage-text-content,
.dg-stage-element-text[data-animation-role="metric"] .dg-stage-text-content,
.dg-stage-element-text[data-animation-role="model"] .dg-stage-text-content,
.dg-stage-element-text[data-animation-role="diagram"] .dg-stage-text-content,
.dg-stage-element-text[data-animation-role="caption"] .dg-stage-text-content { display: grid; align-items: center; justify-items: center; text-align: center; }
.dg-stage-element-text[data-animation-role="step"] .dg-stage-text-content :where(p,span,strong,em,small),
.dg-stage-element-text[data-animation-role="metric"] .dg-stage-text-content :where(p,span,strong,em,small),
.dg-stage-element-text[data-animation-role="model"] .dg-stage-text-content :where(p,span,strong,em,small),
.dg-stage-element-text[data-animation-role="diagram"] .dg-stage-text-content :where(p,span,strong,em,small),
.dg-stage-element-text[data-animation-role="caption"] .dg-stage-text-content :where(p,span,strong,em,small) { text-align: center !important; }
.dg-stage-text-content.is-fit-scaled :where(h1,h2,h3,h4,h5,h6,p,span,strong,em,small) { line-height: var(--dg-stage-fit-line-height, 1.22) !important; }
.dg-stage-text-content[data-text-max-lines="1"] :where(h1,h2,h3,h4,h5,h6,p,span,strong,em,small) { white-space: nowrap; overflow-wrap: normal; word-break: keep-all; }
.dg-stage-text-content.is-fit-clamped { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: var(--dg-stage-fit-lines, 2); align-content: initial; }
.dg-stage-text-content[data-text-max-lines="1"].is-fit-clamped { display: grid; align-items: center; -webkit-line-clamp: initial; }
.dg-stage-text-content.is-overflowing { outline: 2px dashed rgba(220,38,38,.72); outline-offset: -3px; }
.dg-stage-text-content strong { font-weight: 850; }
.dg-stage-text-content.is-caption-updated { display: grid; align-items: center; animation: dg-stage-caption-update .28s ease both; }
.dg-stage-countup-badge { position: absolute; right: -8px; top: -12px; z-index: 3; min-width: 42px; border: 1px solid rgba(20,184,166,.3); border-radius: 999px; padding: 4px 8px; background: rgba(240,253,250,.96); color: #0f766e; font-size: 12px; font-weight: 950; text-align: center; box-shadow: 0 10px 22px rgba(15,23,42,.12); animation: dg-stage-count-up .32s ease both; }
.dg-stage-shape-svg, .dg-stage-media-element { width: 100%; height: 100%; display: block; }
.dg-stage-shape-svg text { font-size: 18px; font-weight: 950; letter-spacing: 0; pointer-events: none; }
.dg-stage-image-shell { position: relative; display: block; width: 100%; height: 100%; }
.dg-stage-image-mask { position: absolute; inset: 0; opacity: .26; mix-blend-mode: multiply; pointer-events: none; }
.dg-stage-media-element { border-radius: 8px; object-fit: cover; background: #0f172a; }
.dg-stage-video-shell { position: relative; width: 100%; height: 100%; border-radius: 8px; overflow: hidden; background: #0f172a; }
.dg-stage-video-shell.is-placeholder { display: grid; place-items: center; background: linear-gradient(135deg, #0f172a, #164e63); }
.dg-stage-video-shell.is-placeholder img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: .42; }
.dg-stage-video-shell span { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); display: grid; place-items: center; width: 52px; height: 52px; border-radius: 999px; background: rgba(255,255,255,.92); color: #0f766e; font-size: 11px; font-weight: 950; box-shadow: 0 14px 32px rgba(15,23,42,.28); }
.dg-stage-bar-chart { width: 100%; height: 100%; display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; align-items: end; gap: 10px; padding: 18px 16px 28px; border: 1px solid rgba(148,163,184,.24); border-radius: 10px; background: rgba(255,255,255,.88); }
.dg-stage-bar-chart span { position: relative; height: 100%; display: grid; align-items: end; justify-items: center; }
.dg-stage-bar-chart b { display: block; width: min(44px, 70%); min-height: 8px; border-radius: 10px 10px 4px 4px; box-shadow: inset 0 -12px 20px rgba(255,255,255,.18), 0 12px 24px rgba(15,23,42,.12); animation: dg-stage-metric-fill .72s cubic-bezier(.16,1,.3,1) both; }
.dg-stage-bar-chart em { position: absolute; left: 50%; bottom: -22px; transform: translateX(-50%); color: #475569; font-size: 11px; font-style: normal; font-weight: 850; white-space: nowrap; }
.dg-stage-chart { width: 100%; height: 100%; display: block; border: 1px solid rgba(148,163,184,.24); border-radius: 10px; background: rgba(255,255,255,.88); }
.dg-stage-chart polyline { stroke-dasharray: 900; stroke-dashoffset: 900; animation: dg-stage-chart-draw .9s cubic-bezier(.16,1,.3,1) forwards; }
.dg-stage-chart circle { filter: drop-shadow(0 4px 8px rgba(15,23,42,.18)); animation: dg-stage-pop .55s cubic-bezier(.16,1,.3,1) both; }
.dg-stage-gauge text { fill: #0f766e; font-size: 34px; font-weight: 950; dominant-baseline: middle; }
.dg-stage-pie path { filter: drop-shadow(0 8px 14px rgba(15,23,42,.16)); transform-origin: center; animation: dg-stage-pop .5s cubic-bezier(.16,1,.3,1) both; }
.dg-stage-pie text { fill: #0f172a; font-size: 18px; font-weight: 950; dominant-baseline: middle; }
.dg-stage-table { --dg-stage-table-accent: #0f766e; --dg-stage-table-accent-dark: #115e59; --dg-stage-table-accent-light: #ecfdf5; --dg-stage-table-border: 1px solid #e2e8f0; width: 100%; height: 100%; border-collapse: separate; border-spacing: 0; overflow: hidden; border: 1px solid rgba(15,118,110,.18); border-radius: 10px; background: rgba(255,255,255,.92); table-layout: fixed; }
.dg-stage-table th, .dg-stage-table td { padding: 8px 10px; border-right: var(--dg-stage-table-border); border-bottom: var(--dg-stage-table-border); color: #26394f; font-size: 13px; text-align: center; vertical-align: middle; overflow: hidden; text-overflow: ellipsis; white-space: normal; overflow-wrap: anywhere; }
.dg-stage-table th { background: var(--dg-stage-table-accent-light); color: var(--dg-stage-table-accent); font-size: 12px; font-weight: 950; }
.dg-stage-table.has-theme { border-color: color-mix(in srgb, var(--dg-stage-table-accent) 24%, transparent); }
.dg-stage-table.has-theme th { background: var(--dg-stage-table-accent); color: #fff; }
.dg-stage-table tr > :last-child { border-right: 0; }
.dg-stage-table tr:last-child td { border-bottom: 0; }
.dg-stage-table tr.is-row-visible { animation: dg-stage-row-reveal .32s ease both; }
.dg-stage-table tr.is-row-pending { opacity: 0; transform: translateY(6px); visibility: collapse; }
.dg-stage-table tr.is-row-pending td { padding-top: 0; padding-bottom: 0; border-bottom-color: transparent; }
.dg-stage-table-deck { position: relative; width: 100%; height: 100%; display: grid; grid-template-rows: minmax(0, 1fr) auto; gap: 6px; border: 1px solid rgba(15,118,110,.18); border-radius: 10px; background: rgba(255,255,255,.9); padding: 6px; box-sizing: border-box; }
.dg-stage-table-deck .dg-stage-table { height: 100%; border-radius: 8px; }
.dg-stage-table-deck .dg-stage-table th,
.dg-stage-table-deck .dg-stage-table td { padding: 7px 8px; font-size: 12px; }
.dg-stage-table-deck-nav { display: flex; justify-content: center; gap: 5px; height: 8px; }
.dg-stage-table-deck-nav span { width: 7px; height: 7px; border-radius: 999px; background: rgba(148,163,184,.45); }
.dg-stage-table-deck-nav span.is-current { width: 22px; background: #0f766e; }
.dg-stage-latex { width: 100%; height: 100%; display: grid; place-items: center; border: 1px solid rgba(245,158,11,.28); border-radius: 10px; background: #fff7ed; color: #9a3412; font-size: 28px; font-weight: 900; overflow: hidden; padding: 12px; }
.dg-stage-code { width: 100%; height: 100%; margin: 0; overflow: hidden; border: 1px solid rgba(15,23,42,.15); border-radius: 10px; background: #0f172a; color: #d1fae5; padding: 12px; font: 13px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace; }
.dg-stage-code code { display: grid; gap: 1px; white-space: pre-wrap; }
.dg-stage-code span { position: relative; min-height: 1.35em; padding-left: 34px; }
.dg-stage-code span::before { content: attr(data-line); position: absolute; left: 0; color: rgba(148,163,184,.72); font-size: 11px; }
.dg-stage-generic-element { width: 100%; height: 100%; display: grid; place-items: center; border: 1px solid rgba(148,163,184,.4); border-radius: 8px; background: rgba(255,255,255,.88); color: #475569; font-size: 13px; font-weight: 800; }
.dg-stage-highlight { position: absolute; z-index: 60; pointer-events: none; border: 3px solid var(--highlight-color, #f59e0b); border-radius: 14px; box-shadow: 0 0 0 8px color-mix(in srgb, var(--highlight-color, #f59e0b) 20%, transparent), 0 0 30px color-mix(in srgb, var(--highlight-color, #f59e0b) 38%, transparent); animation: dg-stage-active-pulse 1.2s ease-in-out infinite; }
.dg-stage-spotlight { position: absolute; inset: 0; z-index: 58; display: block; width: 100%; height: 100%; pointer-events: none; }
.dg-stage-spotlight-halo { stroke: var(--spotlight-color, #14b8a6); stroke-width: 12; opacity: .28; filter: drop-shadow(0 0 20px color-mix(in srgb, var(--spotlight-color, #14b8a6) 56%, transparent)); }
.dg-stage-spotlight-ring { stroke: rgba(255,255,255,.94); stroke-width: 3; filter: drop-shadow(0 0 14px rgba(255,255,255,.76)); }
.dg-stage-laser-beam { position: absolute; inset: 0; z-index: 61; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
.dg-stage-laser-beam line { stroke: var(--laser-color, #ef4444); stroke-width: 4; stroke-linecap: round; filter: drop-shadow(0 0 10px var(--laser-color, #ef4444)); }
.dg-stage-laser-frame { position: absolute; z-index: 61; pointer-events: none; border: 3px solid var(--laser-color, #ef4444); border-radius: 16px; box-shadow: 0 0 0 7px color-mix(in srgb, var(--laser-color, #ef4444) 16%, transparent), 0 0 34px color-mix(in srgb, var(--laser-color, #ef4444) 38%, transparent); }
.dg-stage-laser { position: absolute; z-index: 62; width: 18px; height: 18px; margin: -9px 0 0 -9px; pointer-events: none; border-radius: 999px; background: var(--laser-color, #ef4444); box-shadow: 0 0 0 7px color-mix(in srgb, var(--laser-color, #ef4444) 18%, transparent), 0 0 28px var(--laser-color, #ef4444); transform-origin: center; will-change: transform, opacity; }
.dg-stage-laser i, .dg-stage-laser b { position: absolute; inset: -10px; border-radius: inherit; border: 2px solid var(--laser-color, #ef4444); animation: dg-stage-laser-ping .78s ease-out infinite; }
.dg-stage-laser b { inset: -18px; opacity: .48; animation-delay: .16s; }
.dg-stage-laser-pin { position: absolute; z-index: 63; width: 30px; height: 30px; margin: -15px 0 0 -15px; pointer-events: none; border: 2px solid var(--laser-color, #ef4444); border-radius: 999px; box-shadow: inset 0 0 0 5px color-mix(in srgb, var(--laser-color, #ef4444) 22%, transparent), 0 0 24px color-mix(in srgb, var(--laser-color, #ef4444) 50%, transparent); animation: dg-stage-laser-pin 1.1s ease-in-out infinite; }
.dg-stage-callout { position: absolute; z-index: 64; width: 250px; max-width: calc(100% - 48px); display: grid; gap: 4px; border: 1px solid rgba(245,158,11,.36); border-radius: 8px; padding: 10px 12px; background: rgba(255,251,235,.96); color: #713f12; box-shadow: 0 18px 42px rgba(15,23,42,.16); animation: dg-stage-callout-in .24s ease both; }
.dg-stage-callout strong { font-size: 12px; }
.dg-stage-callout span { font-size: 13px; line-height: 1.45; }
@keyframes dg-stage-in { from { opacity: 0; transform: translateY(10px) scale(.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes dg-stage-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes dg-stage-line-draw { from { stroke-dasharray: 1 18; opacity: .25; } to { stroke-dasharray: 12 0; opacity: 1; } }
@keyframes dg-stage-line-flow { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -44; } }
@keyframes dg-stage-flow-pulse { from { opacity: .62; transform: translateY(0); } to { opacity: 1; transform: translateY(-3px); } }
@keyframes dg-stage-active-ring { 0%,100% { opacity: .35; transform: scale(1); } 50% { opacity: .9; transform: scale(1.025); } }
@keyframes dg-stage-active-pulse { 0%,100% { transform: scale(1); opacity: .9; } 50% { transform: scale(1.018); opacity: 1; } }
@keyframes dg-stage-metric-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes dg-stage-metric-fill { from { height: 0; opacity: .35; } to { opacity: 1; } }
@keyframes dg-stage-chart-draw { to { stroke-dashoffset: 0; } }
@keyframes dg-stage-pop { from { transform: scale(.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes dg-stage-row-reveal { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
@keyframes dg-stage-caption-update { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
@keyframes dg-stage-count-up { from { opacity: 0; transform: translateY(5px) scale(.92); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes dg-stage-laser-ping { from { opacity: .8; transform: scale(.55); } to { opacity: 0; transform: scale(1.45); } }
@keyframes dg-stage-laser-pin { 0%,100% { opacity: .92; transform: scale(.92); } 50% { opacity: 1; transform: scale(1.08); } }
@keyframes dg-stage-callout-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) {
  .dg-stage-line-path,
  .dg-stage-whiteboard-line,
  .dg-stage-transition span,
  .dg-stage-transition i,
  .dg-stage-transition b,
  .dg-stage-element,
  .dg-stage-highlight,
  .dg-stage-laser-beam line,
  .dg-stage-laser i,
  .dg-stage-laser b,
  .dg-stage-laser-pin,
  .dg-stage-table tr.is-row-visible,
  .dg-stage-text-content.is-caption-updated,
  .dg-stage-countup-badge,
  .dg-stage-callout { animation-duration: .01ms !important; animation-iteration-count: 1 !important; }
}
`;
