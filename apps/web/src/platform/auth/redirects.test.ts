import assert from 'node:assert/strict';
import test from 'node:test';
import { homeForRole, safeNextForRole } from './redirects.ts';

test('defaults each authoritative role to its own home', () => {
  assert.equal(homeForRole('student'), '/student/home');
  assert.equal(homeForRole('teacher'), '/teacher/workbench');
});

test('accepts only safe relative role-compatible destinations', () => {
  assert.equal(safeNextForRole('/learn/P1T1-N02', 'student'), '/learn/P1T1-N02');
  assert.equal(safeNextForRole('/teacher/sessions/P1T1-N02', 'teacher'), '/teacher/sessions/P1T1-N02');
  assert.equal(safeNextForRole('/course', 'student'), '/course');
  assert.equal(safeNextForRole('/course', 'teacher'), '/course');
});

test('rejects external, protocol-relative, backslash, control, encoded, and cross-role paths', () => {
  const unsafeStudent = [
    'https://evil.test/',
    '//evil.test/',
    '/\\evil.test',
    '/learn/\u0000bad',
    '/%2f%2fevil.test',
    '/%5cevil.test',
    '/teacher/workbench',
  ];
  for (const candidate of unsafeStudent) {
    assert.equal(safeNextForRole(candidate, 'student'), '/student/home', candidate);
  }
  assert.equal(safeNextForRole('/student/home', 'teacher'), '/teacher/workbench');
});
