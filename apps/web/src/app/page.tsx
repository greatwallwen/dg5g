import { redirect } from 'next/navigation';
import { LoginPage } from '@/features/auth/login-page';
import { readServerActor } from '@/platform/auth/server-actor';
import { rootDestinationForActor } from '@/platform/auth/root-route';

export const dynamic = 'force-dynamic';

export default function LoginRoute({ searchParams }: { searchParams?: { next?: string | string[] } }) {
  let actor = null;
  try {
    actor = readServerActor();
  } catch {
    actor = null;
  }
  const destination = rootDestinationForActor(actor);
  if (destination) redirect(destination);

  const rawNext = searchParams?.next;
  const nextPath = typeof rawNext === 'string' ? rawNext : undefined;
  return <div data-login-role="gateway"><LoginPage nextPath={nextPath} /></div>;
}
