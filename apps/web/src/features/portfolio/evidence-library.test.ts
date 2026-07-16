import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { migrateDatabase } from '../../platform/db/migrations.ts';
import { createTestDatabase } from '../../platform/db/test-database.ts';
import {
  p01EvidenceLibrary,
  seedP01EvidenceLibrary,
} from './evidence-library.ts';

test('the built-in P01 evidence catalog references verified deployed media and explicit field allowlists', () => {
  const publicRoot = existsSync(path.join(process.cwd(), 'public'))
    ? path.join(process.cwd(), 'public')
    : path.join(process.cwd(), 'apps', 'web', 'public');
  assert.ok(p01EvidenceLibrary.length >= 8);
  assert.equal(new Set(p01EvidenceLibrary.map(({ evidenceId }) => evidenceId)).size, p01EvidenceLibrary.length);
  for (const evidence of p01EvidenceLibrary) {
    assert.equal(evidence.origin, 'demo');
    assert.ok(evidence.allowedFieldKeys.length > 0, evidence.evidenceId);
    assert.ok(
      existsSync(path.join(publicRoot, evidence.assetUrl.replace(/^\//, ''))),
      `${evidence.evidenceId}: ${evidence.assetUrl}`,
    );
  }
});

test('explicit evidence seeding is idempotent and catalog reads never write', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    assert.equal(fixture.database.prepare('SELECT COUNT(*) FROM evidence_library').pluck().get(), 0);
    assert.ok(p01EvidenceLibrary.length > 0);
    assert.equal(fixture.database.prepare('SELECT COUNT(*) FROM evidence_library').pluck().get(), 0);

    seedP01EvidenceLibrary(fixture.database);
    seedP01EvidenceLibrary(fixture.database);
    assert.equal(
      fixture.database.prepare('SELECT COUNT(*) FROM evidence_library').pluck().get(),
      p01EvidenceLibrary.length,
    );
    assert.deepEqual(fixture.database.prepare(`
      SELECT evidence_id AS evidenceId, origin
      FROM evidence_library ORDER BY evidence_id
    `).all(), p01EvidenceLibrary
      .map(({ evidenceId, origin }) => ({ evidenceId, origin }))
      .sort((left, right) => left.evidenceId.localeCompare(right.evidenceId)));
  } finally {
    fixture.cleanup();
  }
});
