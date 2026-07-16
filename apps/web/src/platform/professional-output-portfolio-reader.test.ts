import assert from 'node:assert/strict';
import test from 'node:test';
import { assessmentDimensionKeys } from './formal-assessment-contract.ts';
import { seedP01EvidenceLibrary } from '../features/portfolio/evidence-library.ts';
import { p01OutputFieldKeys } from '../features/portfolio/p01-output-definition.ts';
import { seedBase } from './db/demo-seed.ts';
import { migrateDatabase } from './db/migrations.ts';
import { createTestDatabase } from './db/test-database.ts';
import { ProfessionalOutputPortfolioReader } from './professional-output-portfolio-reader.ts';
import { ProfessionalOutputRepository } from './professional-output-repository.ts';

test('reads only the owned output with immutable evidence, sources, annotations, and the frozen diagnosis', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    seedP01EvidenceLibrary(fixture.database);
    seedPortfolioFacts(fixture.database);

    const facts = new ProfessionalOutputPortfolioReader(fixture.database).read('stu-01', 'P01');

    assert.equal(facts.output?.head.outputId, 'output-stu-01');
    assert.equal(facts.output?.head.studentId, 'stu-01');
    assert.equal(facts.output?.head.origin, 'user');
    assert.deepEqual(facts.output?.versions.map(({ version }) => version), [1, 2]);
    assert.equal(facts.output?.versions[0]?.evidenceLinks.siteRoom?.[0]?.title, 'HY-01机房与采集环境全景');
    assert.equal(facts.output?.versions[0]?.evidenceLinks.siteRoom?.[0]?.assetUrl, '/media/5g/image29.png');
    assert.equal(facts.output?.versions[0]?.evidenceLinks.siteRoom?.[0]?.metadata.annotation, '站点、机房与室内采集环境同框');
    assert.equal(facts.output?.versions[0]?.evidenceLinks.deviceIdentity, undefined);
    assert.equal(facts.output?.versions[1]?.evidenceLinks.siteRoom, undefined);
    assert.equal(facts.output?.versions[1]?.evidenceLinks.deviceIdentity?.[0]?.evidenceId, 'P01-EV-BBU-NAMEPLATE');
    assert.deepEqual(facts.output?.versions[1]?.fieldSources, [{
      fieldKey: 'siteRoom', sourceNodeId: 'P1T1-N01', sourceAttemptId: 'attempt-scope',
    }]);
    assert.deepEqual(facts.output?.reviewHistory.map(({ reviewId, outputVersion, annotations }) => ({
      reviewId, outputVersion, annotations,
    })), [
      {
        reviewId: 'review-return', outputVersion: 1,
        annotations: [{ fieldKey: 'siteRoom', comment: '补拍柜号与设备同框照片。' }],
      },
      {
        reviewId: 'review-verify', outputVersion: 2,
        annotations: [{ fieldKey: 'evidenceGap', comment: '缺口已闭环。' }],
      },
    ]);
    assert.equal(facts.assessment?.attemptId, 'formal-user-frozen');
    assert.equal(facts.assessment?.totalScore, 92);
    assert.equal(facts.assessment?.origin, 'user');
    assert.deepEqual(Object.keys(facts.assessment?.dimensions ?? {}), assessmentDimensionKeys);
    const serialized = JSON.stringify(facts);
    assert.doesNotMatch(serialized, /answers_json|secret-answer|response_json|student two/);
  } finally {
    fixture.cleanup();
  }
});

test('returns an explicit unformed fact set and never crosses the student plus task ownership boundary', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    seedP01EvidenceLibrary(fixture.database);
    seedPortfolioFacts(fixture.database);
    const reader = new ProfessionalOutputPortfolioReader(fixture.database);

    assert.deepEqual(reader.read('stu-03', 'P01'), { taskId: 'P01' });
    assert.equal(reader.read('stu-02', 'P01').output?.head.outputId, 'output-stu-02');
    assert.equal(reader.read('stu-01', 'P02').output, undefined);
  } finally {
    fixture.cleanup();
  }
});

test('does not expose a frozen diagnosis that fails the shared persisted-assessment validator', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    seedP01EvidenceLibrary(fixture.database);
    seedPortfolioFacts(fixture.database);
    fixture.database.prepare(`
      UPDATE formal_attempts SET diagnostics_json = json_set(
        diagnostics_json, '$.dimensions.evidenceClassification.score', 30
      ) WHERE attempt_id = 'formal-user-frozen'
    `).run();

    const facts = new ProfessionalOutputPortfolioReader(fixture.database).read('stu-01', 'P01');

    assert.equal(facts.assessment, undefined);
  } finally {
    fixture.cleanup();
  }
});

