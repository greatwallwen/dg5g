import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const login = readFileSync(path.join(root, 'apps/web/src/features/auth/login-page.tsx'), 'utf8');
const layout = readFileSync(path.join(root, 'apps/web/src/app/layout.tsx'), 'utf8');
const globals = readFileSync(path.join(root, 'apps/web/src/app/globals.css'), 'utf8');
const textbookCss = readFileSync(path.join(root, 'apps/web/src/app/digital-textbook-v4.css'), 'utf8');

test('login surface exposes the Image2 primary-action and paused-motion contract', () => {
  assert.match(login, /data-primary-action-policy="exactly-one"/);
  assert.match(login, /data-motion="paused"/);
  assert.equal((login.match(/data-primary-action(?:\s|=|>)/g) ?? []).length, 1);
  assert.match(login, /className="login-submit"[\s\S]*data-primary-action/);
});

test('login keeps exactly one credential path with three interactive controls', () => {
  assert.equal((login.match(/<input\b/g) ?? []).length, 2, 'account and password are the only inputs');
  assert.equal((login.match(/<button\b/g) ?? []).length, 1, 'enter textbook is the only button');
  assert.match(login, /type="submit"/);
  assert.doesNotMatch(login, /type="button"/);
  assert.doesNotMatch(login, /login-role-switch|login-demo-accounts/);
});

test('root layout provides a keyboard skip target and global visible focus/reduced-motion rules', () => {
  assert.match(layout, /className="dgbook-skip-link"/);
  assert.match(layout, /href="#dgbook-main-content"/);
  assert.match(layout, /id="dgbook-main-content"/);
  assert.match(globals, /\.dgbook-skip-link:focus-visible/);
  assert.match(globals, /:focus-visible/);
  assert.match(globals, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(textbookCss, /html,\s*\nbody\s*\{[^}]*overflow:\s*hidden/s);
});

test('the late textbook layer preserves a visible single-column 390px login', () => {
  const mobileOverride = textbookCss.match(/@media\s*\(max-width:\s*520px\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';

  assert.match(mobileOverride, /\.login-page-v3\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
  assert.match(mobileOverride, /\.login-scene\s*\{[^}]*min-height:\s*280px/s);
  assert.match(mobileOverride, /\.login-form-v3\s*\{[^}]*min-width:\s*0/s);
});
