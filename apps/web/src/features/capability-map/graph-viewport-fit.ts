export interface GraphViewportTransform {
  x: number;
  y: number;
  k: number;
}

const p1PathBounds = { x: 35, y: 430, width: 1_260, height: 650 } as const;

export function fitP1PathViewport(width: number, height: number): GraphViewportTransform {
  const k = Math.max(
    .62,
    Math.min(1.02, Math.min((width - 28) / p1PathBounds.width, (height - 28) / p1PathBounds.height)),
  );
  return {
    x: (width - p1PathBounds.width * k) / 2 - p1PathBounds.x * k,
    y: (height - p1PathBounds.height * k) / 2 - p1PathBounds.y * k,
    k,
  };
}
