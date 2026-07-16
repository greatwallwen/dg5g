import assert from 'node:assert/strict';
import test from 'node:test';
import { seedBase } from './db/demo-seed.ts';
import { migrateDatabase } from './db/migrations.ts';
import { createTestDatabase } from './db/test-database.ts';
import {
  ProfessionalOutputRepository,
  ProfessionalOutputStateRevisionConflictError,
  ProfessionalOutputUpstreamError,
} from './professional-output-repository.ts';

test('saving a draft creates immutable v1 and submitting the same fields advances only the head', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    const repository = new ProfessionalOutputRepository(
      fixture.database,
      () => 'output-stu-01-p01',
    );
    const fields = {
      stationAndRoom: '海岳路站 / 01号机房',
      locationEvidence: ['IMG-001', 'IMG-002'],
      confidence: 92,
    };

    const draft = repository.saveDraft({
      studentId: 'stu-01',
      taskId: 'P01',
      expectedStateRevision: 0,
      fields,
      upstreamRefs: [],
    });
    assert.deepEqual(draft.head, {
      outputId: 'output-stu-01-p01',
      studentId: 'stu-01',
      taskId: 'P01',
      currentVersion: 1,
      stateRevision: 1,
      status: 'draft',
    });
    assert.deepEqual(draft.versions, [{
      outputId: 'output-stu-01-p01',
      taskId: 'P01',
      version: 1,
      schemaVersion: 1,
      fields,
      upstreamRefs: [],
    }]);

    const submitted = repository.submit({
      outputId: draft.head.outputId,
      studentId: 'stu-01',
      taskId: 'P01',
      expectedStateRevision: 1,
      fields,
      upstreamRefs: [],
    });
    assert.equal(submitted.head.currentVersion, 1);
    assert.equal(submitted.head.stateRevision, 2);
    assert.equal(submitted.head.status, 'submitted');
    assert.equal(submitted.versions.length, 1);
    assert.deepEqual(fixture.database.prepare(`
      SELECT event_type AS eventType
      FROM learning_events
      WHERE student_id = 'stu-01' AND node_id = 'P1T1-N04'
      ORDER BY occurred_at, event_id
    `).all(), [
      { eventType: 'evidence_draft_saved' },
      { eventType: 'evidence_submitted' },
    ]);
    assert.equal(topicVersion('learning:stu-01'), 2);
    assert.equal(topicVersion('global'), 2);
  } finally {
    fixture.cleanup();
  }

  function topicVersion(topic: string): number {
    return fixture.database.prepare(
      'SELECT version FROM snapshot_versions WHERE topic = ?',
    ).pluck().get(topic) as number;
  }
});

test('a stale state revision rolls back the version, event, and snapshot changes atomically', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    const repository = new ProfessionalOutputRepository(fixture.database, () => 'output-conflict');
    repository.saveDraft({
      studentId: 'stu-01',
      taskId: 'P01',
      expectedStateRevision: 0,
      fields: { summary: 'first version' },
      upstreamRefs: [],
    });
    const studentVersion = topicVersion('learning:stu-01');
    const globalVersion = topicVersion('global');

    assert.throws(() => repository.saveDraft({
      outputId: 'output-conflict',
      studentId: 'stu-01',
      taskId: 'P01',
      expectedStateRevision: 0,
      fields: { summary: 'must roll back' },
      upstreamRefs: [],
    }), (error: unknown) => {
      assert.ok(error instanceof ProfessionalOutputStateRevisionConflictError);
      assert.equal(error.expectedStateRevision, 0);
      assert.equal(error.actualStateRevision, 1);
      return true;
    });
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM professional_output_versions WHERE output_id = 'output-conflict'
    `).pluck().get(), 1);
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM learning_events WHERE student_id = 'stu-01'
    `).pluck().get(), 1);
    assert.equal(topicVersion('learning:stu-01'), studentVersion);
    assert.equal(topicVersion('global'), globalVersion);
  } finally {
    fixture.cleanup();
  }

  function topicVersion(topic: string): number {
    return fixture.database.prepare(
      'SELECT version FROM snapshot_versions WHERE topic = ?',
    ).pluck().get(topic) as number;
  }
});

