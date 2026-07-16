import type { IconName } from '@/ui/foundation/icons';

export type AnnotatedEngineeringFigureKind = 'topology' | 'antenna' | 'complaint';

export interface FigureObject {
  id: string;
  label: string;
  detail: string;
  icon: IconName;
  x: number;
  y: number;
  width: number;
  height: number;
  tone: 'cyan' | 'green' | 'amber';
}

export interface FigureConnector {
  id: string;
  sourceId: string;
  targetId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface FigureLabel {
  id: string;
  title: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  targetX: number;
  targetY: number;
}

export interface EngineeringFigureSpec {
  title: string;
  description: string;
  reasoning: string;
  objects: FigureObject[];
  connectors: FigureConnector[];
  labels: FigureLabel[];
}

export function pointTouchesBox(
  x: number,
  y: number,
  box: Pick<FigureObject, 'x' | 'y' | 'width' | 'height'>,
): boolean {
  const onHorizontal = (y === box.y || y === box.y + box.height) && x >= box.x && x <= box.x + box.width;
  const onVertical = (x === box.x || x === box.x + box.width) && y >= box.y && y <= box.y + box.height;
  return onHorizontal || onVertical;
}

export function boxesOverlap(
  left: Pick<FigureLabel, 'x' | 'y' | 'width' | 'height'>,
  right: Pick<FigureLabel, 'x' | 'y' | 'width' | 'height'>,
): boolean {
  return left.x < right.x + right.width && left.x + left.width > right.x
    && left.y < right.y + right.height && left.y + left.height > right.y;
}

export function object(
  id: string,
  labelText: string,
  detail: string,
  icon: IconName,
  x: number,
  y: number,
  width: number,
  height: number,
  tone: FigureObject['tone'],
): FigureObject {
  return { id, label: labelText, detail, icon, x, y, width, height, tone };
}

export function connector(
  id: string,
  sourceId: string,
  targetId: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): FigureConnector {
  return { id, sourceId, targetId, x1, y1, x2, y2 };
}

export function label(
  id: string,
  title: string,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  targetX: number,
  targetY: number,
): FigureLabel {
  return { id, title, text, x, y, width, height, targetX, targetY };
}
