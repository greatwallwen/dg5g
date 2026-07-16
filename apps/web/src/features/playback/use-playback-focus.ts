'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlaybackFocusKind, PlaybackFocusState } from './playback-focus-overlay';

export function usePlaybackFocus() {
  const [focus, setFocus] = useState<PlaybackFocusState | null>(null);
  const timerRef = useRef<number | null>(null);

  const clearFocus = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    setFocus(null);
  }, []);

  const measureFocus = useCallback((kind: PlaybackFocusKind, targetId: string, caption?: string) => {
    if (!targetId) {
      clearFocus();
      return;
    }
    const selector = `[data-playback-target="${CSS.escape(targetId)}"], #${CSS.escape(targetId)}`;
    const target = document.querySelector<HTMLElement>(selector);
    if (!target) {
      clearFocus();
      return;
    }
    setFocus({ id: `${kind}-${targetId}-${Date.now()}`, kind, targetId, rect: target.getBoundingClientRect(), caption });
  }, [clearFocus]);

  const showFocus = useCallback((kind: PlaybackFocusKind, targetId: string, caption?: string) => {
    if (!targetId) {
      clearFocus();
      return;
    }
    window.dispatchEvent(new CustomEvent('dgbook:playback-target', { detail: { targetId } }));
    const selector = `[data-playback-target="${CSS.escape(targetId)}"], #${CSS.escape(targetId)}`;
    const target = document.querySelector<HTMLElement>(selector);
    if (!target) {
      clearFocus();
      return;
    }
    const rect = target.getBoundingClientRect();
    const hiddenByDisclosure = Boolean(target.closest('[hidden]'));
    const outsideViewport = hiddenByDisclosure || rect.top < 104 || rect.bottom > window.innerHeight - 138;
    if (outsideViewport) target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      measureFocus(kind, targetId, caption);
      timerRef.current = null;
    }, hiddenByDisclosure ? 220 : outsideViewport ? 360 : 0);
  }, [clearFocus, measureFocus]);

  useEffect(() => {
    if (!focus) return undefined;
    const update = () => measureFocus(focus.kind, focus.targetId, focus.caption);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [focus, measureFocus]);

  useEffect(() => clearFocus, [clearFocus]);

  return { clearFocus, focus, showFocus };
}
