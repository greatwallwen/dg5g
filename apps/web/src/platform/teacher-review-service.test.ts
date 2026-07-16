import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import type { ReviewableProfessionalOutput } from './teacher-review-service.ts';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !specifier.endsWith('.ts')) return nextResolve(`${specifier}.ts`, context);
    return nextResolve(specifier, context);
  },
});

const {
  TeacherReviewAuthorizationError,
  reviewProfessionalOutput,
} = await import('./teacher-review-service.ts');

test('student actors cannot execute teacher review commands', async () => {
  const repository = reviewRepository();

  await assert.rejects(
    reviewProfessionalOutput({
      actor: { userId: 'stu-01', role: 'student', classIds: ['demo-class'] },
      outputId: 'output-01',
      expectedVersion: 3,
      action: { type: 'verify', score: 88 },
    }, repository),
    TeacherReviewAuthorizationError,
  );
  assert.equal(repository.appended.length, 0);
});

test('teachers cannot review outputs outside their class scope', async () => {
  const repository = reviewRepository();

  await assert.rejects(
    reviewProfessionalOutput({
      actor: { userId: 'teacher-01', role: 'teacher', classIds: ['another-class'] },
      outputId: 'output-01',
      expectedVersion: 3,
      action: { type: 'verify', score: 88 },
    }, repository),
    TeacherReviewAuthorizationError,
  );
  assert.equal(repository.appended.length, 0);
});

test('teacher review is restricted to policy-declared N04 professional outputs', async () => {
  const repository = reviewRepository({
    outputId: 'output-n02',
    studentId: 'stu-01',
    classId: 'demo-class',
    nodeId: 'P1T1-N02',
    version: 3,
    status: 'submitted' as const,
  });

  await assert.rejects(
    reviewProfessionalOutput({
      actor: { userId: 'teacher-01', role: 'teacher', classIds: ['demo-class'] },
      outputId: 'output-n02',
      expectedVersion: 3,
      action: { type: 'verify', score: 88 },
    }, repository),
    TeacherReviewAuthorizationError,
  );
  assert.equal(repository.appended.length, 0);
});

test('teacher review rejects stale output versions', async () => {
  const repository = reviewRepository();

  await assert.rejects(
    reviewProfessionalOutput({
      actor: { userId: 'teacher-01', role: 'teacher', classIds: ['demo-class'] },
      outputId: 'output-01',
      expectedVersion: 2,
      action: { type: 'return', feedback: '补齐证据链。' },
    }, repository),
    TeacherReviewAuthorizationError,
  );
  assert.equal(repository.appended.length, 0);
});

test('teacher review accepts only the current submitted output', async () => {
  const repository = reviewRepository({
    outputId: 'output-draft',
    studentId: 'stu-01',
    classId: 'demo-class',
    nodeId: 'P1T1-N04',
    version: 3,
    status: 'draft' as const,
  });

  await assert.rejects(
    reviewProfessionalOutput({
      actor: { userId: 'teacher-01', role: 'teacher', classIds: ['demo-class'] },
      outputId: 'output-draft',
      expectedVersion: 3,
      action: { type: 'verify', score: 88 },
    }, repository),
    TeacherReviewAuthorizationError,
  );
  assert.equal(repository.appended.length, 0);
});

test('teacher verification score must be a finite rubric score', async () => {
  const repository = reviewRepository();

  await assert.rejects(
    reviewProfessionalOutput({
      actor: { userId: 'teacher-01', role: 'teacher', classIds: ['demo-class'] },
      outputId: 'output-01',
      expectedVersion: 3,
      action: { type: 'verify', score: 101 },
    }, repository),
    TeacherReviewAuthorizationError,
  );
  assert.equal(repository.appended.length, 0);
});

test('teacher return requires actionable feedback', async () => {
  const repository = reviewRepository();

  await assert.rejects(
    reviewProfessionalOutput({
      actor: { userId: 'teacher-01', role: 'teacher', classIds: ['demo-class'] },
      outputId: 'output-01',
      expectedVersion: 3,
      action: { type: 'return', feedback: '   ' },
    }, repository),
    TeacherReviewAuthorizationError,
  );
  assert.equal(repository.appended.length, 0);
});

test('authorized review derives teacher and student identities from trusted actor and output', async () => {
  const repository = reviewRepository();

  await reviewProfessionalOutput({
    actor: { userId: 'teacher-01', role: 'teacher', classIds: ['demo-class'] },
    outputId: 'output-01',
    expectedVersion: 3,
    action: { type: 'verify', score: 88 },
    studentId: 'untrusted-student',
  } as Parameters<typeof reviewProfessionalOutput>[0] & { studentId: string }, repository);

  assert.deepEqual(repository.appended, [{
    outputId: 'output-01',
    studentId: 'stu-01',
    classId: 'demo-class',
    nodeId: 'P1T1-N04',
    outputVersion: 3,
    teacherId: 'teacher-01',
    action: { type: 'verify', score: 88 },
  }]);
});

function reviewRepository(output: ReviewableProfessionalOutput = {
  outputId: 'output-01',
  studentId: 'stu-01',
  classId: 'demo-class',
  nodeId: 'P1T1-N04',
  version: 3,
  status: 'submitted',
}) {
  const appended: unknown[] = [];
  return {
    appended,
    async findCurrentOutput(outputId: string) {
      return outputId === output.outputId ? output : undefined;
    },
    async appendReview(command: unknown) {
      appended.push(command);
      return command;
    },
  };
}
