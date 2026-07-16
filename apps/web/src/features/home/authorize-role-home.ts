import { redirect } from 'next/navigation';
import type { AuthenticatedActor, AuthenticatedRole } from '../../platform/auth/actor.ts';
import { readServerActor } from '../../platform/auth/server-actor.ts';
import { decideRoleHomeAuthorization } from './role-home-authorization.ts';

export function authorizeRoleHome(
  requiredRole: AuthenticatedRole,
  requestedPath: '/student/home' | '/teacher/workbench',
): AuthenticatedActor {
  const decision = decideRoleHomeAuthorization(readServerActor(), requiredRole, requestedPath);
  if (decision.kind === 'redirect') redirect(decision.destination);
  return decision.actor;
}
