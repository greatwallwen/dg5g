import assert from 'node:assert/strict';
import test from 'node:test';
import { seedBase } from './db/demo-seed.ts';
import { migrateDatabase } from './db/migrations.ts';
import { createTestDatabase } from './db/test-database.ts';
import { p01Activities } from '../features/learning-activities/activity-catalog.ts';
import { ActivityRepository } from '../features/learning-activities/activity-repository.ts';
import {
  evidenceLibraryForTask,
  p01EvidenceLibrary,
  readEvidenceDefinition,
  seedEvidenceLibrary,
  seedP01EvidenceLibrary,
} from '../features/portfolio/evidence-library.ts';
import { p01OutputFieldKeys } from '../features/portfolio/p01-output-definition.ts';
import { loadSelfStudyCatalog } from '../features/textbook-scene/self-study-content.ts';
import { professionalOutputSchemaForTask } from '../features/portfolio/output-schema.ts';
import {
  ProfessionalOutputEvidenceError,
  ProfessionalOutputRepository,
  ProfessionalOutputRevisionRequiredError,
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
    const fields = completeP01Fields();

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
      origin: 'user',
    });
    assert.deepEqual(draft.versions, [{
      outputId: 'output-stu-01-p01',
      taskId: 'P01',
      version: 1,
      schemaVersion: 1,
      fields,
      upstreamRefs: [],
      evidenceLinks: {},
      fieldSources: [],
    }]);
    assert.equal(draft.submissionCount, 0);
    assert.deepEqual(draft.reviewHistory, []);

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
    assert.equal(submitted.submissionCount, 1);
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
      fields: completeP01Fields(),
      upstreamRefs: [],
    });
    const studentVersion = topicVersion('learning:stu-01');
    const globalVersion = topicVersion('global');

    assert.throws(() => repository.saveDraft({
      outputId: 'output-conflict',
      studentId: 'stu-01',
      taskId: 'P01',
      expectedStateRevision: 0,
      fields: { ...completeP01Fields(), siteRoom: 'must roll back' },
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
    const firstFields = completeP01Fields();
    const revisedFields = { ...firstFields, evidenceGap: 'corrected evidence gap' };
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
      fields: completeP01Fields(), upstreamRefs: [],
    });
    const otherStudentP01 = repository.saveDraft({
      studentId: 'stu-02', taskId: 'P01', expectedStateRevision: 0,
      fields: { ...completeP01Fields(), siteRoom: 'other student' }, upstreamRefs: [],
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

test('P02 and P03 save and submit task-scoped evidence through the real repository', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    seedEvidenceLibrary(fixture.database);
    seedGeneratedPracticeSources(fixture.database, 'stu-01');
    const outputIds = ['evidence-p01', 'evidence-p02', 'evidence-p03'];
    const repository = new ProfessionalOutputRepository(fixture.database, () => outputIds.shift()!);
    const p01 = repository.saveDraft({
      studentId: 'stu-01', taskId: 'P01', expectedStateRevision: 0,
      fields: completeP01Fields(), upstreamRefs: [],
    });

    let upstream = { outputId: p01.head.outputId, version: p01.head.currentVersion };
    for (const taskId of ['P02', 'P03'] as const) {
      const fields = completeGeneratedFields(taskId);
      const evidenceLinks = evidenceForEveryGeneratedField(taskId);
      const draft = repository.saveDraft({
        studentId: 'stu-01', taskId, expectedStateRevision: 0,
        fields, upstreamRefs: [upstream], evidenceLinks,
      });
      const submitted = repository.submit({
        outputId: draft.head.outputId, studentId: 'stu-01', taskId,
        expectedStateRevision: 1, fields, upstreamRefs: [upstream], evidenceLinks,
      });
      assert.equal(submitted.head.status, 'submitted');
      assert.equal(submitted.head.currentVersion, 1);
      assert.equal(submitted.submissionCount, 1);
      assert.deepEqual(submitted.versions[0]?.evidenceLinks, evidenceLinks);
      assert.deepEqual(
        new Set(submitted.versions[0]?.fieldSources.map(({ fieldKey }) => fieldKey)),
        new Set(Object.keys(fields)),
      );
      assert.equal(submitted.versions[0]?.fieldSources.every(({ sourceAttemptId }) => (
        sourceAttemptId.startsWith(`source-${taskId}-`)
      )), true);
      upstream = { outputId: submitted.head.outputId, version: submitted.head.currentVersion };
    }

    assert.deepEqual(fixture.database.prepare(`
      SELECT json_extract(payload_json, '$.taskId') AS taskId,
        event_type AS eventType
      FROM learning_events
      WHERE student_id = 'stu-01'
        AND json_extract(payload_json, '$.taskId') IN ('P02', 'P03')
      ORDER BY taskId, occurred_at, event_id
    `).all(), [
      { taskId: 'P02', eventType: 'evidence_draft_saved' },
      { taskId: 'P02', eventType: 'evidence_submitted' },
      { taskId: 'P03', eventType: 'evidence_draft_saved' },
      { taskId: 'P03', eventType: 'evidence_submitted' },
    ]);
  } finally {
    fixture.cleanup();
  }
});

test('P02 and P03 reject cross-task and cross-field evidence before writing any fact', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    seedEvidenceLibrary(fixture.database);
    const outputIds = ['invalid-upstream-p01', 'invalid-task-evidence'];
    const repository = new ProfessionalOutputRepository(fixture.database, () => outputIds.shift()!);
    const p01 = repository.saveDraft({
      studentId: 'stu-01', taskId: 'P01', expectedStateRevision: 0,
      fields: completeP01Fields(), upstreamRefs: [],
    });
    const fields = completeGeneratedFields('P02');
    const p01EvidenceId = p01EvidenceLibrary[0]!.evidenceId;
    const wrongP02Definition = evidenceLibraryForTask('P02')
      .find(({ allowedFieldKeys }) => !allowedFieldKeys.includes('sectorIdentity'));
    assert.ok(wrongP02Definition);

    for (const evidenceId of [p01EvidenceId, wrongP02Definition.evidenceId]) {
      assert.throws(() => repository.saveDraft({
        studentId: 'stu-01', taskId: 'P02', expectedStateRevision: 0,
        fields, upstreamRefs: [{ outputId: p01.head.outputId, version: 1 }],
        evidenceLinks: { sectorIdentity: [evidenceId] },
      }), ProfessionalOutputEvidenceError);
      assert.deepEqual(mutationCounts(fixture.database, 'invalid-task-evidence'), {
        heads: 0, versions: 0, links: 0, sources: 0, events: 0,
      });
    }
  } finally {
    fixture.cleanup();
  }
});

