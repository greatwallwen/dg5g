import assert from 'node:assert/strict';
import test from 'node:test';
import { toPublicActor } from './actor.ts';

test('public actor DTO exposes only stable identity fields', () => {
  const actor = toPublicActor({
    userId: 'stu-01',
    username: 'student01',
    displayName: '学生一',
    role: 'student',
    classId: 'demo-class',
    studentId: 'stu-01',
  });

  assert.deepEqual(actor, {
    userId: 'stu-01',
    username: 'student01',
    displayName: '学生一',
    role: 'student',
  });
  assert.equal(JSON.stringify(actor).match(/classId|studentId|token|hash|password/i), null);
});
