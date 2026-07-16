import type { SemanticEdgeKind } from '@/platform/models';
import { Icon, type GraphicIconName } from './icons';

export type GraphicTheme = 'light-engineering' | 'dark-engineering';
export type GraphicTone = 'neutral' | 'accent' | 'evidence' | 'output' | 'review' | 'assessment' | 'warning';

export interface GraphicStyleProfile {
  theme: GraphicTheme;
  system: 'engineering-line';
}

export function graphicAttrs(theme: GraphicTheme = 'light-engineering'): GraphicStyleProfile {
  return { theme, system: 'engineering-line' };
}

export function GraphicNode({
  icon,
  label,
  detail,
  tone = 'neutral',
  targetId,
  className = '',
}: {
  icon: GraphicIconName;
  label: string;
  detail?: string;
  tone?: GraphicTone;
  targetId?: string;
  className?: string;
}) {
  return (
    <div className={`graphic-node is-${tone} ${className}`} data-playback-target={targetId}>
      <span className="graphic-node-icon"><Icon name={icon} size={22} /></span>
      <strong>{label}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

export function SemanticEdgeLine({
  kind,
  label,
  className = '',
}: {
  kind: SemanticEdgeKind;
  label?: string;
  className?: string;
}) {
  return (
    <span className={`semantic-edge-line is-${kind} ${className}`} aria-label={label}>
      {label ? <em>{label}</em> : null}
    </span>
  );
}