test('P01 atomically stores exact fields, evidence links, derived field sources, and explicit user origin', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    seedP01EvidenceLibrary(fixture.database);
    seedPassedP01Activities(fixture.database, 'stu-01');
    const repository = new ProfessionalOutputRepository(fixture.database, () => 'truthful-output');
    const fields = completeP01Fields();
    const roomEvidence = evidenceFor('siteRoom')[0]!;
    const identityEvidence = evidenceFor('deviceIdentity')[0]!;

    const draft = repository.saveDraft({
      studentId: 'stu-01', taskId: 'P01', expectedStateRevision: 0,
      fields, upstreamRefs: [],
      evidenceLinks: { siteRoom: [roomEvidence], deviceIdentity: [identityEvidence] },
    });

    assert.equal(draft.submissionCount, 0);
    assert.deepEqual(draft.reviewHistory, []);
    assert.deepEqual(draft.versions[0]?.evidenceLinks, {
      deviceIdentity: [identityEvidence], siteRoom: [roomEvidence],
    });
    assert.ok(draft.versions[0]?.fieldSources.some(({ fieldKey, sourceAttemptId }) => (
      fieldKey === 'siteRoom' && sourceAttemptId === 'source-P1T1-N01-micro-01'
    )));
    assert.ok(draft.versions[0]?.fieldSources.some(({ fieldKey, sourceAttemptId }) => (
      fieldKey === 'deviceIdentity' && sourceAttemptId === 'source-P1T1-N02-transfer-01'
    )));
    assert.deepEqual(fixture.database.prepare(`
      SELECT origin FROM professional_outputs WHERE output_id = 'truthful-output'
    `).get(), { origin: 'user' });
    assert.equal(draft.head.origin, 'user');
    assert.deepEqual(fixture.database.prepare(`
      SELECT DISTINCT origin FROM learning_events
      WHERE json_extract(payload_json, '$.outputId') = 'truthful-output'
    `).all(), [{ origin: 'user' }]);
  } finally {
    fixture.cleanup();
  }
});

