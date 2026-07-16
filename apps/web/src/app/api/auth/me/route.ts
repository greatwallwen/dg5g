import { getAuthService } from '../../../../platform/auth/auth-service.ts';
import { readSessionCookie } from '../../../../platform/auth/cookie.ts';
import { toPublicActor } from '../../../../platform/auth/actor.ts';

export async function GET(request: Request): Promise<Response> {
  let actor;
  try {
    actor = getAuthService().readActor(readSessionCookie(request));
  } catch {
    actor = null;
  }
  return Response.json(
    actor ? { actor: toPublicActor(actor) } : { error: '未登录。' },
    {
      status: actor ? 200 : 401,
      headers: { 'cache-control': 'no-store' },
    },
  );
}
