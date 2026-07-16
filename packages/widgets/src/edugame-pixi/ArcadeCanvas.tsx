import { useEffect, useRef } from 'react';

// Animated radar scope backdrop for 雷达快打. A ticker-driven sweep beam rotates
// over range rings + a polar grid, so the overlaid target chips read as radar
// contacts. Mounts once (the sweep runs on its own ticker); score/combo live in
// the topbar, so prop changes do not re-init the canvas. Renders `.eg-pixi-canvas`
// so existing canvas-presence audits keep passing.
export function ArcadeCanvas() {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let app: any;
    let destroyed = false;
    import('pixi.js')
      .then(async (PIXI) => {
        if (!hostRef.current || destroyed) return;
        hostRef.current.innerHTML = '';
        app = new PIXI.Application();
        await app.init({
          width: 960,
          height: 540,
          background: '#040f1c',
          antialias: true,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
        });
        if (!hostRef.current || destroyed) {
          app.destroy(true);
          return;
        }
        hostRef.current.appendChild(app.canvas);
        drawRadar(PIXI, app);
      })
      .catch(() => {
        if (hostRef.current) hostRef.current.dataset.fallback = 'true';
      });
    return () => {
      destroyed = true;
      app?.destroy(true, { children: true });
    };
  }, []);

  return <div className="eg-pixi-canvas" ref={hostRef} aria-hidden="true" />;
}

function drawRadar(PIXI: any, app: any) {
  const w = 960;
  const h = 540;
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) / 2 - 22;
  const stage = app.stage;

  const grid = new PIXI.Graphics();
  grid.rect(0, 0, w, h).fill(0x040f1c);
  // faint scan lines
  for (let y = 14; y < h; y += 26) grid.moveTo(0, y).lineTo(w, y).stroke({ width: 1, color: 0x0b2233, alpha: 0.5 });
  // range rings
  for (const f of [0.32, 0.55, 0.78, 1]) grid.circle(cx, cy, R * f).stroke({ width: 1.4, color: 0x14506b, alpha: 0.8 });
  // polar spokes
  for (let a = 0; a < 12; a += 1) {
    const ang = (a * Math.PI) / 6;
    grid.moveTo(cx, cy).lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R).stroke({ width: 1, color: 0x0e3147, alpha: 0.6 });
  }
  grid.circle(cx, cy, 4).fill(0x38bdf8);
  stage.addChild(grid);

  // sweep beam: a fading sector + bright leading edge, rotated by the ticker.
  const beam = new PIXI.Graphics();
  const span = Math.PI / 3.2;
  const steps = 18;
  for (let i = 0; i < steps; i += 1) {
    const a0 = -span + span * (i / steps);
    const a1 = -span + span * ((i + 1) / steps);
    const alpha = 0.03 + 0.17 * (i / steps);
    beam.poly([0, 0, Math.cos(a0) * R, Math.sin(a0) * R, Math.cos(a1) * R, Math.sin(a1) * R]).fill({ color: 0x22d3ee, alpha });
  }
  beam.moveTo(0, 0).lineTo(R, 0).stroke({ width: 2, color: 0x67e8f9, alpha: 0.95 });
  beam.x = cx;
  beam.y = cy;
  stage.addChild(beam);

  if (prefersReducedMotion()) return;
  app.ticker.add((ticker: any) => {
    const dt = typeof ticker?.deltaTime === 'number' ? ticker.deltaTime : 1;
    beam.rotation += 0.016 * dt; // ~0.95 rad/s at 60fps
  });
}

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  } catch {
    return false;
  }
}