test('an evidence-only revision appends V2 while V1 links and provenance remain immutable', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    seedP01EvidenceLibrary(fixture.database);
    seedPassedP01Activities(fixture.database, 'stu-01');
    const repository = new ProfessionalOutputRepository(fixture.database, () => 'evidence-revision');
    const fields = completeP01Fields();
    const [firstEvidence, secondEvidence] = evidenceFor('photoIndex');
    assert.ok(firstEvidence && secondEvidence);

    repository.saveDraft({
      studentId: 'stu-01', taskId: 'P01', expectedStateRevision: 0,
      fields, upstreamRefs: [], evidenceLinks: { photoIndex: [firstEvidence] },
    });
    const v2 = repository.saveDraft({
      outputId: 'evidence-revision', studentId: 'stu-01', taskId: 'P01',
      expectedStateRevision: 1, fields, upstreamRefs: [],
      evidenceLinks: { photoIndex: [secondEvidence] },
    });

    assert.equal(v2.head.currentVersion, 2);
    assert.deepEqual(v2.versions.map(({ version, evidenceLinks }) => ({ version, evidenceLinks })), [
      { version: 1, evidenceLinks: { photoIndex: [firstEvidence] } },
      { version: 2, evidenceLinks: { photoIndex: [secondEvidence] } },
    ]);
    assert.deepEqual(v2.versions[1]?.fieldSources, v2.versions[0]?.fieldSources);
    assert.throws(() => fixture.database.prepare(`
      UPDATE output_evidence_links SET evidence_id = ?
      WHERE output_id = 'evidence-revision' AND version = 1
    `).run(secondEvidence), /output evidence links are immutable/i);
  } finally {
    fixture.cleanup();
  }
});

test('a returned output cannot be resubmitted until fields, evidence, sources, or upstream refs create a new version', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    seedP01EvidenceLibrary(fixture.database);
    const repository = new ProfessionalOutputRepository(fixture.database, () => 'returned-output');
    const fields = completeP01Fields();
    const evidence = evidenceFor('photoIndex');
    const draft = repository.saveDraft({
      studentId: 'stu-01', taskId: 'P01', expectedStateRevision: 0,
      fields, upstreamRefs: [], evidenceLinks: { photoIndex: [evidence[0]!] },
    });
    repository.submit({
      outputId: draft.head.outputId, studentId: 'stu-01', taskId: 'P01',
      expectedStateRevision: 1, fields, upstreamRefs: [],
      evidenceLinks: { photoIndex: [evidence[0]!] },
    });
    repository.reviewSubmitted({
      teacherId: 'teacher-01', classId: 'demo-class', outputId: draft.head.outputId,
      expectedStateRevision: 2, action: 'return', feedback: '请补齐第二份证据。',
    });
    const before = mutationCounts(fixture.database, draft.head.outputId);

    assert.throws(() => repository.submit({
      outputId: draft.head.outputId, studentId: 'stu-01', taskId: 'P01',
      expectedStateRevision: 3, fields, upstreamRefs: [],
      evidenceLinks: { photoIndex: [evidence[0]!] },
    }), ProfessionalOutputRevisionRequiredError);
    assert.deepEqual(mutationCounts(fixture.database, draft.head.outputId), before);

    const revised = repository.saveDraft({
      outputId: draft.head.outputId, studentId: 'stu-01', taskId: 'P01',
      expectedStateRevision: 3, fields, upstreamRefs: [],
      evidenceLinks: { photoIndex: [evidence[0]!, evidence[1]!] },
    });
    const resubmitted = repository.submit({
      outputId: draft.head.outputId, studentId: 'stu-01', taskId: 'P01',
      expectedStateRevision: 4, fields, upstreamRefs: [],
      evidenceLinks: { photoIndex: [evidence[0]!, evidence[1]!] },
    });
    assert.equal(revised.head.currentVersion, 2);
    assert.equal(resubmitted.head.currentVersion, 2);
    assert.equal(resubmitted.submissionCount, 2);
    assert.deepEqual(resubmitted.reviewHistory.map(({ status }) => status), ['returned']);
  } finally {
    fixture.cleanup();
  }
});

