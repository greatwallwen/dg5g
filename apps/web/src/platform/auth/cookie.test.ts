import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUTH_COOKIE_NAME,
  clearSessionCookieOptions,
  readSessionCookie,
  sessionCookieOptions,
} from './cookie.ts';

test('uses HttpOnly Lax path-scoped bounded cookies and follows the request URL scheme', () => {
  const http = sessionCookieOptions(new Request('http://demo.test/'));
  const https = sessionCookieOptions(new Request('https://demo.test/'));

  assert.deepEqual(http, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 28_800,
    secure: false,
  });
  assert.equal(https.secure, true);
  assert.equal(https.maxAge > 0 && https.maxAge <= 604_800, true);
});

test('trusts forwarded proto only when proxy trust is explicitly enabled', () => {
  const request = new Request('http://internal.test/', {
    headers: { 'x-forwarded-proto': 'https' },
  });
  assert.equal(sessionCookieOptions(request, { trustForwardedProto: false }).secure, false);
  assert.equal(sessionCookieOptions(request, { trustForwardedProto: true }).secure, true);
});

test('reads the named cookie and produces a route-handler clear policy', () => {
  const request = new Request('http://demo.test/', {
    headers: { cookie: `unrelated=1; ${AUTH_COOKIE_NAME}=raw-token; another=2` },
  });
  assert.equal(readSessionCookie(request), 'raw-token');
  assert.deepEqual(clearSessionCookieOptions(request), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    secure: false,
  });
});
