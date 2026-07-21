'use client';

import { useEffect, useState } from 'react';

const RECOVERY_FLAG = 'dgbook:chunk-load-recovered';

function isChunkLoadFailure(reason: unknown): boolean {
  const text = reason instanceof Error
    ? `${reason.name} ${reason.message}`
    : String(reason ?? '');
  return /ChunkLoadError|Loading chunk|failed to fetch dynamically imported module|RSC payload|NetworkError/i.test(text);
}

export function ChunkLoadRecovery() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    function recover(reason: unknown) {
      if (!isChunkLoadFailure(reason)) return;
      if (sessionStorage.getItem(RECOVERY_FLAG) !== '1') {
        sessionStorage.setItem(RECOVERY_FLAG, '1');
        window.location.reload();
        return;
      }
      setFailed(true);
    }

    function onUnhandledRejection(event: PromiseRejectionEvent) {
      recover(event.reason);
    }

    function onError(event: ErrorEvent) {
      recover(event.error ?? event.message);
    }

    window.addEventListener('unhandledrejection', onUnhandledRejection);
    window.addEventListener('error', onError);
    return () => {
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
      window.removeEventListener('error', onError);
    };
  }, []);

  if (!failed) return null;

  return (
    <div className="chunk-load-recovery" role="alert">
      <strong>页面资源加载不完整</strong>
      <span>请刷新一次页面；已填写内容如果还没有保存，请先复制后再刷新。</span>
      <button onClick={() => window.location.reload()} type="button">刷新页面</button>
    </div>
  );
}
