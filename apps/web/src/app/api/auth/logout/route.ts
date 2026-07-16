import { getAuthService } from '../../../../platform/auth/auth-service.ts';
import {
  clearSessionCookieOptions,
  readSessionCookie,
  serializeSessionCookie,
} from '../../../../platform/auth/cookie.ts';

export async function POST(request: Request): Promise<Response> {
  const token = readSessionCookie(request);
  try {
    if (token) getAuthService().logout(token);
  } catch {
    // Clearing the browser credential remains mandatory even if storage is unavailable.
  }

  const response = Response.json(
    { ok: true },
    { status: 200, headers: { 'cache-control': 'no-store' } },
  );
  response.headers.set(
    'set-cookie',
    serializeSessionCookie('', clearSessionCookieOptions(request)),
  );
  return response;
}