test('production verification freezes and reads the exact highest valid attempt rather than a later lower attempt', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    seedP01EvidenceLibrary(fixture.database);
    const repository = new ProfessionalOutputRepository(fixture.database, () => 'output-production-reader');
    const fields = Object.fromEntries(p01OutputFieldKeys.map((key) => [key, `已填写：${key}`]));
    repository.saveDraft({
      studentId: 'stu-01', taskId: 'P01', expectedStateRevision: 0,
      fields, upstreamRefs: [],
    });
    repository.submit({
      outputId: 'output-production-reader', studentId: 'stu-01', taskId: 'P01',
      expectedStateRevision: 1, fields, upstreamRefs: [],
    });
    insertFormal(fixture.database, 'formal-production-92', 'assessment-production-92', 'stu-01', 92, 'user', '2026-07-16T07:00:00.000Z');
    insertFormal(fixture.database, 'formal-production-later-84', 'assessment-production-later-84', 'stu-01', 84, 'user', '2026-07-16T10:00:00.000Z');
    insertFormal(fixture.database, 'formal-malformed-100', 'assessment-malformed-100', 'stu-01', 100, 'user', '2026-07-16T11:00:00.000Z');
    fixture.database.prepare(`
      UPDATE formal_attempts SET diagnostics_json = json_set(
        diagnostics_json, '$.dimensions.evidenceClassification.score', 30
      ) WHERE attempt_id = 'formal-malformed-100'
    `).run();
    const reviewed = repository.reviewSubmitted({
      teacherId: 'teacher-01', classId: 'demo-class', outputId: 'output-production-reader',
      expectedStateRevision: 2, action: 'verify', feedback: '证据闭环。',
      rubricScores: { evidence: 94 },
    });

    assert.equal(reviewed.frozenTaskScore?.details.nodeTestAttemptId, 'formal-production-92');
    assert.equal(reviewed.frozenTaskScore?.details.assessmentId, 'assessment-production-92');
    const facts = new ProfessionalOutputPortfolioReader(fixture.database).read('stu-01', 'P01');
    assert.equal(facts.assessment?.attemptId, 'formal-production-92');
    assert.equal(facts.assessment?.totalScore, 92);
  } finally {
    fixture.cleanup();
  }
});

function seedPortfolioFacts(database: ReturnType<typeof createTestDatabase>['database']): void {
  database.prepare(`
    INSERT INTO practice_attempts (
      attempt_id, student_id, activity_id, node_id, response_json, result_json,
      artifact_json, passed, origin, attempted_at
    ) VALUES ('attempt-scope', 'stu-01', 'P1T1-N01-micro-01', 'P1T1-N01', '{}', '{}', '{}', 1, 'user', '2026-07-16T06:00:00.000Z')
  `).run();
  insertOutput(database, 'output-stu-01', 'stu-01', 2, 'verified', 'user');
  insertVersion(database, 'output-stu-01', 1, { siteRoom: 'HY-01 / 01号机房', evidenceGap: '缺柜号同框' });
  insertVersion(database, 'output-stu-01', 2, { siteRoom: 'HY-01 / 01号机房 / 02号柜', evidenceGap: '缺口已闭环' });
  for (const version of [1, 2]) {
    database.prepare(`INSERT INTO output_field_sources (output_id, version, field_key, source_node_id, source_attempt_id) VALUES (?, ?, 'siteRoom', 'P1T1-N01', 'attempt-scope')`).run('output-stu-01', version);
  }
  database.prepare(`INSERT INTO output_evidence_links (output_id, version, field_key, evidence_id) VALUES ('output-stu-01', 1, 'siteRoom', 'P01-EV-ROOM-OVERVIEW')`).run();
  database.prepare(`INSERT INTO output_evidence_links (output_id, version, field_key, evidence_id) VALUES ('output-stu-01', 2, 'deviceIdentity', 'P01-EV-BBU-NAMEPLATE')`).run();
  insertReview(database, 'review-return', 'returned', 1, 'siteRoom', '补拍柜号与设备同框照片。', '2026-07-16T08:00:00.000Z');
  insertReview(database, 'review-verify', 'verified', 2, 'evidenceGap', '缺口已闭环。', '2026-07-16T09:00:00.000Z');

  insertOutput(database, 'output-stu-02', 'stu-02', 1, 'returned', 'demo');
  insertVersion(database, 'output-stu-02', 1, { siteRoom: 'student two private output' });

  insertFormal(database, 'formal-demo-high', 'assessment-demo', 'stu-01', 99, 'demo', '2026-07-16T10:00:00.000Z');
  insertFormal(database, 'formal-user-frozen', 'assessment-user-frozen', 'stu-01', 92, 'user', '2026-07-16T07:00:00.000Z');
  insertFormal(database, 'formal-user-newer', 'assessment-user-newer', 'stu-01', 84, 'user', '2026-07-16T11:00:00.000Z');
  database.prepare(`
    INSERT INTO frozen_task_scores (
      score_id, student_id, task_id, snapshot_version, provisional_score,
      official_score, details_json, origin
    ) VALUES ('score-stu-01-p01', 'stu-01', 'P01', 7, 93, 93, ?, 'user')
  `).run(JSON.stringify({
    nodeTestAttemptId: 'formal-user-frozen',
    assessmentId: 'assessment-user-frozen',
    questionVersion: 'p01-n02-v1',
  }));
}

