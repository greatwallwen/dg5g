export interface GraphRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GraphEdgePoints {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface GraphPoint {
  x: number;
  y: number;
}

export interface SemanticEdgeRoute {
  points: GraphPoint[];
}

export interface GraphLabelBox extends GraphRect {
  anchorX: number;
  anchorY: number;
}

export type SemanticZoomLevel = 'overview' | 'route' | 'detail';

export function semanticZoomLevel(scale: number): SemanticZoomLevel {
  if (scale < 0.62) return 'overview';
  if (scale < 1) return 'route';
  return 'detail';
}

export function edgeBoundaryPoints(source: GraphRect, target: GraphRect): GraphEdgePoints {
  const sourceCenter = center(source);
  const targetCenter = center(target);
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;

  if (Math.abs(dx) >= Math.abs(dy) * 1.35) {
    return {
      x1: sourceCenter.x + Math.sign(dx || 1) * source.width / 2,
      y1: sourceCenter.y,
      x2: targetCenter.x - Math.sign(dx || 1) * target.width / 2,
      y2: targetCenter.y,
    };
  }

  if (Math.abs(dy) >= Math.abs(dx) * 1.35) {
    return {
      x1: sourceCenter.x,
      y1: sourceCenter.y + Math.sign(dy || 1) * source.height / 2,
      x2: targetCenter.x,
      y2: targetCenter.y - Math.sign(dy || 1) * target.height / 2,
    };
  }

  const sourceScale = Math.min(
    source.width / 2 / Math.max(1, Math.abs(dx)),
    source.height / 2 / Math.max(1, Math.abs(dy)),
  );
  const targetScale = Math.min(
    target.width / 2 / Math.max(1, Math.abs(dx)),
    target.height / 2 / Math.max(1, Math.abs(dy)),
  );
  return {
    x1: sourceCenter.x + dx * sourceScale,
    y1: sourceCenter.y + dy * sourceScale,
    x2: targetCenter.x - dx * targetScale,
    y2: targetCenter.y - dy * targetScale,
  };
}

export function routeSemanticEdge(
  source: GraphRect,
  target: GraphRect,
  obstacles: readonly GraphRect[],
  clearance = 10,
): SemanticEdgeRoute {
  const expanded = obstacles.map((rect) => inflate(rect, clearance));
  const bounds = graphBounds([source, target, ...obstacles]);
  const xChannels = uniqueNumbers([
    bounds.x - clearance * 3,
    bounds.x + bounds.width + clearance * 3,
    ...expanded.flatMap((rect) => [rect.x - clearance, rect.x + rect.width + clearance]),
  ]);
  const yChannels = uniqueNumbers([
    bounds.y - clearance * 3,
    bounds.y + bounds.height + clearance * 3,
    ...expanded.flatMap((rect) => [rect.y - clearance, rect.y + rect.height + clearance]),
  ]);
  const candidates: GraphPoint[][] = [];

  for (const sourcePort of ports(source, clearance)) {
    for (const targetPort of ports(target, clearance)) {
      const start = sourcePort.outside;
      const end = targetPort.outside;
      candidates.push([
        sourcePort.boundary,
        start,
        { x: end.x, y: start.y },
        end,
        targetPort.boundary,
      ]);
      candidates.push([
        sourcePort.boundary,
        start,
        { x: start.x, y: end.y },
        end,
        targetPort.boundary,
      ]);
      for (const x of xChannels) {
        candidates.push([
          sourcePort.boundary,
          start,
          { x, y: start.y },
          { x, y: end.y },
          end,
          targetPort.boundary,
        ]);
      }
      for (const y of yChannels) {
        candidates.push([
          sourcePort.boundary,
          start,
          { x: start.x, y },
          { x: end.x, y },
          end,
          targetPort.boundary,
        ]);
      }
    }
  }

  const valid = candidates
    .map(simplifyOrthogonalRoute)
    .filter((points) => points.length >= 2 && routeIsClear(points, expanded))
    .sort((left, right) => routeScore(left) - routeScore(right));
  if (valid[0]) return { points: valid[0] };

  const fallback = edgeBoundaryPoints(source, target);
  return {
    points: simplifyOrthogonalRoute([
      { x: fallback.x1, y: fallback.y1 },
      { x: fallback.x1, y: fallback.y2 },
      { x: fallback.x2, y: fallback.y2 },
    ]),
  };
}

export function placeEdgeLabel(
  route: SemanticEdgeRoute,
  labelSize: Pick<GraphRect, 'width' | 'height'>,
  obstacles: readonly GraphRect[],
): GraphLabelBox {
  const candidates: GraphLabelBox[] = [];
  const segments = route.points.slice(0, -1).map((start, index) => ({
    start,
    end: route.points[index + 1],
    length: distance(start, route.points[index + 1]),
  })).sort((left, right) => right.length - left.length);
  const gap = 9;
  const offsets = [gap, 24, 42, 64, 90, 124, 164, 210];

  for (const offset of offsets) {
    for (const { start, end } of segments) {
      const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
      if (start.y === end.y) {
        candidates.push(labelBox(middle.x, middle.y - offset - labelSize.height / 2, labelSize));
        candidates.push(labelBox(middle.x, middle.y + offset + labelSize.height / 2, labelSize));
      } else {
        candidates.push(labelBox(middle.x + offset + labelSize.width / 2, middle.y, labelSize));
        candidates.push(labelBox(middle.x - offset - labelSize.width / 2, middle.y, labelSize));
      }
    }
  }

  const clear = candidates.find((candidate) => (
    obstacles.every((obstacle) => !rectsOverlap(candidate, obstacle))
    && !routeIntersectsRect(route.points, candidate)
  ));
  if (clear) return clear;

  const occupied = graphBounds([
    ...obstacles,
    ...route.points.map((point) => ({ x: point.x, y: point.y, width: 0, height: 0 })),
  ]);
  return labelBox(
    occupied.x - labelSize.width / 2 - gap,
    occupied.y - labelSize.height / 2 - gap,
    labelSize,
  );
}

function center(rect: GraphRect) {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function ports(rect: GraphRect, clearance: number) {
  const middle = center(rect);
  return [
    { boundary: { x: middle.x, y: rect.y }, outside: { x: middle.x, y: rect.y - clearance } },
    { boundary: { x: rect.x + rect.width, y: middle.y }, outside: { x: rect.x + rect.width + clearance, y: middle.y } },
    { boundary: { x: middle.x, y: rect.y + rect.height }, outside: { x: middle.x, y: rect.y + rect.height + clearance } },
    { boundary: { x: rect.x, y: middle.y }, outside: { x: rect.x - clearance, y: middle.y } },
  ];
}

function inflate(rect: GraphRect, amount: number): GraphRect {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
  };
}

function graphBounds(rects: readonly GraphRect[]): GraphRect {
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function uniqueNumbers(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function simplifyOrthogonalRoute(points: readonly GraphPoint[]): GraphPoint[] {
  const result: GraphPoint[] = [];
  for (const point of points) {
    const previous = result.at(-1);
    if (previous?.x === point.x && previous.y === point.y) continue;
    result.push(point);
    while (result.length >= 3) {
      const a = result[result.length - 3];
      const b = result[result.length - 2];
      const c = result[result.length - 1];
      if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) result.splice(result.length - 2, 1);
      else break;
    }
  }
  return result;
}

function routeIsClear(points: readonly GraphPoint[], obstacles: readonly GraphRect[]): boolean {
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (start.x !== end.x && start.y !== end.y) return false;
    if (obstacles.some((rect) => segmentIntersectsRect(start, end, rect))) return false;
  }
  return true;
}

function routeScore(points: readonly GraphPoint[]): number {
  let length = 0;
  for (let index = 0; index < points.length - 1; index += 1) length += distance(points[index], points[index + 1]);
  return length + Math.max(0, points.length - 2) * 18;
}

function distance(a: GraphPoint, b: GraphPoint): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function segmentIntersectsRect(start: GraphPoint, end: GraphPoint, rect: GraphRect): boolean {
  if (start.x === end.x) {
    return start.x > rect.x && start.x < rect.x + rect.width
      && Math.max(start.y, end.y) > rect.y && Math.min(start.y, end.y) < rect.y + rect.height;
  }
  return start.y > rect.y && start.y < rect.y + rect.height
    && Math.max(start.x, end.x) > rect.x && Math.min(start.x, end.x) < rect.x + rect.width;
}

function labelBox(anchorX: number, anchorY: number, size: Pick<GraphRect, 'width' | 'height'>): GraphLabelBox {
  return {
    x: anchorX - size.width / 2,
    y: anchorY - size.height / 2,
    width: size.width,
    height: size.height,
    anchorX,
    anchorY,
  };
}

function rectsOverlap(a: GraphRect, b: GraphRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x
    && a.y < b.y + b.height && a.y + a.height > b.y;
}

function routeIntersectsRect(points: readonly GraphPoint[], rect: GraphRect): boolean {
  for (let index = 0; index < points.length - 1; index += 1) {
    if (segmentIntersectsRect(points[index], points[index + 1], rect)) return true;
  }
  return false;
}
