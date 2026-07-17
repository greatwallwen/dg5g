import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateDatabase } from './db/migrations.ts';
import { seedDemo } from './db/demo-seed.ts';
import { createTestDatabase } from './db/test-database.ts';
import {
  AssessmentDraftRevisionConflictError,
  FormalAssessmentAttemptRepository,
} from './formal-assessment-attempt-repository.ts';

test('draft compare-and-swap requires revision zero for the first write and never overwrites a newer draft', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    fixture.database.prepare(`
      INSERT INTO formal_assessment_instances (
        assessment_id, node_id, game_id, question_version, status,
        opened_at, expires_at, created_at
      ) VALUES (
        'assessment-draft-cas', 'P1T1-N02', 'P1T1-N02-server-assessment',
        'p01-n02-v1', 'running', '2026-07-17T01:00:00.000Z',
        '2026-07-17T01:15:00.000Z', '2026-07-17T01:00:00.000Z'
      )
    `).run();
    const repository = new FormalAssessmentAttemptRepository(fixture.database);

    assert.throws(
      () => repository.saveDraft({
        assessmentId: 'assessment-draft-cas',
        studentId: 'stu-01',
        answers: { evidenceClassification: 'nameplate-photo' },
        expectedRevision: 7,
        updatedAt: '2026-07-17T01:01:00.000Z',
      }),
      AssessmentDraftRevisionConflictError,
    );
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM formal_assessment_drafts
      WHERE assessment_id = 'assessment-draft-cas'
    `).pluck().get(), 0);

    const first = repository.saveDraft({
      assessmentId: 'assessment-draft-cas',
      studentId: 'stu-01',
      answers: { evidenceClassification: 'nameplate-photo' },
      expectedRevision: 0,
      updatedAt: '2026-07-17T01:01:00.000Z',
    });
    assert.equal(first.revision, 1);

    assert.throws(
      () => repository.saveDraft({
        assessmentId: 'assessment-draft-cas',
        studentId: 'stu-01',
        answers: { evidenceClassification: 'location-photo' },
        expectedRevision: 0,
        updatedAt: '2026-07-17T01:02:00.000Z',
      }),
      AssessmentDraftRevisionConflictError,
    );
    assert.deepEqual(repository.readDraft('assessment-draft-cas', 'stu-01'), first);

    const second = repository.saveDraft({
      assessmentId: 'assessment-draft-cas',
      studentId: 'stu-01',
      answers: {
        evidenceClassification: 'nameplate-photo',
        linkReconstruction: ['source-device'],
      },
      expectedRevision: 1,
      updatedAt: '2026-07-17T01:03:00.000Z',
    });
    assert.equal(second.revision, 2);
    assert.deepEqual(second.answers.linkReconstruction, ['source-device']);
  } finally {
    fixture.cleanup();
  }
});

test('draft repository rejects oversized serialized answers before the first write', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    fixture.database.prepare(`
      INSERT INTO formal_assessment_instances (
        assessment_id, node_id, game_id, question_version, status,
        opened_at, expires_at, created_at
      ) VALUES (
        'assessment-draft-size', 'P1T1-N02', 'P1T1-N02-server-assessment',
        'p01-n02-v1', 'running', '2026-07-17T01:00:00.000Z',
        '2026-07-17T01:15:00.000Z', '2026-07-17T01:00:00.000Z'
      )
    `).run();
    const repository = new FormalAssessmentAttemptRepository(fixture.database);

    assert.throws(() => repository.saveDraft({
      assessmentId: 'assessment-draft-size',
      studentId: 'stu-01',
      answers: { professionalConclusion: { confirmedFact: 'x'.repeat(33_000) } },
      expectedRevision: 0,
      updatedAt: '2026-07-17T01:01:00.000Z',
    }), (error) => error instanceof TypeError && /size/i.test(error.message));
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM formal_assessment_drafts
      WHERE assessment_id = 'assessment-draft-size'
    `).pluck().get(), 0);
  } finally {
    fixture.cleanup();
  }
});
