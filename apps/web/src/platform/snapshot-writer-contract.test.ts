import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const writerRepositories = [
  'learning-repository.ts',
  'professional-output-repository.ts',
  'professional-output-review-store.ts',
  'classroom-session-repository.ts',
  'classroom-participation-repository.ts',
  'self-study-cursor-repository.ts',
] as const;

test('all snapshot writer repositories delegate version mutation to SnapshotClock', () => {
  for (const file of writerRepositories) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /new SnapshotClock\(/, `${file} does not construct SnapshotClock`);
    assert.doesNotMatch(
      source,
      /snapshot_versions/,
      `${file} still owns snapshot_versions SQL instead of the shared clock`,
    );
  }
});
