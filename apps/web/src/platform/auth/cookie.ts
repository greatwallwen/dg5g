import { DEFAULT_SESSION_TTL_SECONDS } from './auth-service.ts';

export const AUTH_COOKIE_NAME = 'dgbook_session';

export interface CookiePolicyOptions {
  trustForwardedProto?: boolean;
}

export interface SessionCookieOptions {
  httpOnly: true;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
  secure: boolean;
}

export function sessionCookieOptions(
  request: Request,
  options: CookiePolicyOptions = {},
): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: DEFAULT_SESSION_TTL_SECONDS,
    secure: effectiveRequestScheme(request, options) === 'https',
  };
}

export function clearSessionCookieOptions(
  request: Request,
  options: CookiePolicyOptions = {},
): SessionCookieOptions {
  return { ...sessionCookieOptions(request, options), maxAge: 0 };
}

export function readSessionCookie(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;
  for (const pair of cookieHeader.split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 0 || pair.slice(0, separator).trim() !== AUTH_COOKIE_NAME) continue;
    const value = pair.slice(separator + 1).trim();
    return value || null;
  }
  return null;
}

export function serializeSessionCookie(value: string, options: SessionCookieOptions): string {
  const segments = [
    `${AUTH_COOKIE_NAME}=${value}`,
    `Max-Age=${options.maxAge}`,
    `Path=${options.path}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (options.secure) segments.push('Secure');
  return segments.join('; ');
}

function effectiveRequestScheme(
  request: Request,
  options: CookiePolicyOptions,
): 'http' | 'https' {
  const urlScheme = new URL(request.url).protocol === 'https:' ? 'https' : 'http';
  const trustForwardedProto = options.trustForwardedProto
    ?? process.env.DGBOOK_TRUST_PROXY === '1';
  if (!trustForwardedProto) return urlScheme;
  const forwarded = request.headers.get('x-forwarded-proto')
    ?.split(',', 1)[0]
    ?.trim()
    .toLowerCase();
  if (forwarded === 'https') return 'https';
  if (forwarded === 'http') return urlScheme === 'https' ? 'https' : 'http';
  return urlScheme;
}
