export type PlaybackFocusKind = 'spotlight' | 'laser';

export interface PlaybackFocusState {
  id: string;
  kind: PlaybackFocusKind;
  targetId: string;
  rect: DOMRect;
  caption?: string;
}

export function PlaybackFocusOverlay({ focus }: { focus: PlaybackFocusState | null }) {
  if (!focus) return null;
  const pad = focus.kind === 'spotlight' ? 10 : 4;
  const style = {
    left: `${Math.max(0, focus.rect.left - pad)}px`,
    top: `${Math.max(0, focus.rect.top - pad)}px`,
    width: `${focus.rect.width + pad * 2}px`,
    height: `${focus.rect.height + pad * 2}px`,
  };

  return (
    <div className={`web-focus-overlay is-${focus.kind}`} style={style} aria-hidden="true">
      {focus.kind === 'laser' ? <span className="web-laser-dot" /> : null}
      {focus.caption ? <span className="web-focus-label">{focus.caption}</span> : null}
    </div>
  );
}
