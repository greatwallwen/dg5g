'use client';

import { useEffect, useState, type RefObject } from 'react';
import { Icon } from '@/ui/foundation/icons';

export function FullscreenToggle({ targetRef, compact = false }: { targetRef: RefObject<HTMLElement>; compact?: boolean }) {
  const [active, setActive] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setSupported(Boolean(document.fullscreenEnabled));
    const sync = () => setActive(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('fullscreenerror', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('fullscreenerror', sync);
    };
  }, []);

  async function toggle() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (targetRef.current?.requestFullscreen) await targetRef.current.requestFullscreen();
    } catch {
      setActive(false);
    }
  }

  return (
    <button
      aria-label={active ? '退出全屏' : '进入全屏'}
      aria-pressed={active}
      className="scene-icon-button"
      data-fullscreen-supported={supported}
      onClick={toggle}
      title={active ? '退出全屏' : supported ? '进入全屏' : '浏览器不支持真全屏'}
      type="button"
    >
      <Icon name={active ? 'minimize' : 'maximize'} size={compact ? 17 : 19} />
    </button>
  );
}
