import type { AnimationLineElement, AnimationPPTElement } from '@dgbook/animation';

export type StageBox = {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

export function getElementBox(element: AnimationPPTElement): StageBox {
  if (element.type !== 'line') {
    return toBox(element.id, element.left, element.top, element.width, element.height);
  }
  const start = getLinePoint(element, element.start);
  const end = getLinePoint(element, element.end);
  const left = Math.min(start[0], end[0]);
  const top = Math.min(start[1], end[1]);
  return toBox(
    element.id,
    left,
    top,
    Math.max(24, Math.abs(end[0] - start[0])),
    Math.max(24, Math.abs(end[1] - start[1])),
  );
}

export function getLinePath(element: AnimationLineElement): string {
  const start = getLinePoint(element, element.start);
  const end = getLinePoint(element, element.end);
  if (element.cubic) {
    const c1 = getLinePoint(element, element.cubic[0]);
    const c2 = getLinePoint(element, element.cubic[1]);
    return `M ${start[0]} ${start[1]} C ${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${end[0]} ${end[1]}`;
  }
  if (element.curve) {
    const control = getLinePoint(element, element.curve);
    return `M ${start[0]} ${start[1]} Q ${control[0]} ${control[1]} ${end[0]} ${end[1]}`;
  }
  if (element.broken2) {
    const control = getLinePoint(element, element.broken2);
    return `M ${start[0]} ${start[1]} L ${control[0]} ${start[1]} L ${control[0]} ${control[1]} L ${end[0]} ${end[1]}`;
  }
  if (element.broken) {
    const control = getLinePoint(element, element.broken);
    return `M ${start[0]} ${start[1]} L ${control[0]} ${control[1]} L ${end[0]} ${end[1]}`;
  }
  return `M ${start[0]} ${start[1]} L ${end[0]} ${end[1]}`;
}

export function getLinePointAtProgress(element: AnimationLineElement, progress: number): [number, number] {
  const t = Math.max(0, Math.min(1, progress));
  const start = getLinePoint(element, element.start);
  const end = getLinePoint(element, element.end);
  if (element.cubic) {
    const c1 = getLinePoint(element, element.cubic[0]);
    const c2 = getLinePoint(element, element.cubic[1]);
    return [
      cubic(start[0], c1[0], c2[0], end[0], t),
      cubic(start[1], c1[1], c2[1], end[1], t),
    ];
  }
  if (element.curve) {
    const control = getLinePoint(element, element.curve);
    return [
      quadratic(start[0], control[0], end[0], t),
      quadratic(start[1], control[1], end[1], t),
    ];
  }
  if (element.broken || element.broken2) {
    const points = brokenLinePoints(element, start, end);
    return pointOnPolyline(points, t);
  }
  return [lerp(start[0], end[0], t), lerp(start[1], end[1], t)];
}

export function getLineLength(element: AnimationLineElement): number {
  const samples = element.cubic || element.curve ? 32 : 8;
  let total = 0;
  let previous = getLinePointAtProgress(element, 0);
  for (let index = 1; index <= samples; index++) {
    const point = getLinePointAtProgress(element, index / samples);
    total += distance(previous, point);
    previous = point;
  }
  return Math.max(1, total);
}

export function lineDash(style?: 'solid' | 'dashed' | 'dotted'): string | undefined {
  if (style === 'dashed') return '12 10';
  if (style === 'dotted') return '2 9';
  return undefined;
}

export function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(value);
  return value.replace(/["\\]/g, '\\$&');
}

function getLinePoint(element: AnimationLineElement, point: [number, number]): [number, number] {
  return [element.left + point[0], element.top + point[1]];
}

function brokenLinePoints(element: AnimationLineElement, start: [number, number], end: [number, number]): [number, number][] {
  if (element.broken2) {
    const control = getLinePoint(element, element.broken2);
    return [start, [control[0], start[1]], control, end];
  }
  if (element.broken) {
    return [start, getLinePoint(element, element.broken), end];
  }
  return [start, end];
}

function pointOnPolyline(points: [number, number][], progress: number): [number, number] {
  const lengths = points.slice(1).map((point, index) => distance(points[index]!, point));
  const total = lengths.reduce((sum, item) => sum + item, 0);
  if (total <= 0) return points[0] ?? [0, 0];
  let remaining = total * progress;
  for (let index = 0; index < lengths.length; index++) {
    const segment = lengths[index]!;
    if (remaining <= segment) {
      const from = points[index]!;
      const to = points[index + 1]!;
      const t = segment <= 0 ? 0 : remaining / segment;
      return [lerp(from[0], to[0], t), lerp(from[1], to[1], t)];
    }
    remaining -= segment;
  }
  return points[points.length - 1] ?? [0, 0];
}

function quadratic(a: number, b: number, c: number, t: number) {
  return (1 - t) ** 2 * a + 2 * (1 - t) * t * b + t ** 2 * c;
}

function cubic(a: number, b: number, c: number, d: number, t: number) {
  return (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t ** 2 * c + t ** 3 * d;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function distance(a: [number, number], b: [number, number]) {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function toBox(id: string, left: number, top: number, width: number, height: number): StageBox {
  return {
    id,
    left,
    top,
    width,
    height,
    centerX: left + width / 2,
    centerY: top + height / 2,
  };
}
