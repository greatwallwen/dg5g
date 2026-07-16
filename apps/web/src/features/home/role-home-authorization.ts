import type { AuthenticatedActor, AuthenticatedRole } from '../../platform/auth/actor.ts';
import { homeForRole } from '../../platform/auth/redirects.ts';

export type RoleHomeAuthorizationDecision =
  | { kind: 'authorized'; actor: AuthenticatedActor }
  | { kind: 'redirect'; destination: string };

export function decideRoleHomeAuthorization(
  actor: AuthenticatedActor | null,
  requiredRole: AuthenticatedRole,
  requestedPath: '/student/home' | '/teacher/workbench',
): RoleHomeAuthorizationDecision {
  if (!actor) {
    return { kind: 'redirect', destination: `/?next=${encodeURIComponent(requestedPath)}` };
  }
  if (actor.role !== requiredRole) {
    return { kind: 'redirect', destination: homeForRole(actor.role) };
  }
  return { kind: 'authorized', actor };
}
