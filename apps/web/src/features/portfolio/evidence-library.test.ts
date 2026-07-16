import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { migrateDatabase } from '../../platform/db/migrations.ts';
import { createTestDatabase } from '../../platform/db/test-database.ts';
import {
  evidenceLibrary,
  evidenceLibraryForTask,
  p01EvidenceLibrary,
  p02EvidenceLibrary,
  p03EvidenceLibrary,
  readEvidenceDefinition,
  seedEvidenceLibrary,
  seedP01EvidenceLibrary,
} from './evidence-library.ts';
import { loadSelfStudyCatalog } from '../textbook-scene/self-study-content.ts';
import { professionalOutputSchemaForTask } from './output-schema.ts';

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

test('the task-scoped catalog covers every generated P02 and P03 field without cross-task ambiguity', () => {
  const publicRoot = existsSync(path.join(process.cwd(), 'public'))
    ? path.join(process.cwd(), 'public')
    : path.join(process.cwd(), 'apps', 'web', 'public');
  const catalog = loadSelfStudyCatalog();
  assert.deepEqual(evidenceLibraryForTask('P01'), p01EvidenceLibrary);
  assert.deepEqual(evidenceLibraryForTask('P02'), p02EvidenceLibrary);
  assert.deepEqual(evidenceLibraryForTask('P03'), p03EvidenceLibrary);
  assert.equal(new Set(evidenceLibrary.map(({ evidenceId }) => evidenceId)).size, evidenceLibrary.length);

  for (const taskId of ['P02', 'P03'] as const) {
    const fieldKeys = professionalOutputSchemaForTask(catalog, taskId).fields.map(({ key }) => key);
    const definitions = evidenceLibraryForTask(taskId);
    assert.ok(definitions.length >= fieldKeys.length, `${taskId} requires semantic evidence coverage`);
    for (const fieldKey of fieldKeys) {
      assert.ok(
        definitions.some(({ allowedFieldKeys }) => allowedFieldKeys.includes(fieldKey)),
        `${taskId}.${fieldKey} has no compatible evidence`,
      );
    }
    for (const definition of definitions) {
      assert.equal(definition.taskId, taskId);
      assert.ok(definition.allowedFieldKeys.every((key) => fieldKeys.includes(key)));
      assert.equal(readEvidenceDefinition(taskId, definition.evidenceId), definition);
      assert.equal(readEvidenceDefinition(taskId === 'P02' ? 'P03' : 'P02', definition.evidenceId), undefined);
      assert.ok(existsSync(path.join(publicRoot, definition.assetUrl.replace(/^\//, ''))));
    }
  }
});

test('task-scoped evidence seeding persists every definition exactly once with task and allowlist metadata', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedEvidenceLibrary(fixture.database);
    seedEvidenceLibrary(fixture.database);
    assert.equal(
      fixture.database.prepare('SELECT COUNT(*) FROM evidence_library').pluck().get(),
      evidenceLibrary.length,
    );
    const rows = fixture.database.prepare(`
      SELECT evidence_id AS evidenceId, metadata_json AS metadataJson
      FROM evidence_library ORDER BY evidence_id
    `).all() as Array<{ evidenceId: string; metadataJson: string }>;
    for (const { evidenceId, metadataJson } of rows) {
      const definition = evidenceLibrary.find((candidate) => candidate.evidenceId === evidenceId);
      assert.ok(definition);
      const metadata = JSON.parse(metadataJson) as Record<string, unknown>;
      assert.equal(metadata.taskId, definition.taskId);
      assert.deepEqual(metadata.allowedFieldKeys, definition.allowedFieldKeys);
    }
  } finally {
    fixture.cleanup();
  }
});