test('persisted returned head status blocks unchanged resubmission even for a legacy review without a version event', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    const repository = new ProfessionalOutputRepository(fixture.database, () => 'legacy-returned-output');
    const fields = completeP01Fields();
    repository.saveDraft({
      studentId: 'stu-01', taskId: 'P01', expectedStateRevision: 0,
      fields, upstreamRefs: [],
    });
    repository.submit({
      outputId: 'legacy-returned-output', studentId: 'stu-01', taskId: 'P01',
      expectedStateRevision: 1, fields, upstreamRefs: [],
    });
    fixture.database.prepare(`
      UPDATE professional_outputs
      SET status = 'returned', state_revision = 3
      WHERE output_id = 'legacy-returned-output'
    `).run();

    assert.throws(() => repository.submit({
      outputId: 'legacy-returned-output', studentId: 'stu-01', taskId: 'P01',
      expectedStateRevision: 3, fields, upstreamRefs: [],
    }), ProfessionalOutputRevisionRequiredError);
  } finally {
    fixture.cleanup();
  }
});

test('new provenance alone cannot satisfy a teacher return when editable fields and evidence are unchanged', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    const repository = new ProfessionalOutputRepository(fixture.database, () => 'source-only-revision');
    const fields = completeP01Fields();
    repository.saveDraft({
      studentId: 'stu-01', taskId: 'P01', expectedStateRevision: 0,
      fields, upstreamRefs: [],
    });
    repository.submit({
      outputId: 'source-only-revision', studentId: 'stu-01', taskId: 'P01',
      expectedStateRevision: 1, fields, upstreamRefs: [],
    });
    repository.reviewSubmitted({
      teacherId: 'teacher-01', classId: 'demo-class', outputId: 'source-only-revision',
      expectedStateRevision: 2, action: 'return', feedback: '请修订最终可交付字段。',
    });
    seedPassedP01Activities(fixture.database, 'stu-01');

    assert.throws(() => repository.submit({
      outputId: 'source-only-revision', studentId: 'stu-01', taskId: 'P01',
      expectedStateRevision: 3, fields, upstreamRefs: [],
    }), ProfessionalOutputRevisionRequiredError);
    const unchanged = repository.read('stu-01', 'P01', 'source-only-revision')!;
    assert.equal(unchanged.head.status, 'returned');
    assert.equal(unchanged.head.currentVersion, 1);
    assert.equal(unchanged.submissionCount, 1);
  } finally {
    fixture.cleanup();
  }
});

test('changing then reverting to the exact returned fields cannot bypass the revision requirement', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    const repository = new ProfessionalOutputRepository(fixture.database, () => 'reverted-revision');
    const returnedFields = completeP01Fields();
    repository.saveDraft({
      studentId: 'stu-01', taskId: 'P01', expectedStateRevision: 0,
      fields: returnedFields, upstreamRefs: [],
    });
    repository.submit({
      outputId: 'reverted-revision', studentId: 'stu-01', taskId: 'P01',
      expectedStateRevision: 1, fields: returnedFields, upstreamRefs: [],
    });
    repository.reviewSubmitted({
      teacherId: 'teacher-01', classId: 'demo-class', outputId: 'reverted-revision',
      expectedStateRevision: 2, action: 'return', feedback: '连接方向需要实质修订。',
    });
    const changed = repository.saveDraft({
      outputId: 'reverted-revision', studentId: 'stu-01', taskId: 'P01',
      expectedStateRevision: 3,
      fields: { ...returnedFields, connectionDirection: '曾经修改但最终撤销' },
      upstreamRefs: [],
    });
    const reverted = repository.saveDraft({
      outputId: 'reverted-revision', studentId: 'stu-01', taskId: 'P01',
      expectedStateRevision: 4, fields: returnedFields, upstreamRefs: [],
    });
    assert.equal(changed.head.currentVersion, 2);
    assert.equal(reverted.head.currentVersion, 3);

    assert.throws(() => repository.submit({
      outputId: 'reverted-revision', studentId: 'stu-01', taskId: 'P01',
      expectedStateRevision: 5, fields: returnedFields, upstreamRefs: [],
    }), ProfessionalOutputRevisionRequiredError);
    assert.equal(repository.read('stu-01', 'P01', 'reverted-revision')!.head.status, 'draft');
  } finally {
    fixture.cleanup();
  }
});

