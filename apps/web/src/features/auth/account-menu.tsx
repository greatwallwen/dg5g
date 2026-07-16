'use client';

import { useState } from 'react';
import { logoutCurrentActor, roleLabel, type WebRole } from './role-session.ts';

export interface AccountMenuProps {
  displayName: string;
  role: WebRole;
  beforeLogout?: () => Promise<void>;
}

const DEFAULT_BEFORE_LOGOUT_TIMEOUT_MS = 1_200;

export async function settleBeforeLogout(
  beforeLogout?: () => Promise<void>,
  timeoutMs = DEFAULT_BEFORE_LOGOUT_TIMEOUT_MS,
): Promise<void> {
  if (!beforeLogout) return;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timeoutId = setTimeout(resolve, Math.max(0, timeoutMs));
  });
  try {
    await Promise.race([
      Promise.resolve().then(beforeLogout).catch(() => undefined),
      timeout,
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

export function AccountMenu({ displayName, role, beforeLogout }: AccountMenuProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function logout() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await settleBeforeLogout(beforeLogout);
      await logoutCurrentActor();
      window.location.replace('/');
    } catch {
      setError('退出失败，请重试。');
      setBusy(false);
    }
  }

  return (
    <div
      aria-atomic="true"
      aria-busy={busy}
      aria-live="polite"
      className="account-menu"
      data-account-menu={role}
    >
      <span className="account-menu-identity">{roleLabel[role]} · {displayName}</span>
      <button
        className="account-menu-logout"
        data-account-logout
        disabled={busy}
        onClick={() => void logout()}
        type="button"
      >
        {busy ? '正在退出' : '退出登录'}
      </button>
      {error ? <small className="account-menu-status" role="status">{error}</small> : null}
    </div>
  );
}
