import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthenticatedActor } from './auth/actor.ts';
import { createTestDatabase } from './db/test-database.ts';
import { migrateDatabase } from './db/migrations.ts';
import { seedDemo } from './db/demo-seed.ts';
import {
  AssessmentRemediationRequiredError,
  AssessmentTokenError,
  FormalAssessmentService,
  type AssessmentAnswers,
} from './formal-assessment-service.ts';

const studentOne: AuthenticatedActor = {
  userId: 'stu-01',
  studentId: 'stu-01',
  username: 'student01',
  displayName: '学生一',
  role: 'student',
  classId: 'demo-class',
};

const studentTwo: AuthenticatedActor = {
  ...studentOne,
  userId: 'stu-02',
  studentId: 'stu-02',
  username: 'student02',
  displayName: '学生二',
};

const wrongAnswers: AssessmentAnswers = {
  evidenceClassification: 'environment-note',
  linkReconstruction: ['management', 'device', 'port-a', 'port-b', 'room'],
  defectiveOutputRevision: [],
  professionalConclusion: '没有问题。',
};

test('issues an answer-free paper and grades and persists only on the server', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const service = new FormalAssessmentService(fixture.database, deterministicOptions());

    const issued = service.issuePaper(studentOne, 'P1T1-N02');
    const serializedPaper = JSON.stringify(issued.paper);
    assert.equal(serializedPaper.includes('correct'), false);
    assert.equal(serializedPaper.includes('targetId'), false);
    assert.equal(serializedPaper.includes('modelAnswer'), false);

    const result = service.submitAnswers(studentOne, issued.attemptToken, wrongAnswers);
    assert.notEqual(result.totalScore, 100);
    assert.equal(result.passed, false);
    assert.deepEqual(Object.keys(result.dimensions), [
      'evidenceClassification',
      'linkReconstruction',
      'defectiveOutputRevision',
      'professionalConclusion',
    ]);
    assert.equal(JSON.stringify(result.paper).includes('correct'), false);

    const stored = fixture.database.prepare(`
      SELECT assessment_id AS assessmentId, question_version AS questionVersion,
        answers_json AS answersJson, diagnostics_json AS diagnosticsJson, origin
      FROM formal_attempts WHERE attempt_id = ?
    `).get(result.attemptId) as {
      assessmentId: string;
      questionVersion: string;
      answersJson: string;
      diagnosticsJson: string;
      origin: string;
    };
    assert.equal(stored.assessmentId, result.assessmentId);
    assert.equal(stored.questionVersion, issued.paper.questionVersion);
    assert.deepEqual(JSON.parse(stored.answersJson), wrongAnswers);
    assert.equal(JSON.parse(stored.diagnosticsJson).totalScore, result.totalScore);
    assert.equal(stored.origin, 'user');
  } finally {
    fixture.cleanup();
  }
});

test('binds a single-use token to one student, node, version, and assessment instance', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const service = new FormalAssessmentService(fixture.database, deterministicOptions());
    const issued = service.issuePaper(studentOne, 'P1T1-N02');

    assert.throws(
      () => service.submitAnswers(studentTwo, issued.attemptToken, wrongAnswers),
      (error) => error instanceof AssessmentTokenError && error.code === 'invalid-token',
    );
    service.submitAnswers(studentOne, issued.attemptToken, wrongAnswers);
    assert.throws(
      () => service.submitAnswers(studentOne, issued.attemptToken, wrongAnswers),
      (error) => error instanceof AssessmentTokenError && error.code === 'used-token',
    );
  } finally {
    fixture.cleanup();
  }
});

test('requires targeted relearning after a failed user attempt and unlocks from stable remediation targets', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const service = new FormalAssessmentService(fixture.database, deterministicOptions());
    const issued = service.issuePaper(studentOne, 'P1T1-N02');
    const failed = service.submitAnswers(studentOne, issued.attemptToken, wrongAnswers);

    assert.throws(
      () => service.issuePaper(studentOne, 'P1T1-N02'),
      (error) => error instanceof AssessmentRemediationRequiredError
        && error.targets.length === failed.remediationTargets.length,
    );

    const insert = fixture.database.prepare(`
      INSERT INTO practice_attempts (
        attempt_id, student_id, activity_id, node_id, response_json, result_json,
        artifact_json, passed, origin, attempted_at
      ) VALUES (?, ?, ?, ?, '{}', ?, '{}', 1, 'user', ?)
    `);
    for (const [index, target] of failed.remediationTargets.entries()) {
      insert.run(
        `remediation-${index}`,
        studentOne.studentId,
        `activity-${index}`,
        target.nodeId,
        JSON.stringify({ remediationTarget: target }),
        '2026-07-16T10:01:00.000Z',
      );
    }

    assert.equal(service.issuePaper(studentOne, 'P1T1-N02').paper.nodeId, 'P1T1-N02');
  } finally {
    fixture.cleanup();
  }
});

function deterministicOptions() {
  let sequence = 0;
  return {
    now: () => new Date('2026-07-16T10:00:00.000Z'),
    randomId: () => `assessment-sequence-${++sequence}`,
    randomToken: () => `token-sequence-${++sequence}-0123456789abcdef`,
  };
}
