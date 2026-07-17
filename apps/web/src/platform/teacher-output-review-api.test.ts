import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { AuthService } from './auth/auth-service.ts';
import { AUTH_COOKIE_NAME } from './auth/cookie.ts';
import { closeDatabase } from './db/database.ts';
import { seedBase } from './db/demo-seed.ts';
import { migrateDatabase } from './db/migrations.ts';
import { createTestDatabase } from './db/test-database.ts';
import { ProfessionalOutputRepository } from './professional-output-repository.ts';
import { loadSelfStudyCatalog } from '../features/textbook-scene/self-study-content.ts';
import { professionalOutputSchemaForTask } from '../features/portfolio/output-schema.ts';
import { assessmentDimensionKeys } from './formal-assessment-contract.ts';
import { getFormalAssessmentDefinition } from './formal-assessment-catalog.server.ts';
import {
  completePolicyGaps,
  seedLegalProfessionalOutputPracticeFacts,
} from './professional-output-policy-test-support.ts';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'next/server') return nextResolve('next/server.js', context);
    if (specifier.startsWith('@/')) {
      const sourcePath = resolve(process.cwd(), 'apps/web/src', specifier.slice(2));
      const candidate = [`${sourcePath}.ts`, `${sourcePath}.tsx`, resolve(sourcePath, 'index.ts')].find(existsSync);
      if (candidate) return nextResolve(pathToFileURL(candidate).href, context);
    }
    if (specifier.startsWith('.') && context.parentURL?.includes('/apps/web/src/') && !specifier.endsWith('.ts') && !specifier.endsWith('.tsx')) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const outputsRoute = await import('../app/api/teacher/outputs/route.ts');
const reviewsRoute = await import('../app/api/teacher/outputs/[outputId]/reviews/route.ts');

test('submitted-output endpoints reject anonymous and student actors', async () => {
  const fixture = createTestDatabase();
  const previousPath = process.env.DGBOOK_SQLITE_PATH;
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    process.env.DGBOOK_SQLITE_PATH = fixture.databasePath;
    closeDatabase();
    assert.equal(outputsRoute.GET(new Request('http://localhost/api/teacher/outputs')).status, 401);
    const student = new AuthService(fixture.database).login({
      username: 'student01', password: process.env.DGBOOK_DEMO_PASSWORD ?? '123456',
    });
    assert.ok(student);
    const cookie = `${AUTH_COOKIE_NAME}=${student.token}`;
    assert.equal(outputsRoute.GET(new Request('http://localhost/api/teacher/outputs', {
      headers: { cookie },
    })).status, 403);
    const anonymousReview = await reviewsRoute.POST(jsonRequest(
      'http://localhost/api/teacher/outputs/missing/reviews', '',
      { expectedStateRevision: 0, action: 'verify', rubricScores: { quality: 90 } },
    ), { params: { outputId: 'missing' } });
    assert.equal(anonymousReview.status, 401);
    const studentReview = await reviewsRoute.POST(jsonRequest(
      'http://localhost/api/teacher/outputs/missing/reviews', cookie,
      { expectedStateRevision: 0, action: 'verify', rubricScores: { quality: 90 } },
    ), { params: { outputId: 'missing' } });
    assert.equal(studentReview.status, 403);
  } finally {
    closeDatabase();
    if (previousPath === undefined) delete process.env.DGBOOK_SQLITE_PATH;
    else process.env.DGBOOK_SQLITE_PATH = previousPath;
    fixture.cleanup();
  }
});