function insertOutput(
  database: ReturnType<typeof createTestDatabase>['database'],
  outputId: string,
  studentId: string,
  currentVersion: number,
  status: 'returned' | 'verified',
  origin: 'demo' | 'user',
): void {
  database.prepare(`
    INSERT INTO professional_outputs (
      output_id, student_id, task_id, node_id, status, content_json,
      current_version, state_revision, origin
    ) VALUES (?, ?, 'P01', 'P1T1-N04', ?, '{}', ?, 4, ?)
  `).run(outputId, studentId, status, currentVersion, origin);
}

function insertVersion(
  database: ReturnType<typeof createTestDatabase>['database'],
  outputId: string,
  version: number,
  fields: Record<string, string>,
): void {
  database.prepare(`
    INSERT INTO professional_output_versions (
      output_id, task_id, version, schema_version, fields_json, upstream_refs_json
    ) VALUES (?, 'P01', ?, 1, ?, '[]')
  `).run(outputId, version, JSON.stringify(fields));
}

function insertReview(
  database: ReturnType<typeof createTestDatabase>['database'],
  reviewId: string,
  status: 'returned' | 'verified',
  outputVersion: number,
  fieldKey: string,
  comment: string,
  reviewedAt: string,
): void {
  database.prepare(`
    INSERT INTO output_reviews (review_id, output_id, reviewer_id, status, score, feedback, reviewed_at, origin)
    VALUES (?, 'output-stu-01', 'teacher-01', ?, ?, ?, ?, 'user')
  `).run(reviewId, status, status === 'verified' ? 94 : null, `${status} feedback`, reviewedAt);
  database.prepare(`INSERT INTO output_review_annotations (review_id, field_key, comment) VALUES (?, ?, ?)`).run(reviewId, fieldKey, comment);
  database.prepare(`
    INSERT INTO learning_events (event_id, student_id, node_id, channel, event_type, payload_json, occurred_at, origin)
    VALUES (?, 'stu-01', 'P1T1-N04', 'classroom', ?, ?, ?, 'user')
  `).run(`event-${reviewId}`, `teacher_${status}`, JSON.stringify({ reviewId, version: outputVersion }), reviewedAt);
}

function insertFormal(
  database: ReturnType<typeof createTestDatabase>['database'],
  attemptId: string,
  assessmentId: string,
  studentId: string,
  score: number,
  origin: 'demo' | 'user',
  completedAt: string,
): void {
  database.prepare(`
    INSERT INTO formal_assessment_instances (
      assessment_id, node_id, game_id, question_version, status, created_at
    ) VALUES (?, 'P1T1-N02', 'game-topology', 'p01-n02-v1', 'closed', ?)
  `).run(assessmentId, completedAt);
  const dimensions = Object.fromEntries(assessmentDimensionKeys.map((key) => [key, {
    score: score / 4, maxScore: 25, feedback: `${key} feedback`,
  }]));
  database.prepare(`
    INSERT INTO formal_attempts (
      attempt_id, student_id, node_id, assessment_id, game_id, score,
      completed_at, question_version, answers_json, diagnostics_json, origin
    ) VALUES (?, ?, 'P1T1-N02', ?, 'game-topology', ?, ?, 'p01-n02-v1', ?, ?, ?)
  `).run(attemptId, studentId, assessmentId, score, completedAt,
    JSON.stringify({ secret: 'secret-answer' }),
    JSON.stringify({
      assessmentId, attemptId, studentId, nodeId: 'P1T1-N02', gameId: 'game-topology', questionVersion: 'p01-n02-v1',
      totalScore: score, passed: score >= 80, dimensions, remediationTargets: [], origin, completedAt,
    }), origin);
}