test('unknown or cross-field evidence and unknown P01 fields roll back every output fact', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    seedP01EvidenceLibrary(fixture.database);
    const repository = new ProfessionalOutputRepository(fixture.database, () => 'invalid-output');
    const fields = completeP01Fields();
    const evidenceNotAllowedForSite = p01EvidenceLibrary.find(({ allowedFieldKeys }) => (
      !allowedFieldKeys.includes('siteRoom')
    ))?.evidenceId;
    assert.ok(evidenceNotAllowedForSite);

    const invalidInputs: Array<{
      fields: Record<string, string>;
      evidenceLinks: Record<string, string[]>;
    }> = [
      { fields, evidenceLinks: { siteRoom: ['P01-EV-FORGED'] } },
      { fields, evidenceLinks: { siteRoom: [evidenceNotAllowedForSite] } },
      { fields: { ...fields, inventedField: 'forged' }, evidenceLinks: {} },
    ];
    for (const input of invalidInputs) {
      assert.throws(() => repository.saveDraft({
        studentId: 'stu-01', taskId: 'P01', expectedStateRevision: 0,
        upstreamRefs: [], ...input,
      }), (error: unknown) => (
        error instanceof ProfessionalOutputEvidenceError || error instanceof TypeError
      ));
      assert.deepEqual(mutationCounts(fixture.database, 'invalid-output'), {
        heads: 0, versions: 0, links: 0, sources: 0, events: 0,
      });
    }
  } finally {
    fixture.cleanup();
  }
});

test('field provenance never crosses students and aggregate reads every version link, source, and review fact', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    seedP01EvidenceLibrary(fixture.database);
    seedPassedP01Activities(fixture.database, 'stu-02');
    const repository = new ProfessionalOutputRepository(fixture.database, () => 'student-isolated');
    const fields = completeP01Fields();
    const evidence = evidenceFor('photoIndex')[0]!;
    const draft = repository.saveDraft({
      studentId: 'stu-01', taskId: 'P01', expectedStateRevision: 0,
      fields, upstreamRefs: [], evidenceLinks: { photoIndex: [evidence] },
    });
    assert.deepEqual(draft.versions[0]?.fieldSources, []);
    repository.submit({
      outputId: draft.head.outputId, studentId: 'stu-01', taskId: 'P01',
      expectedStateRevision: 1, fields, upstreamRefs: [], evidenceLinks: { photoIndex: [evidence] },
    });
    repository.reviewSubmitted({
      teacherId: 'teacher-01', classId: 'demo-class', outputId: draft.head.outputId,
      expectedStateRevision: 2, action: 'return', feedback: '补充本端来源。',
    });

    const aggregate = repository.read('stu-01', 'P01', draft.head.outputId)!;
    assert.equal(aggregate.submissionCount, 1);
    assert.equal(aggregate.reviewHistory.length, 1);
    assert.equal(aggregate.reviewHistory[0]?.outputVersion, 1);
    assert.equal(aggregate.reviewHistory[0]?.origin, 'user');
    assert.deepEqual(aggregate.versions[0]?.evidenceLinks, { photoIndex: [evidence] });
    assert.deepEqual(aggregate.versions[0]?.fieldSources, []);
  } finally {
    fixture.cleanup();
  }
});

function completeP01Fields(): Record<string, string> {
  return Object.fromEntries(p01OutputFieldKeys.map((key) => [key, `已填写 ${key}`]));
}

function evidenceFor(fieldKey: (typeof p01OutputFieldKeys)[number]): string[] {
  return p01EvidenceLibrary
    .filter(({ allowedFieldKeys }) => allowedFieldKeys.includes(fieldKey))
    .map(({ evidenceId }) => evidenceId);
}

function completeGeneratedFields(taskId: 'P02' | 'P03'): Record<string, string> {
  return Object.fromEntries(professionalOutputSchemaForTask(loadSelfStudyCatalog(), taskId)
    .fields.map(({ key }) => [key, `${taskId} 已填写：${key}`]));
}

function evidenceForEveryGeneratedField(taskId: 'P02' | 'P03'): Record<string, string[]> {
  return Object.fromEntries(professionalOutputSchemaForTask(loadSelfStudyCatalog(), taskId)
    .fields.map(({ key }) => {
      const evidence = evidenceLibraryForTask(taskId)
        .find(({ allowedFieldKeys }) => allowedFieldKeys.includes(key));
      assert.ok(evidence && readEvidenceDefinition(taskId, evidence.evidenceId));
      return [key, [evidence.evidenceId]];
    }));
}

