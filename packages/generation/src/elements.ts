import type {
  AnimationGenericElement,
  AnimationLineElement,
  AnimationPPTElement,
  AnimationShapeElement,
  AnimationTextElement,
} from '@dgbook/animation';

export const RECT_PATH = 'M 0 0 L 1 0 L 1 1 L 0 1 Z';

export function text(
  id: string,
  left: number,
  top: number,
  width: number,
  height: number,
  content: string,
  options: Partial<AnimationTextElement> = {},
): AnimationTextElement {
  return {
    id,
    type: 'text',
    left,
    top,
    width,
    height,
    content,
    defaultFontName: 'Microsoft YaHei',
    defaultColor: '#0f172a',
    rotate: 0,
    lineHeight: 1.18,
    fit: 'scale',
    minFontSize: 10,
    maxLines: 2,
    ...options,
  };
}

export function shape(
  id: string,
  left: number,
  top: number,
  width: number,
  height: number,
  fill: string,
  options: Partial<AnimationShapeElement> & { outlineColor?: string; radius?: number } = {},
): AnimationShapeElement {
  const { outlineColor, radius: _radius, ...rest } = options;
  return {
    id,
    type: 'shape',
    left,
    top,
    width,
    height,
    rotate: 0,
    path: RECT_PATH,
    viewBox: [1, 1],
    fill,
    fixedRatio: false,
    outline: { width: 1, style: 'solid', color: outlineColor ?? '#d8e0ea' },
    ...rest,
  };
}

export function line(
  id: string,
  start: [number, number],
  end: [number, number],
  color = '#0f766e',
  curve?: [number, number],
): AnimationLineElement {
  const left = Math.min(start[0], end[0], curve?.[0] ?? start[0]);
  const top = Math.min(start[1], end[1], curve?.[1] ?? start[1]);
  return {
    id,
    type: 'line',
    left,
    top,
    width: 3,
    height: 3,
    rotate: 0,
    start: [start[0] - left, start[1] - top],
    end: [end[0] - left, end[1] - top],
    color,
    style: 'solid',
    points: ['', 'arrow'],
    ...(curve ? { curve: [curve[0] - left, curve[1] - top] as [number, number] } : {}),
  };
}

export function chart(id: string, left: number, top: number, width: number, height: number): AnimationGenericElement {
  return {
    id,
    type: 'chart',
    left,
    top,
    width,
    height,
    rotate: 0,
    role: 'metric',
    chartType: 'bar',
    series: [
      { label: '覆盖', value: 76, color: '#0f766e' },
      { label: '质量', value: 68, color: '#2563eb' },
      { label: '验证', value: 84, color: '#f59e0b' },
    ],
  };
}

export function table(id: string, left: number, top: number, width: number, height: number): AnimationGenericElement {
  return {
    id,
    type: 'table',
    left,
    top,
    width,
    height,
    rotate: 0,
    role: 'metric',
    columns: [
      { key: 'item', label: '对象' },
      { key: 'value', label: '证据' },
    ],
    rows: [
      { item: '输入', value: '工参/日志' },
      { item: '判断', value: '指标/原因值' },
    ],
  };
}

export function normalizeElement(element: AnimationPPTElement, fallbackId: string): AnimationPPTElement {
  return {
    ...element,
    id: element.id || fallbackId,
    left: clampNumber(element.left, 0, 980),
    top: clampNumber(element.top, 0, 542),
    width: clampNumber(element.width, 1, 1000),
    height: clampNumber(element.height, 1, 562),
    rotate: element.rotate ?? 0,
  } as AnimationPPTElement;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
