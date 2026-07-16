import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';
import type { ClassSession, StudentProgress } from '../../platform/models.ts';
import { StudentSupervisionRoster } from './student-supervision-roster.tsx';

Object.assign(globalThis, { React });

test('teacher roster labels a missing formal score as untested instead of zero', () => {
  const html = renderToStaticMarkup(createElement(StudentSupervisionRoster, {
    session: sessionWith(student()),
    selectedStudentId: 'stu-01',
    onSelectStudent: () => undefined,
  }));

  assert.match(html, /最高 尚未测试/);
  assert.match(html, /data-attempt-state="untested">尚未测试/);
  assert.doesNotMatch(html, /最高 0/);
  assert.doesNotMatch(html, /第 0\/3 次/);
});

test('teacher roster preserves a real zero formal score', () => {
  const html = renderToStaticMarkup(createElement(StudentSupervisionRoster, {
    session: sessionWith(student({ bestGameScore: 0, attemptCount: 1 })),
    selectedStudentId: 'stu-01',
    onSelectStudent: () => undefined,
  }));

  assert.match(html, /最高 0/);
  assert.doesNotMatch(html, /最高 尚未测试/);
});

function student(overrides: Partial<StudentProgress> = {}): StudentProgress {
  return {
    studentId: 'stu-01',
    name: '学生一',
    group: '第一组',
    mode: 'follow',
    currentSlideIndex: 1,
    selfStudyState: 'not_started',
    submissionState: 'draft',
    evidenceCount: 0,
    lastAction: '尚未开始',
    risk: 'watch',
    ...overrides,
  };
}

function sessionWith(member: StudentProgress): ClassSession {
  return {
    sessionId: 'demo-class',
    teacherSlideId: 'P1T1-N02-S01',
    teacherSlideIndex: 1,
    activeNodeId: 'P1T1-N02',
    studentMode: 'follow',
    activityState: 'pushed',
    submissionState: 'draft',
    reviewState: 'not_started',
    studentRoster: [member],
  };
}
