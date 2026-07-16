import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const webRoot = existsSync(path.join(process.cwd(), 'src/app'))
  ? process.cwd()
  : path.join(process.cwd(), 'apps/web');
const repositoryRoot = path.resolve(webRoot, '../..');
const anonymousRoutes = ['platform', 'resources', 'governance', 'delivery'] as const;
const authGuards = ['requireUser', 'readServerActor', 'requireClassRole', 'redirect('] as const;

test('small platform text uses exact WCAG AA color tokens', () => {
  const css = readFileSync(path.join(webRoot, 'src/app/platform-overview.css'), 'utf8');
  const stepColor = selectorColor(css, '.public-platform-step');
  const footerSmallColor = selectorColor(css, '.public-platform-footer small');

  assert.equal(stepColor, '#8baabd');
  assert.equal(footerSmallColor, '#829fb1');
  assert.ok(contrastRatio(stepColor, '#0a2135') >= 4.5);
  assert.ok(contrastRatio(footerSmallColor, '#061522') >= 4.5);
});

test('shared public view and redirect config preserve anonymous read-only access', () => {
  const view = readFileSync(path.join(webRoot, 'src/features/platform-overview/public-platform-view.tsx'), 'utf8');
  const nextConfig = readFileSync(path.join(webRoot, 'next.config.mjs'), 'utf8');

  assert.doesNotMatch(view, /<(?:form|button)\b|\b(?:fetch|useRouter|redirect|requireUser|requireClassRole|readServerActor)\b|method:\s*['"](?:POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(nextConfig, /\{\s*source:\s*['"]\/platform['"]\s*,\s*destination:/);
});

test('all four public route entries stay free of authentication guards', () => {
  for (const route of anonymousRoutes) {
    const source = readFileSync(path.join(webRoot, 'src/app', route, 'page.tsx'), 'utf8');
    for (const guard of authGuards) {
      assert.equal(source.includes(guard), false, `${route} must not use ${guard}`);
    }
  }
});

test('repository audit enforces the shared view and redirect boundaries', () => {
  const audit = readFileSync(path.join(repositoryRoot, 'scripts/audit-digital-textbook-v3.mjs'), 'utf8')
    .replaceAll('\r\n', '\n');

  assert.match(audit, /forbidSnippets\('apps\/web\/src\/features\/platform-overview\/public-platform-view\.tsx'/);
  assert.match(audit, /forbidSnippets\('apps\/web\/next\.config\.mjs'/);

  const routeAuditStart = audit.indexOf("for (const file of [\n  'apps/web/src/app/platform/page.tsx'");
  const routeAuditEnd = audit.indexOf("\n}\nrequireSnippets('apps/web/src/features/auth/role-session.ts'", routeAuditStart);
  assert.notEqual(routeAuditStart, -1, 'anonymous route audit loop is missing');
  assert.notEqual(routeAuditEnd, -1, 'anonymous route audit loop is incomplete');
  const routeAudit = audit.slice(routeAuditStart, routeAuditEnd);
  for (const guard of authGuards) {
    assert.equal(routeAudit.includes(`'${guard}'`), true, `route audit must forbid ${guard}`);
  }
});

function selectorColor(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
  const color = block.match(/(?:^|;)\s*color:\s*(#[0-9a-f]{6})\s*;/i)?.[1];
  assert.ok(color, `${selector} must declare an explicit six-digit color`);
  return color.toLowerCase();
}

function contrastRatio(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

function luminance(hex: string): number {
  const [red, green, blue] = hex.slice(1).match(/.{2}/g)!.map((value) => {
    const channel = Number.parseInt(value, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}
