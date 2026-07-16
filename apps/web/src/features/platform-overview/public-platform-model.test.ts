import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const webRoot = existsSync(path.join(process.cwd(), 'src/app'))
  ? process.cwd()
  : path.join(process.cwd(), 'apps/web');
const publicCardKeys = new Set([
  'id',
  'title',
  'kind',
  'status',
  'summary',
  'thumbnailUrl',
  'outputMode',
]);

test('public platform model exposes the eight-stage production chain without protected content', async () => {
  const { buildPublicPlatformModel } = await import('./public-platform-model.ts');
  const model = buildPublicPlatformModel();
  const json = JSON.stringify(model);

  for (const forbidden of ['expectedEvidence', 'correctModel', 'teacherNarration', 'studentId', 'score']) {
    assert.equal(json.includes(forbidden), false, forbidden);
  }
  assert.deepEqual(model.stages.map(({ id }) => id), [
    'input', 'diagnosis', 'capability-map', 'generation',
    'governance', 'textbook', 'teaching', 'feedback',
  ]);
});

test('every serialized card stays inside the public DTO whitelist', async () => {
  const { buildPublicPlatformModel } = await import('./public-platform-model.ts');
  const model = buildPublicPlatformModel();

  for (const cards of Object.values(model)) {
    for (const card of cards) {
      assert.equal(
        Object.keys(card).every((key) => publicCardKeys.has(key)),
        true,
        `${card.id} contains a non-public field`,
      );
    }
  }
});

test('anonymous platform routes are present and remain read-only', () => {
  for (const route of ['platform', 'resources', 'governance', 'delivery']) {
    const file = path.join(webRoot, 'src/app', route, 'page.tsx');
    assert.equal(existsSync(file), true, `${route} route is missing`);
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /AuthoritativeSnapshotReader|getDatabase|learning snapshot|<button\b|method:\s*['"]POST/);
  }
});
