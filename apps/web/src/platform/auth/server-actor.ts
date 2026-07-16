import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuthService, type AuthService } from './auth-service.ts';
import { AUTH_COOKIE_NAME, readSessionCookie } from './cookie.ts';
import { homeForRole } from './redirects.ts';
import type { AuthenticatedActor, AuthenticatedRole } from './actor.ts';

export function readActorFromRequest(
  request: Request,
  service: AuthService = getAuthService(),
): AuthenticatedActor | null {
  return service.readActor(readSessionCookie(request));
}

export function readServerActor(service: AuthService = getAuthService()): AuthenticatedActor | null {
  return service.readActor(cookies().get(AUTH_COOKIE_NAME)?.value);
}

export async function requireUser(): Promise<AuthenticatedActor> {
  const actor = readServerActor();
  if (!actor) redirect('/');
  return actor;
}

export async function requireClassRole(role: AuthenticatedRole): Promise<AuthenticatedActor> {
  const actor = await requireUser();
  if (actor.role !== role) redirect(homeForRole(actor.role));
  return actor;
}
