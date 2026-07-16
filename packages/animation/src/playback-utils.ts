import type { TeachingAction } from './types';

const CJK_LANG_THRESHOLD = 0.3;

export function requiredTarget(action: TeachingAction): string {
  return action.elementId ?? action.target ?? action.widgetId ?? '';
}

export function effectHoldMs(action: TeachingAction, fallback: number): number {
  return Math.max(80, Math.min(1800, action.delayMs ?? action.holdMs ?? action.durationMs ?? fallback));
}

export function actionTimePayload(action: TeachingAction): Record<string, unknown> {
  const timedAction = action as TeachingAction & { currentTimeMs?: unknown; timeMs?: unknown };
  const state = typeof action.state === 'object' && action.state ? action.state : {};
  const currentTimeMs = firstFiniteNumber(timedAction.currentTimeMs, timedAction.timeMs, state.currentTimeMs, state.timeMs);
  return typeof currentTimeMs === 'number' ? { currentTimeMs, timeMs: currentTimeMs, state: { ...state, currentTimeMs } } : {};
}

export function focusTextPayload(action: TeachingAction): Record<string, unknown> {
  return {
    caption: action.caption ?? action.displayText ?? action.content ?? action.text ?? action.title,
    content: action.content ?? action.caption ?? action.displayText ?? action.text ?? action.title,
    displayText: action.displayText ?? action.caption ?? action.title,
    title: action.title,
  };
}

export function captionTargetForSpeechAction(action: TeachingAction, focusTarget: string | undefined): string | undefined {
  const state = typeof action.state === 'object' && action.state ? action.state : {};
  const explicit = state.captionTarget ?? (action as TeachingAction & { captionTarget?: unknown }).captionTarget;
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  const widgetId = String(action.widgetId ?? '');
  if (!widgetId.includes('lesson-animation')) return undefined;
  const match = String(focusTarget ?? '').match(/^(P\d{2})-/);
  return match ? `${match[1]}-caption-text` : undefined;
}

export function focusPolicyFor(action: TeachingAction): NonNullable<TeachingAction['focusPolicy']> | null {
  if (action.focusPolicy) return action.focusPolicy;
  if (action.type === 'speech' && (action.elementId || action.target)) {
    return action.clearFocusOnEnd ? 'clear-on-end' : 'hold';
  }
  if (
    action.type === 'spotlight' ||
    action.type === 'laser' ||
    action.type === 'widget_highlight' ||
    action.type === 'widget_annotation' ||
    action.type === 'widget_reveal'
  ) {
    return action.clearFocusOnEnd ? 'clear-on-end' : 'hold';
  }
  return action.clearFocusOnEnd ? 'clear-on-end' : null;
}

export function findVideoElement(elementId: string): HTMLVideoElement | null {
  const direct = document.getElementById(elementId);
  if (direct instanceof HTMLVideoElement) return direct;
  const nested = direct?.querySelector('video');
  if (nested instanceof HTMLVideoElement) return nested;

  const escaped = cssEscape(elementId);
  const byData = document.querySelector(
    `video[data-video-id="${escaped}"], [data-video-id="${escaped}"] video, video[data-animation-element-id="${escaped}"], [data-animation-element-id="${escaped}"] video`,
  );
  return byData instanceof HTMLVideoElement ? byData : null;
}

export function playCustomVideo(elementId: string, timeoutMs: number): Promise<void> {
  window.dispatchEvent(new CustomEvent('dgbook:animation-play_video', { detail: { videoId: elementId } }));
  return new Promise((resolve) => {
    const timeout = setTimeout(done, timeoutMs);
    function done(event?: Event) {
      if (event instanceof CustomEvent && event.detail?.videoId !== elementId) return;
      clearTimeout(timeout);
      window.removeEventListener('dgbook:animation-video-ended', done);
      resolve();
    }
    window.addEventListener('dgbook:animation-video-ended', done);
  });
}

export function estimateSpeechDuration(text: string): number {
  return isCJK(text)
    ? Math.max(2000, text.length * 150)
    : Math.max(2000, text.split(/\s+/).filter(Boolean).length * 240);
}

export function splitSpeechIntoChunks(text: string): string[] {
  const chunks = text
    .split(/(?<=[.!?。！？\n])\s*/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  return chunks.length > 0 ? chunks : [text];
}

function firstFiniteNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const numberValue = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(numberValue)) return numberValue;
  }
  return undefined;
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(value);
  return value.replace(/["\\]/g, '\\$&');
}

function isCJK(text: string): boolean {
  return text.length > 0 && (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length / text.length > CJK_LANG_THRESHOLD;
}
