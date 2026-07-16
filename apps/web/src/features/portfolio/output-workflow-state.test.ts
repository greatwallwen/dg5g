import assert from 'node:assert/strict';
import test from 'node:test';
import { projectOutputWorkflow } from './output-workflow-state.ts';

const head = (status: 'draft' | 'submitted' | 'returned' | 'verified', currentVersion = 1) => ({
  outputId: 'output-p01',
  studentId: 'stu-01',
  taskId: 'P01' as const,
  currentVersion,
  stateRevision: 1,
  status,
});

test('projects all six output workflow states from persisted facts only', () => {
  assert.deepEqual(projectOutputWorkflow({
    head: head('draft'), submissionCount: 0, reviewHistory: [],
  }), { state: 'editing', label: '编辑中' });
  assert.deepEqual(projectOutputWorkflow({
    head: head('submitted'), submissionCount: 1, reviewHistory: [],
  }), { state: 'submitted', label: '已提交' });
  assert.deepEqual(projectOutputWorkflow({
    head: head('returned'), submissionCount: 1,
    reviewHistory: [{ reviewId: 'r1', status: 'returned' }],
  }), { state: 'returned', label: '教师退回' });
  assert.deepEqual(projectOutputWorkflow({
    head: head('draft', 2), submissionCount: 1,
    reviewHistory: [{ reviewId: 'r1', status: 'returned' }],
  }), { state: 'revising', label: '修订中' });
  assert.deepEqual(projectOutputWorkflow({
    head: head('submitted'), submissionCount: 2,
    reviewHistory: [{ reviewId: 'r1', status: 'returned' }],
  }), { state: 'resubmitted', label: '再次提交' });
  assert.deepEqual(projectOutputWorkflow({
    head: head('verified'), submissionCount: 2,
    reviewHistory: [{ reviewId: 'r2', status: 'verified' }],
  }), { state: 'verified', label: '教师确认' });
});

test('a draft v2 without a returned review is still editing and version does not invent workflow state', () => {
  assert.deepEqual(projectOutputWorkflow({
    head: head('draft', 2), submissionCount: 0, reviewHistory: [],
  }), { state: 'editing', label: '编辑中' });
});
