import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

test('P1 project and portfolio pages derive their models from the authenticated student cut', () => {
  const pages = [
    source('../../app/student/projects/p1/page.tsx'),
    source('../../app/student/projects/p1/portfolio/page.tsx'),
  ];

  for (const page of pages) {
    assert.match(page, /AuthoritativeSnapshotReader/);
    assert.match(page, /\.read\(actor, 'student'\)/);
    assert.doesNotMatch(page, /readP1ProjectProjection/);
    assert.doesNotMatch(page, /actor\.studentId\s*\?\?/);
  }
});
