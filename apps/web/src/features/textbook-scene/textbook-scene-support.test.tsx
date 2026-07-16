import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';
import { createDemoTaskProfiles } from '../platform/deep-textbook-demo-data.ts';
import type { TaskMasteryProgress } from '../../platform/models.ts';
import { loadSelfStudyCatalog } from './self-study-content.ts';
import { SceneContext } from './textbook-scene-support.tsx';

Object.assign(globalThis, { React });

test('scene context renders missing task workflow completion as unformed instead of zero percent', () => {
  const profile = createDemoTaskProfiles(loadSelfStudyCatalog()).P01;
  const html = renderToStaticMarkup(createElement(SceneContext, {
    profile,
    unit: profile.units[0]!,
    onClose: () => undefined,
  }));

  assert.match(html, /任务流程完成度/);
  assert.match(html, /data-mastery-state="unformed"/);
  assert.match(html, /尚未形成/);
  assert.doesNotMatch(html, /<strong>0%<\/strong>/);
});

test('scene context preserves a formed canonical zero workflow percentage', () => {
  const profile = createDemoTaskProfiles(loadSelfStudyCatalog()).P01;
  const mastery: TaskMasteryProgress = {
    studentId: 'stu-01',
    taskId: 'P01',
    state: 'learning',
    masteredNodeIds: [],
    requiredNodeIds: ['P1T1-N01', 'P1T1-N02', 'P1T1-N03', 'P1T1-N04'],
    evidenceSubmitted: false,
    teacherVerified: false,
    masteryPercent: 0,
  };
  const html = renderToStaticMarkup(createElement(SceneContext, {
    profile,
    unit: profile.units[0]!,
    mastery,
    onClose: () => undefined,
  }));

  assert.match(html, /data-mastery-state="formed"/);
  assert.match(html, /<strong>0%<\/strong>/);
  assert.match(html, /按统一学习状态计算/);
  assert.doesNotMatch(html, /尚未形成/);
});
