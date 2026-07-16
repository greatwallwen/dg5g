import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { parseP1PortfolioTaskId } from '../features/portfolio/p1-portfolio-detail-definition.ts';

test('accepts only the three canonical P1 task ids without a silent fallback', () => {
  assert.equal(parseP1PortfolioTaskId('P01'), 'P01');
  assert.equal(parseP1PortfolioTaskId('P02'), 'P02');
  assert.equal(parseP1PortfolioTaskId('P03'), 'P03');
  for (const value of ['P1T1', 'P04', 'p01', '', '../P01']) {
    assert.equal(parseP1PortfolioTaskId(value), undefined, value);
  }
});

test('portfolio detail authenticates before an actor-owned read and exposes no identity query path', () => {
  const source = read('app/student/projects/p1/portfolio/[taskId]/page.tsx');
  const auth = source.indexOf("requireClassRole('student')");
  const readFacts = source.indexOf('.read(actor.studentId!, taskId)');
  assert.ok(auth >= 0);
  assert.ok(readFacts > auth);
  assert.match(source, /parseP1PortfolioTaskId\(params\.taskId\)/);
  assert.match(source, /if \(!taskId\) notFound\(\)/);
  assert.doesNotMatch(source, /searchParams|studentId\s*[:=]|outputId\s*[:=]|version\s*[:=]/);
});

test('the detail route renders legal empty tasks as unformed rather than redirecting to P01', () => {
  const source = read('app/student/projects/p1/portfolio/[taskId]/page.tsx');
  assert.match(source, /buildP1PortfolioDetailModel/);
  assert.match(source, /P1PortfolioDetailView/);
  assert.doesNotMatch(source, /redirect\([^)]*P01|taskId\s*\|\|\s*['"]P01/);
});

function read(path: string): string {
  const sourceRoot = existsSync(resolve(process.cwd(), 'apps/web/src'))
    ? resolve(process.cwd(), 'apps/web/src')
    : resolve(process.cwd(), 'src');
  return readFileSync(resolve(sourceRoot, path), 'utf8');
}
