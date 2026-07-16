import assert from 'node:assert/strict';
import test from 'node:test';
import { seedBase } from './db/demo-seed.ts';
import { migrateDatabase } from './db/migrations.ts';
import { createTestDatabase } from './db/test-database.ts';
import { p01Activities } from '../features/learning-activities/activity-catalog.ts';
import { ActivityRepository } from '../features/learning-activities/activity-repository.ts';
import {
  p01EvidenceLibrary,
  seedP01EvidenceLibrary,
} from '../features/portfolio/evidence-library.ts';
import { p01OutputFieldKeys } from '../features/portfolio/p01-output-definition.ts';
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
      response, expectedVersion: 0,
    });
    assert.equal(result.passed, true, activityId);
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
