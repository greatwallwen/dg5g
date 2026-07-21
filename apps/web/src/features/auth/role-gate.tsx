'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { Icon } from '@/ui/foundation/icons';
import type { PublicActor } from '@/platform/auth/actor';
import {
  fetchCurrentActor,
  logoutCurrentActor,
  roleLabel,
  type WebRole,
} from './role-session';

type RoleGateProps = {
  requiredRole: WebRole;
  children: ReactNode;
  title?: string;
  description?: string;
};

export function RoleGate({ requiredRole, children, title, description }: RoleGateProps) {
  const pathname = usePathname();
  const { checked, actor } = useAuthoritativeActor();

  if (!checked) return <AuthLoading label="正在确认系统身份" />;

  if (actor?.role !== requiredRole) {
    const loginHref = `/?next=${encodeURIComponent(pathname)}`;
    return (
      <section className="role-auth-gate" data-role-auth="blocked" data-required-role={requiredRole} data-current-role={actor?.role ?? 'none'}>
        <div className="role-auth-card">
          <span className="role-auth-icon"><Icon name={requiredRole === 'teacher' ? 'teacher' : 'user'} size={34} /></span>
          <p className="role-auth-kicker">{roleLabel[requiredRole]}登录</p>
          <h1>{title ?? `请先进入${roleLabel[requiredRole]}端`}</h1>
          <p>{description ?? `此页面属于${roleLabel[requiredRole]}流程，身份与班级权限由系统会话确认。`}</p>
          {actor ? <small>当前已登录：{roleLabel[actor.role]} · {actor.displayName}</small> : null}
          <div className="role-auth-actions">
            {actor
              ? <SwitchAccountButton href={loginHref} label={`切换为${roleLabel[requiredRole]}账号`} />
              : <Link className="primary-button" href={loginHref} prefetch={false}>登录{roleLabel[requiredRole]}账号</Link>}
            <Link className="secondary-button" href="/" prefetch={false}>返回入口</Link>
          </div>
        </div>
      </section>
    );
  }

  return <>{children}</>;
}

export function RoleBadge({ role }: { role: WebRole }) {
  const { checked, actor } = useAuthoritativeActor();
  return (
    <span className="role-badge" data-role-badge={role}>
      <Icon name={role === 'teacher' ? 'teacher' : 'user'} size={18} />
      {roleLabel[role]}{checked && actor?.role === role ? ` · ${actor.displayName}` : ''}
    </span>
  );
}

export function AuthenticatedGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { checked, actor } = useAuthoritativeActor();
  if (!checked) return <AuthLoading label="正在进入教材" />;
  if (!actor) {
    return (
      <section className="role-auth-gate" data-role-auth="blocked" data-required-role="authenticated">
        <div className="role-auth-card">
          <span className="role-auth-icon"><Icon name="lock" size={34} /></span>
          <p className="role-auth-kicker">教材登录</p>
          <h1>请先使用演示账号登录</h1>
          <p>系统会根据账号确认学生或教师身份，并进入对应的默认工作入口。</p>
          <div className="role-auth-actions">
            <Link className="primary-button" href={`/?next=${encodeURIComponent(pathname)}`} prefetch={false}>返回登录</Link>
          </div>
        </div>
      </section>
    );
  }
  return <>{children}</>;
}

function useAuthoritativeActor(): { checked: boolean; actor: PublicActor | null } {
  const [state, setState] = useState<{ checked: boolean; actor: PublicActor | null }>({
    checked: false,
    actor: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void fetchCurrentActor(controller.signal)
      .then((actor) => {
        if (active) setState({ checked: true, actor });
      })
      .catch(() => {
        if (active) setState({ checked: true, actor: null });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  return state;
}

function AuthLoading({ label }: { label: string }) {
  return <section className="role-auth-loading" data-role-auth="checking"><span /><strong>{label}</strong></section>;
}

function SwitchAccountButton({ href, label }: { href: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="primary-button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await logoutCurrentActor();
        router.replace(href);
        router.refresh();
      }}
      type="button"
    >
      {busy ? '正在退出' : label}
    </button>
  );
}
