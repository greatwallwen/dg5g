import { useEffect, useRef } from 'react';

// Shared themed backdrop for the board-style games (memory match, evidence assembly).
// A calm engineering grid with a drifting scan glow + pulsing nodes — atmosphere
// without competing with the foreground cards. Ticker-driven, mounts once.
// Renders `.eg-pixi-canvas` so canvas-presence audits keep passing.
export function BoardCanvas() {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let app: any;
    let destroyed = false;
    import('pixi.js')
      .then(async (PIXI) => {
        if (!hostRef.current || destroyed) return;
        hostRef.current.innerHTML = '';
        app = new PIXI.Application();
        await app.init({ width: 960, height: 540, background: '#061626', antialias: true, resolution: Math.min(window.devicePixelRatio || 1, 2) });
        if (!hostRef.current || destroyed) { app.destroy(true); return; }
        hostRef.current.appendChild(app.canvas);
        drawBoard(PIXI, app);
      })
      .catch(() => { if (hostRef.current) hostRef.current.dataset.fallback = 'true'; });
    return () => { destroyed = true; app?.destroy(true, { children: true }); };
  }, []);

  return <div className="eg-pixi-canvas" ref={hostRef} aria-hidden="true" />;
}

function drawBoard(PIXI: any, app: any) {
  const w = 960;
  const h = 540;
  const stage = app.stage;

  const grid = new PIXI.Graphics();
  grid.rect(0, 0, w, h).fill(0x061626);
  for (let x = 0; x <= w; x += 48) grid.moveTo(x, 0).lineTo(x, h).stroke({ width: 1, color: 0x0e2c44, alpha: 0.5 });
  for (let y = 0; y <= h; y += 48) grid.moveTo(0, y).lineTo(w, y).stroke({ width: 1, color: 0x0e2c44, alpha: 0.5 });
  stage.addChild(grid);

  // pulsing anchor nodes
  const nodes = Array.from({ length: 5 }, (_, i) => ({ x: (w / 6) * (i + 1), y: h * (0.3 + 0.4 * ((i % 2) ? 1 : 0)), phase: i * 1.3 }));
  const nodeG = new PIXI.Graphics();
  stage.addChild(nodeG);

  // drifting scan glow band
  const glow = new PIXI.Graphics();
  glow.rect(0, 0, 220, h).fill({ color: 0x0ea5b7, alpha: 0.08 });
  glow.x = -220;
  stage.addChild(glow);

  let t = 0;
  const tick = (ticker: any) => {
    const dt = typeof ticker?.deltaTime === 'number' ? ticker.deltaTime : 1;
    t += 0.03 * dt;
    glow.x += 1.4 * dt;
    if (glow.x > w) glow.x = -220;
    nodeG.clear();
    for (const n of nodes) {
      const r = 5 + 2.5 * (1 + Math.sin(t + n.phase));
      nodeG.circle(n.x, n.y, r).fill({ color: 0x22d3ee, alpha: 0.28 });
      nodeG.circle(n.x, n.y, 2).fill(0x67e8f9);
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
