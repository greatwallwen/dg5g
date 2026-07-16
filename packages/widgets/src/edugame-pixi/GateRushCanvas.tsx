import { useEffect, useRef } from 'react';

// Forward-rushing track backdrop for 闸门冲刺 (gate rush). Perspective lane edges
// converge to a vanishing point while gate rungs scroll toward the viewer, giving
// a continuous sprint feel. Ticker-driven, mounts once. Renders `.eg-pixi-canvas`
// so canvas-presence audits keep passing.
export function GateRushCanvas() {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let app: any;
    let destroyed = false;
    import('pixi.js')
      .then(async (PIXI) => {
        if (!hostRef.current || destroyed) return;
        hostRef.current.innerHTML = '';
        app = new PIXI.Application();
        await app.init({ width: 960, height: 540, background: '#04101f', antialias: true, resolution: Math.min(window.devicePixelRatio || 1, 2) });
        if (!hostRef.current || destroyed) { app.destroy(true); return; }
        hostRef.current.appendChild(app.canvas);
        drawTrack(PIXI, app);
      })
      .catch(() => { if (hostRef.current) hostRef.current.dataset.fallback = 'true'; });
    return () => { destroyed = true; app?.destroy(true, { children: true }); };
  }, []);

  return <div className="eg-pixi-canvas" ref={hostRef} aria-hidden="true" />;
}

function drawTrack(PIXI: any, app: any) {
  const w = 960;
  const h = 540;
  const vpx = w / 2;
  const vpy = h * 0.28; // vanishing point
  const stage = app.stage;

  const bg = new PIXI.Graphics();
  bg.rect(0, 0, w, h).fill(0x04101f);
  // glow horizon
  bg.ellipse(vpx, vpy, 320, 70).fill({ color: 0x0b3a55, alpha: 0.5 });
  // lane edges
  bg.moveTo(vpx, vpy).lineTo(-40, h).stroke({ width: 3, color: 0x22d3ee, alpha: 0.55 });
  bg.moveTo(vpx, vpy).lineTo(w + 40, h).stroke({ width: 3, color: 0x22d3ee, alpha: 0.55 });
  // center + inner lanes
  for (const off of [-0.34, 0, 0.34]) {
    bg.moveTo(vpx, vpy).lineTo(vpx + off * w, h).stroke({ width: 1, color: 0x14506b, alpha: 0.55 });
  }
  stage.addChild(bg);

  // scrolling gate rungs (perspective: progress 0 at VP -> 1 at viewer)
  const rungs = new PIXI.Graphics();
  stage.addChild(rungs);
  const count = 7;
  const progress = Array.from({ length: count }, (_, i) => i / count);
  // speed streaks
  const streaks = new PIXI.Graphics();
  stage.addChild(streaks);
  let streakPhase = 0;

  const tick = (ticker: any) => {
    const dt = typeof ticker?.deltaTime === 'number' ? ticker.deltaTime : 1;
    rungs.clear();
    for (let i = 0; i < count; i += 1) {
      let p = (progress[i] ?? 0) + 0.006 * dt;
      if (p > 1) p -= 1;
      progress[i] = p;
      const ease = p * p; // accelerate toward viewer
      const y = vpy + (h - vpy) * ease;
      const halfW = (w * 0.5) * (0.06 + 0.94 * ease);
      const alpha = 0.18 + 0.55 * ease;
      rungs.moveTo(vpx - halfW, y).lineTo(vpx + halfW, y).stroke({ width: 1 + 3 * ease, color: 0x38bdf8, alpha });
    }
    streakPhase += 0.05 * dt;
    streaks.clear();
    for (let i = 0; i < 5; i += 1) {
      const sp = (streakPhase + i / 5) % 1;
      const y = vpy + (h - vpy) * (sp * sp);
      const x = i % 2 === 0 ? w * 0.12 : w * 0.88;
      streaks.moveTo(x, y).lineTo(x, y + 26 * sp).stroke({ width: 2, color: 0x67e8f9, alpha: 0.12 + 0.3 * sp });
    }
  };

  if (prefersReducedMotion()) tick({ deltaTime: 0 });
  else app.ticker.add(tick);
}

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  } catch {
    return false;
  }
}
