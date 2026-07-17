import assert from 'node:assert/strict';
import test from 'node:test';
import type { StoredFormalAssessmentInstance } from './learning-repository.ts';
import { currentUserFormalAssessmentState } from './formal-assessment-state-projection.ts';

test('a submitted closed instance ignores stale classroom pause and terminal states', () => {
  for (const classroomRunStatus of ['paused', 'reviewing', 'closed', 'expired'] as const) {
    assert.equal(currentUserFormalAssessmentState([
      instance({
        status: 'closed',
        closureReason: 'submitted',
        classroomRunStatus,
      }),
    ], 'P1T1-N02'), undefined);
  }
});

test('only a running instance inherits an active classroom lifecycle', () => {
  assert.equal(currentUserFormalAssessmentState([
    instance({ status: 'running', classroomRunStatus: 'running' }),
  ], 'P1T1-N02'), 'in-progress');
  assert.equal(currentUserFormalAssessmentState([
    instance({ status: 'running', classroomRunStatus: 'paused' }),
  ], 'P1T1-N02'), 'paused');
  assert.equal(currentUserFormalAssessmentState([
    instance({ status: 'running', classroomRunStatus: 'expired' }),
  ], 'P1T1-N02'), 'expired');
  assert.equal(currentUserFormalAssessmentState([
    instance({ status: 'preparing', classroomRunStatus: 'paused' }),
  ], 'P1T1-N02'), undefined);
});

test('an expired or cancelled terminal instance remains expired without a score', () => {
  for (const closureReason of ['expired', 'cancelled'] as const) {
    assert.equal(currentUserFormalAssessmentState([
      instance({
        status: 'closed',
        closureReason,
        classroomRunStatus: 'closed',
      }),
    ], 'P1T1-N02'), 'expired');
  }
});

function instance(
  overrides: Partial<StoredFormalAssessmentInstance> = {},
): StoredFormalAssessmentInstance {
  return {
    assessmentId: 'assessment-1',
    nodeId: 'P1T1-N02',
    gameId: 'P1T1-N02-server-assessment',
    questionVersion: 'p01-n02-v1',
    status: 'running',
    classroomRunStatus: 'running',
    expiresAt: '2099-01-01T00:00:00.000Z',
    createdAt: '2026-07-17T00:00:00.000Z',
    origin: 'user',
    ...overrides,
  };
}
