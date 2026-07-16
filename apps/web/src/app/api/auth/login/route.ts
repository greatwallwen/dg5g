import { getAuthService } from '../../../../platform/auth/auth-service.ts';
import {
  serializeSessionCookie,
  sessionCookieOptions,
} from '../../../../platform/auth/cookie.ts';
import { safeNextForRole } from '../../../../platform/auth/redirects.ts';
import { toPublicActor } from '../../../../platform/auth/actor.ts';

const INVALID_CREDENTIALS = { error: '账号或密码不正确。' } as const;

export async function POST(request: Request): Promise<Response> {
  const body = await readLoginBody(request);
  if (!body || body.role !== undefined) return json(INVALID_CREDENTIALS, 401);

  let result;
  try {
    result = getAuthService().login({ username: body.username, password: body.password });
  } catch {
    return json({ error: '登录服务暂不可用。' }, 503);
  }
  if (!result) return json(INVALID_CREDENTIALS, 401);

  const home = safeNextForRole(body.next, result.actor.role);
  const response = json({ actor: toPublicActor(result.actor), home }, 200);
  response.headers.set(
    'set-cookie',
    serializeSessionCookie(result.token, sessionCookieOptions(request)),
  );
  return response;
}

async function readLoginBody(request: Request): Promise<{
  username: string;
  password: string;
  next?: unknown;
  role?: unknown;
} | null> {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) return null;
  try {
    const body = await request.json() as Record<string, unknown>;
    if (!body || Array.isArray(body) || typeof body !== 'object') return null;
    if (typeof body.username !== 'string' || typeof body.password !== 'string') return null;
    return {
      username: body.username,
      password: body.password,
      ...(body.next === undefined ? {} : { next: body.next }),
      ...(body.role === undefined ? {} : { role: body.role }),
    };
  } catch {
    return null;
  }
}

function json(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}
