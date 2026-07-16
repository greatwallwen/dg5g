import assert from 'node:assert/strict';
import test from 'node:test';
import { assessmentDimensionKeys } from './formal-assessment-contract.ts';
import {
  validatePersistedAssessmentDiagnostic,
  type PersistedAssessmentCandidate,
} from './persisted-assessment-diagnostic.ts';

test('accepts one closed persisted assessment whose row, instance, dimensions, and remediation agree', () => {
  const candidate = validCandidate();

  const validated = validatePersistedAssessmentDiagnostic(candidate, {
    passScore: 80,
    allowedRemediationTargets: [],
  });

  assert.ok(validated);
  assert.equal(validated.attemptId, candidate.attemptId);
  assert.equal(validated.studentId, candidate.studentId);
  assert.equal(validated.gameId, candidate.gameId);
  assert.equal(validated.totalScore, 92);
  assert.deepEqual(Object.keys(validated.dimensions), assessmentDimensionKeys);
});

test('rejects malformed high scores and every persisted identity mismatch', () => {
  const mutations: Array<(candidate: ReturnType<typeof validCandidate>, diagnostics: Record<string, any>) => void> = [
    (candidate) => { candidate.instanceStatus = 'running'; },
    (candidate) => { candidate.instanceGameId = 'other-game'; },
    (_candidate, diagnostics) => { diagnostics.studentId = 'stu-other'; },
    (_candidate, diagnostics) => { diagnostics.gameId = 'other-game'; },
    (_candidate, diagnostics) => { diagnostics.completedAt = '2026-07-16T09:00:00.000Z'; },
    (_candidate, diagnostics) => { diagnostics.passed = false; },
    (_candidate, diagnostics) => { diagnostics.dimensions.evidenceClassification.score = 26; },
    (_candidate, diagnostics) => { diagnostics.dimensions.evidenceClassification.feedback = ' '; },
    (_candidate, diagnostics) => { delete diagnostics.dimensions.professionalConclusion; },
    (_candidate, diagnostics) => { diagnostics.dimensions.extra = { score: 0, maxScore: 25, feedback: 'extra' }; },
    (_candidate, diagnostics) => { diagnostics.answerKey = 'must-not-be-persisted'; },
  ];

  for (const mutate of mutations) {
    const candidate = validCandidate();
    const diagnostics = JSON.parse(candidate.diagnosticsJson!) as Record<string, any>;
    mutate(candidate, diagnostics);
    candidate.diagnosticsJson = JSON.stringify(diagnostics);
    assert.equal(validatePersistedAssessmentDiagnostic(candidate, {
      passScore: 80,
      allowedRemediationTargets: [],
    }), undefined);
  }
});

test('requires the root remediation set to exactly match low-scoring dimensions and catalog policy', () => {
  const candidate = validCandidate();
  const diagnostics = JSON.parse(candidate.diagnosticsJson!) as Record<string, any>;
  diagnostics.dimensions.evidenceClassification.score = 19;
  diagnostics.dimensions.linkReconstruction.score = 24;
  diagnostics.totalScore = 89;
  diagnostics.passed = true;
  candidate.score = 89;
  const target = {
    nodeId: 'P1T1-N02',
    sectionId: 'practice' as const,
    activityId: 'P1T1-N02-foundation-01',
  };
  diagnostics.dimensions.evidenceClassification.remediationTarget = target;
  diagnostics.remediationTargets = [target];
  candidate.diagnosticsJson = JSON.stringify(diagnostics);

  assert.ok(validatePersistedAssessmentDiagnostic(candidate, {
    passScore: 80,
    allowedRemediationTargets: [target],
  }));

  diagnostics.remediationTargets = [];
  candidate.diagnosticsJson = JSON.stringify(diagnostics);
  assert.equal(validatePersistedAssessmentDiagnostic(candidate, {
    passScore: 80,
    allowedRemediationTargets: [target],
  }), undefined);
});

test('rejects demo diagnostics that omit student or game identity', () => {
  const candidate = validCandidate();
  candidate.origin = 'demo';
  const diagnostics = JSON.parse(candidate.diagnosticsJson!) as Record<string, any>;
  diagnostics.origin = 'demo';
  delete diagnostics.studentId;
  delete diagnostics.gameId;
  candidate.diagnosticsJson = JSON.stringify(diagnostics);

  assert.equal(validatePersistedAssessmentDiagnostic(candidate, {
    passScore: 80,
    allowedRemediationTargets: [],
  }), undefined);
});

function validCandidate(): PersistedAssessmentCandidate {
  const dimensions = Object.fromEntries(assessmentDimensionKeys.map((key) => [key, {
    score: 23,
    maxScore: 25,
    feedback: `${key} feedback`,
  }]));
  const diagnostics = {
    assessmentId: 'assessment-valid',
    attemptId: 'attempt-valid',
    studentId: 'stu-01',
    nodeId: 'P1T1-N02',
    gameId: 'P1T1-N02-server-assessment',
    questionVersion: 'p01-n02-v1',
    totalScore: 92,
    passed: true,
    dimensions,
    remediationTargets: [],
    origin: 'user',
    completedAt: '2026-07-16T08:00:00.000Z',
  };
  return {
    attemptId: diagnostics.attemptId,
    studentId: diagnostics.studentId,
    nodeId: diagnostics.nodeId,
    assessmentId: diagnostics.assessmentId,
    gameId: diagnostics.gameId,
    questionVersion: diagnostics.questionVersion,
    score: diagnostics.totalScore,
    diagnosticsJson: JSON.stringify(diagnostics),
    origin: 'user',
    completedAt: diagnostics.completedAt,
    instanceAssessmentId: diagnostics.assessmentId,
    instanceNodeId: diagnostics.nodeId,
    instanceGameId: diagnostics.gameId,
    instanceQuestionVersion: diagnostics.questionVersion,
    instanceStatus: 'closed',
  };
}