test('a returned output keeps v1 immutable and appends v2 when the student revises its fields', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    const repository = new ProfessionalOutputRepository(fixture.database, () => 'output-revision');
    const firstFields = { summary: 'initial evidence', images: ['IMG-001'] };
    const revisedFields = { summary: 'corrected evidence', images: ['IMG-001', 'IMG-002'] };
    repository.saveDraft({
      studentId: 'stu-01',
      taskId: 'P01',
      expectedStateRevision: 0,
      fields: firstFields,
      upstreamRefs: [],
    });
    repository.submit({
      outputId: 'output-revision',
      studentId: 'stu-01',
      taskId: 'P01',
      expectedStateRevision: 1,
      fields: firstFields,
      upstreamRefs: [],
    });
    fixture.database.prepare(`
      UPDATE professional_outputs
      SET status = 'returned', state_revision = state_revision + 1
      WHERE output_id = 'output-revision'
    `).run();

    const revised = repository.saveDraft({
      outputId: 'output-revision',
      studentId: 'stu-01',
      taskId: 'P01',
      expectedStateRevision: 3,
      fields: revisedFields,
      upstreamRefs: [],
    });
    assert.equal(revised.head.currentVersion, 2);
    assert.equal(revised.head.stateRevision, 4);
    assert.equal(revised.head.status, 'draft');
    assert.deepEqual(revised.versions.map(({ version, fields }) => ({ version, fields })), [
      { version: 1, fields: firstFields },
      { version: 2, fields: revisedFields },
    ]);
    assert.throws(() => fixture.database.prepare(`
      UPDATE professional_output_versions
      SET fields_json = '{"summary":"tampered"}'
      WHERE output_id = 'output-revision' AND version = 1
    `).run(), /professional output versions are immutable/i);
  } finally {
    fixture.cleanup();
  }
});

test('P02 and P03 persist real same-student upstream output versions and reject forged references', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    const outputIds = ['stu-01-p01', 'stu-02-p01', 'stu-01-p02', 'stu-01-p03'];
    const repository = new ProfessionalOutputRepository(fixture.database, () => outputIds.shift()!);
    const p01 = repository.saveDraft({
      studentId: 'stu-01', taskId: 'P01', expectedStateRevision: 0,
      fields: { result: 'indoor collection' }, upstreamRefs: [],
    });
    const otherStudentP01 = repository.saveDraft({
      studentId: 'stu-02', taskId: 'P01', expectedStateRevision: 0,
      fields: { result: 'other student' }, upstreamRefs: [],
    });

    assert.throws(() => repository.saveDraft({
      studentId: 'stu-01', taskId: 'P02', expectedStateRevision: 0,
      fields: { result: 'outdoor collection' },
      upstreamRefs: [{ outputId: otherStudentP01.head.outputId, version: 1 }],
    }), ProfessionalOutputUpstreamError);
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM professional_outputs WHERE student_id = 'stu-01' AND task_id = 'P02'
    `).pluck().get(), 0);

    const p02 = repository.saveDraft({
      studentId: 'stu-01', taskId: 'P02', expectedStateRevision: 0,
      fields: { result: 'outdoor collection' },
      upstreamRefs: [{ outputId: p01.head.outputId, version: 1 }],
    });
    const p03 = repository.saveDraft({
      studentId: 'stu-01', taskId: 'P03', expectedStateRevision: 0,
      fields: { result: 'complaint collection' },
      upstreamRefs: [{ outputId: p02.head.outputId, version: 1 }],
    });
    assert.deepEqual(p02.versions[0]?.upstreamRefs, [{ outputId: 'stu-01-p01', version: 1 }]);
    assert.deepEqual(p03.versions[0]?.upstreamRefs, [{ outputId: 'stu-01-p02', version: 1 }]);
  } finally {
    fixture.cleanup();
  }
});
