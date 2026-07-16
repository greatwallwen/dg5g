'use client';

import { BaseEdge, EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from '@xyflow/react';
import type { SemanticEdgeKind } from '@/platform/models';

export type CapabilityFlowEdgeData = Record<string, unknown> & {
  label: string;
  kind: SemanticEdgeKind;
};

export type CapabilityFlowEdge = Edge<CapabilityFlowEdgeData, 'capability'>;

const edgeColors: Record<SemanticEdgeKind, string> = {
  prerequisite: 'var(--graphic-line)',
  evidence: 'var(--graphic-evidence)',
  output: 'var(--graphic-output)',
  review: 'var(--graphic-review)',
  assessment: 'var(--graphic-assessment)',
};

export function CapabilityEdge(props: EdgeProps<CapabilityFlowEdge>) {
  const [edgePath, labelX, labelY] = getBezierPath(props);
  const color = edgeColors[props.data?.kind ?? 'prerequisite'];
  return (
    <>
      <BaseEdge path={edgePath} markerEnd={props.markerEnd} style={{ stroke: color, strokeWidth: 2.4 }} />
      {props.data?.label ? (
        <EdgeLabelRenderer>
          <span
            className="capability-edge-label"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, borderColor: color, color }}
          >
            {props.data.label}
          </span>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
