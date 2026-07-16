export interface GraphNodePointerPoint {
  id: number;
  x: number;
  y: number;
}

export function isGraphNodePointerActivation(
  start: GraphNodePointerPoint,
  end: GraphNodePointerPoint,
) {
  return start.id === end.id && Math.hypot(end.x - start.x, end.y - start.y) <= 6;
}

export function isGraphNodeKeyboardActivation(key: string) {
  return key === 'Enter' || key === ' ';
}

export function isGraphNodeSyntheticClick(detail: number) {
  return detail === 0;
}
