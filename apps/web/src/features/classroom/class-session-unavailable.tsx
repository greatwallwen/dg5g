import Link from 'next/link';
import { AccountMenu } from '../auth/account-menu.tsx';
import type { WebRole } from '../auth/role-session.ts';

type ClassSessionUnavailableProps = {
  sessionId: string;
  returnHref: string;
  returnLabel: string;
} & (
  | { displayName: string; role: WebRole }
  | { displayName?: never; role?: never }
);

export function ClassSessionUnavailable({
  displayName,
  role,
  sessionId,
  returnHref,
  returnLabel,
}: ClassSessionUnavailableProps) {
  return (
    <main className="textbook-scene-app">
      <section
        className="textbook-scene-unavailable"
        data-class-session-unavailable={sessionId}
      >
        {displayName && role ? <AccountMenu displayName={displayName} role={role} /> : null}
        <span>课堂尚未开放</span>
        <h1>{sessionId}</h1>
        <p>该课堂会话不存在或尚未开放，系统不会回退到其他学习节点。</p>
        <Link href={returnHref}>{returnLabel}</Link>
      </section>
    </main>
  );
}
