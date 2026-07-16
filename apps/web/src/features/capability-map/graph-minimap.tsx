import type { CurriculumGraphNode } from '@/platform/models';

type ViewTransform = { x: number; y: number; k: number };

export function GraphMinimap({ nodes, transform, viewport }: { nodes: CurriculumGraphNode[]; transform: ViewTransform; viewport: { width: number; height: number } }) {
  const scaleX = 210 / 1560;
  const scaleY = 112 / 930;
  const viewX = Math.max(0, -transform.x / transform.k) * scaleX;
  const viewY = Math.max(0, -transform.y / transform.k) * scaleY;
  const viewWidth = Math.min(210, viewport.width / transform.k * scaleX);
  const viewHeight = Math.min(112, viewport.height / transform.k * scaleY);
  return (
    <svg aria-label="图谱迷你图" className="graph-minimap" data-graph-minimap viewBox="0 0 220 122">
      <rect className="minimap-surface" height="120" rx="5" width="218" x="1" y="1" />
      {nodes.map((node) => (
        <rect
          className={`minimap-node is-${node.kind}`}
          height={Math.max(2, node.height * scaleY)}
          key={node.id}
          width={Math.max(3, node.width * scaleX)}
          x={5 + node.x * scaleX}
          y={5 + node.y * scaleY}
        />
      ))}
      <rect className="minimap-viewport" height={Math.max(16, viewHeight)} width={Math.max(28, viewWidth)} x={5 + viewX} y={5 + viewY} />
    </svg>
  );
}