test('teacher lists a submitted class output and verifies it through the unique review API', async () => {
  const fixture = createTestDatabase();
  const previousPath = process.env.DGBOOK_SQLITE_PATH;
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    seedLegalProfessionalOutputPracticeFacts(fixture.database, 'stu-01', 'P01');
    insertUserFormalAssessment(fixture.database, 'api-review-attempt-92', 92, '2026-07-16T07:00:00.000Z');
    insertUserFormalAssessment(fixture.database, 'api-review-attempt-later-60', 60, '2026-07-16T09:00:00.000Z');
    process.env.DGBOOK_SQLITE_PATH = fixture.databasePath;
    closeDatabase();
    const repository = new ProfessionalOutputRepository(fixture.database, () => 'api-review-output');
    const schema = professionalOutputSchemaForTask(loadSelfStudyCatalog(), 'P01');
    const fields = Object.fromEntries(schema.fields.map(({ key }) => [key, `submitted output: ${key}`]));
    const evidenceGaps = completePolicyGaps('P01');
    const draft = repository.saveDraft({
      studentId: 'stu-01', taskId: 'P01', expectedStateRevision: 0,
      fields, upstreamRefs: [], evidenceGaps,
    });
    repository.submit({
      outputId: draft.head.outputId, studentId: 'stu-01', taskId: 'P01',
      expectedStateRevision: 1, fields: draft.versions[0]!.fields, upstreamRefs: [], evidenceGaps,
    });
    const teacher = new AuthService(fixture.database).login({
      username: 'teacher01', password: process.env.DGBOOK_DEMO_PASSWORD ?? '123456',
    });
    assert.ok(teacher);
    const cookie = `${AUTH_COOKIE_NAME}=${teacher.token}`;

    const listResponse = outputsRoute.GET(new Request('http://localhost/api/teacher/outputs', {
      headers: { cookie },
    }));
    assert.equal(listResponse.status, 200);
    const listed = await listResponse.json();
    assert.equal(listed.outputs.length, 1);
    assert.equal(listed.outputs[0].outputId, 'api-review-output');
    assert.deepEqual(
      listed.outputs[0].rubric.map(({ label, maxScore }: { label: string; maxScore: number }) => ({
        criterion: label,
        maxScore,
      })),
      schema.rubric,
    );
    assert.deepEqual(
      listed.outputs[0].fieldSchema,
      schema.fields.map(({ key, label }) => ({ key, label })),
    );
    assert.equal(listed.outputs[0].detail.currentVersion, 1);
    assert.equal(listed.outputs[0].detail.versions.length, 1);
    assert.equal(listed.outputs[0].detail.versions[0].fields.every((field: {
      evidenceGap?: { gapText: string; nextActionText: string };
    }) => Boolean(field.evidenceGap?.gapText && field.evidenceGap.nextActionText)), true);
    assert.equal(listed.outputs[0].detail.assessment.totalScore, 92);
    assert.equal(listed.outputs[0].detail.assessment.attemptId, 'api-review-attempt-92');
    assert.equal(listed.outputs[0].detail.assessment.origin, 'user');
    assert.equal(listed.outputs[0].detail.assessment.originLabel, '真实学习记录');
    const rubricScores = Object.fromEntries(schema.rubric.map(({ criterion, maxScore }) => [
      criterion,
      maxScore,
    ]));

    const invalidResponse = await reviewsRoute.POST(jsonRequest(
      'http://localhost/api/teacher/outputs/api-review-output/reviews',
      cookie,
      {
        expectedStateRevision: 2,
        expectedOutputVersion: 1,
        action: 'verify',
        rubricScores: { fakeCriterion: 90 },
      },
    ), { params: { outputId: 'api-review-output' } });
    assert.equal(invalidResponse.status, 400);
    assert.equal(repository.read('stu-01', 'P01')?.head.stateRevision, 2);
    const firstCriterion = schema.rubric[0]!;
    const overMaxResponse = await reviewsRoute.POST(jsonRequest(
      'http://localhost/api/teacher/outputs/api-review-output/reviews',
      cookie,
      {
        expectedStateRevision: 2,
        expectedOutputVersion: 1,
        action: 'verify',
        rubricScores: {
          ...rubricScores,
          [firstCriterion.criterion]: firstCriterion.maxScore + 1,
        },
      },
    ), { params: { outputId: 'api-review-output' } });
    assert.equal(overMaxResponse.status, 400);
    assert.equal(repository.read('stu-01', 'P01')?.head.stateRevision, 2);

    const response = await reviewsRoute.POST(jsonRequest(
      'http://localhost/api/teacher/outputs/api-review-output/reviews',
      cookie,
      {
        expectedStateRevision: 2,
        expectedOutputVersion: 1,
        action: 'verify',
        feedback: '达到岗位交付标准。',
        rubricScores,
      },
    ), { params: { outputId: 'api-review-output' } });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.output.head.status, 'verified');
    assert.equal(result.frozenTaskScore.officialScore, 97);
    assert.equal(result.frozenTaskScore.details.nodeTestAttemptId, 'api-review-attempt-92');
    assert.equal(result.frozenTaskScore.details.test.score, 92);
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM formal_attempts
      WHERE (attempt_id = 'api-review-attempt-92' AND score = 92)
        OR (attempt_id = 'api-review-attempt-later-60' AND score = 60)
    `).pluck().get(), 2);
  } finally {
    closeDatabase();
    if (previousPath === undefined) delete process.env.DGBOOK_SQLITE_PATH;
    else process.env.DGBOOK_SQLITE_PATH = previousPath;
    fixture.cleanup();
  }
});

function jsonRequest(url: string, cookie: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function insertUserFormalAssessment(
  database: ReturnType<typeof createTestDatabase>['database'],
  attemptId: string,
  score: number,
  completedAt: string,
): void {
  const definition = getFormalAssessmentDefinition('P1T1-N02');
  assert.ok(definition);
  const assessmentId = `assessment-${attemptId}`;
  database.prepare(`
    INSERT INTO formal_assessment_instances (
      assessment_id, node_id, game_id, question_version, status, closed_at
    ) VALUES (?, 'P1T1-N02', 'P1T1-N02-server-assessment', 'p01-n02-v1', 'closed', ?)
  `).run(assessmentId, completedAt);
  const dimensions = Object.fromEntries(assessmentDimensionKeys.map((key) => {
    const dimensionScore = score / assessmentDimensionKeys.length;
    const remediationTarget = dimensionScore < 20
      ? definition.grading[key].remediationTarget
      : undefined;
    return [key, {
      score: dimensionScore, maxScore: 25, feedback: `${key} feedback`,
      ...(remediationTarget ? { remediationTarget } : {}),
    }];
  }));
  const remediationTargets = assessmentDimensionKeys.flatMap((key) => (
    score / assessmentDimensionKeys.length < 20 ? [definition.grading[key].remediationTarget] : []
  ));
  database.prepare(`
    INSERT INTO formal_attempts (
      attempt_id, student_id, node_id, assessment_id, game_id, score,
      completed_at, question_version, answers_json, diagnostics_json, origin
    ) VALUES (?, 'stu-01', 'P1T1-N02', ?, 'P1T1-N02-server-assessment', ?, ?, 'p01-n02-v1', '{}', ?, 'user')
  `).run(attemptId, assessmentId, score, completedAt, JSON.stringify({
    assessmentId, attemptId, studentId: 'stu-01', nodeId: 'P1T1-N02',
    gameId: 'P1T1-N02-server-assessment', questionVersion: 'p01-n02-v1',
    totalScore: score, passed: score >= 80, dimensions, remediationTargets,
    origin: 'user', completedAt,
  }));
}
