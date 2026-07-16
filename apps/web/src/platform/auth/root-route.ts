import type { AuthenticatedActor } from './actor.ts';
import { homeForRole } from './redirects.ts';

export function rootDestinationForActor(
  actor: Pick<AuthenticatedActor, 'role'> | null,
): string | null {
  return actor ? homeForRole(actor.role) : null;
}