function seedPassedP01Activities(
  database: Parameters<typeof seedP01EvidenceLibrary>[0],
  studentId: string,
): void {
  const repository = new ActivityRepository(database);
  const responseByActivity: Record<string, Record<string, unknown>> = {
    'P1T1-N01-micro-01': { assignments: {
      'room-01-cabinets': 'in-scope', 'shared-operator-cabinet': 'out-of-scope',
      'room-02-cabinets': 'out-of-scope',
    } },
    'P1T1-N02-foundation-01': { assignments: {
      'room-overview': 'location', 'device-nameplate': 'identity', 'two-ended-port-trace': 'link',
    } },
    'P1T1-N02-application-01': { order: ['bbu-port', 'odf-in', 'odf-out', 'aau-port'] },
    'P1T1-N02-transfer-01': { fields: {
      siteId: 'HY-01', roomId: '01', cabinetId: 'K02', deviceId: 'BBU-01',
      nearPort: 'BBU-1/0', farPort: 'AAU-1',
    } },
    'P1T1-N03-micro-01': { states: {
      power: 'confirmed', grounding: 'missing', transport: 'confirmed', environment: 'conflicting',
    } },
  };
  for (const [activityId, response] of Object.entries(responseByActivity)) {
    const activity = p01Activities.find(({ activity }) => activity.id === activityId);
    assert.ok(activity);
    const result = repository.recordEvaluatedAttempt({
      attemptId: `source-${activityId}`, studentId, activity,
      response, delivery: { channel: 'self-study' },
    });
    assert.equal(result.passed, true, activityId);
  }
}

function seedGeneratedPracticeSources(
  database: Parameters<typeof seedP01EvidenceLibrary>[0],
  studentId: string,
): void {
  const activityByField: Record<'P02' | 'P03', Record<string, [string, string]>> = {
    P02: {
      sectorIdentity: ['P1T2-N01-micro-01', 'P1T2-N01'],
      azimuth: ['P1T2-N02-foundation-01', 'P1T2-N02'],
      tilt: ['P1T2-N02-foundation-01', 'P1T2-N02'],
      height: ['P1T2-N02-application-01', 'P1T2-N02'],
      environment: ['P1T2-N02-transfer-01', 'P1T2-N02'],
      judgement: ['P1T2-N03-micro-01', 'P1T2-N03'],
    },
    P03: {
      complaintBaseline: ['P1T3-N01-micro-01', 'P1T3-N01'],
      reproductionConditions: ['P1T3-N02-foundation-01', 'P1T3-N02'],
      businessEvidence: ['P1T3-N02-application-01', 'P1T3-N02'],
      networkEvidence: ['P1T3-N02-application-01', 'P1T3-N02'],
      comparison: ['P1T3-N02-transfer-01', 'P1T3-N02'],
      judgement: ['P1T3-N03-micro-01', 'P1T3-N03'],
    },
  };
  const insert = database.prepare(`
    INSERT INTO practice_attempts (
      attempt_id, student_id, activity_id, node_id, response_json, result_json,
      artifact_json, passed, origin, attempted_at
    ) VALUES (?, ?, ?, ?, '{}', '{"passed":true}', '{}', 1, 'user', CURRENT_TIMESTAMP)
  `);
  const unique = new Map<string, [string, string]>();
  for (const [taskId, mapping] of Object.entries(activityByField)) {
    for (const [activityId, nodeId] of Object.values(mapping)) {
      unique.set(`${taskId}\u0000${activityId}`, [activityId, nodeId]);
    }
  }
  for (const [identity, [activityId, nodeId]] of unique) {
    const taskId = identity.slice(0, 3);
    insert.run(`source-${taskId}-${activityId}`, studentId, activityId, nodeId);
  }
}

function mutationCounts(
  database: Parameters<typeof seedP01EvidenceLibrary>[0],
  outputId: string,
): { heads: number; versions: number; links: number; sources: number; events: number } {
  return {
    heads: database.prepare('SELECT COUNT(*) FROM professional_outputs WHERE output_id = ?').pluck().get(outputId) as number,
    versions: database.prepare('SELECT COUNT(*) FROM professional_output_versions WHERE output_id = ?').pluck().get(outputId) as number,
    links: database.prepare('SELECT COUNT(*) FROM output_evidence_links WHERE output_id = ?').pluck().get(outputId) as number,
    sources: database.prepare('SELECT COUNT(*) FROM output_field_sources WHERE output_id = ?').pluck().get(outputId) as number,
    events: database.prepare(`
      SELECT COUNT(*) FROM learning_events WHERE json_extract(payload_json, '$.outputId') = ?
    `).pluck().get(outputId) as number,
  };
}
