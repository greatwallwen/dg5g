import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('unauthenticated role homes redirect to a fixed safe login next', async () => {
  const { decideRoleHomeAuthorization } = await authorizationModel();

  assert.deepEqual(decideRoleHomeAuthorization(null, 'student', '/student/home'), {
    kind: 'redirect',
    destination: '/?next=%2Fstudent%2Fhome',
  });
  assert.deepEqual(decideRoleHomeAuthorization(null, 'teacher', '/teacher/workbench'), {
    kind: 'redirect',
    destination: '/?next=%2Fteacher%2Fworkbench',
  });
});

test('cross-role access redirects before protected HTML or SQLite data can be loaded', async () => {
  const { decideRoleHomeAuthorization } = await authorizationModel();
  const teacher = actor('teacher');
  const student = actor('student');

  assert.deepEqual(decideRoleHomeAuthorization(teacher, 'student', '/student/home'), {
    kind: 'redirect',
    destination: '/teacher/workbench',
  });
  assert.deepEqual(decideRoleHomeAuthorization(student, 'teacher', '/teacher/workbench'), {
    kind: 'redirect',
    destination: '/student/home',
  });
  assert.deepEqual(decideRoleHomeAuthorization(student, 'student', '/student/home'), {
    kind: 'authorized',
    actor: student,
  });
});

test('both server pages authorize before their SQLite role-home read', () => {
  const contracts = [
    {
      source: source('../../app/student/home/page.tsx'),
      guard: "authorizeRoleHome('student', '/student/home')",
      read: 'readStudentHomeSnapshot(',
    },
    {
      source: source('../../app/teacher/workbench/page.tsx'),
      guard: "authorizeRoleHome('teacher', '/teacher/workbench')",
      read: 'readTeacherWorkbenchSnapshot(',
    },
  ];

  for (const contract of contracts) {
    const guardIndex = contract.source.indexOf(contract.guard);
    const readIndex = contract.source.indexOf(contract.read);
    assert.notEqual(guardIndex, -1, `missing server authorization: ${contract.guard}`);
    assert.notEqual(readIndex, -1, `missing protected SQLite read: ${contract.read}`);
    assert.ok(guardIndex < readIndex, 'protected data is read before authorization');
    assert.doesNotMatch(contract.source, /localStorage|sessionStorage|searchParams|[?&]role=/);
  }
});

function actor(role: 'student' | 'teacher') {
  return {
    userId: role === 'student' ? 'stu-01' : 'teacher-01',
    username: role === 'student' ? 'student01' : 'teacher01',
    displayName: role === 'student' ? '学生一' : '张老师',
    role,
    classId: 'demo-class',
    ...(role === 'student' ? { studentId: 'stu-01' } : {}),
  };
}

function source(relativePath: string): string {
  try {
    return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  } catch {
    return '';
  }
}

async function authorizationModel() {
  try {
    return await import('./role-home-authorization.ts');
  } catch (error) {
    assert.fail(`role-home authorization is not implemented: ${String(error)}`);
  }
}
