import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';
import { createDemoTaskProfiles } from '../platform/deep-textbook-demo-data.ts';
import type { SkillProgress, TaskMasteryProgress } from '../../platform/models.ts';
import { loadSelfStudyCatalog } from './self-study-content.ts';
import { SceneContext, SceneRail, UnavailableNodeNotice } from './textbook-scene-support.tsx';

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

test('locked rail nodes remain clickable so students can inspect prerequisites', () => {
  const profile = createDemoTaskProfiles(loadSelfStudyCatalog()).P01;
  const progress: SkillProgress[] = profile.units.map((unit, index) => ({
    studentId: 'stu-01',
    nodeId: unit.capabilityNodeId,
    state: index === 3 ? 'locked' : 'available',
    masteryPercent: 0,
    completedSectionIds: [],
    requiredSectionIds: [],
    classroomSubmitted: false,
    gameStars: 0,
    mistakeKnowledgePointIds: [],
    evidenceSubmitted: false,
    evidenceReviewStatus: 'not-submitted',
    teacherVerified: false,
    learningState: index === 3 ? 'locked' : 'available',
  }));
  const html = renderToStaticMarkup(createElement(SceneRail, {
    profile,
    progress,
    selectedNodeId: 'P1T1-N01',
    onNodeSelect: () => undefined,
    onReturnToMap: () => undefined,
  }));
  const lockedButton = html.match(/<button[^>]*data-node-id="P1T1-N04"[^>]*>/)?.[0] ?? '';

  assert.match(lockedButton, /data-node-access="locked"/);
  assert.doesNotMatch(lockedButton, /disabled/);
  assert.match(html, /未解锁 · 查看条件/);
});

test('locked node notice links the prerequisite and keeps one clear course return action', () => {
  const html = renderToStaticMarkup(createElement(UnavailableNodeNotice, {
    nodeId: 'P1T1-N04',
    access: {
      nodeId: 'P1T1-N04',
      kind: 'locked',
      label: '未解锁',
      disabled: true,
      canNavigate: true,
      prerequisiteNodeIds: ['P1T1-N03'],
      state: 'locked',
    },
  }));

  assert.match(html, /data-node-access="locked"/);
  assert.match(html, /class="textbook-scene-unavailable is-node-route-gate"/);
  assert.match(html, /href="\/learn\/P1T1-N03"/);
  assert.match(html, /继续完成前置节点/);
  assert.match(html, /href="\/course"/);
  assert.match(html, /返回课程能力图谱/);
  assert.doesNotMatch(html, /data-scene-surface|activity-submit|<form/);
});

test('locked node notice owns a responsive dark engineering gate surface', () => {
  const css = readFileSync(new URL('../../app/node-route-gate.css', import.meta.url), 'utf8');

  assert.match(css, /\.textbook-scene-unavailable\.is-node-route-gate\s*\{[\s\S]*?min-height:\s*100dvh/);
  assert.match(css, /\.node-route-gate-card\s*\{/);
  assert.match(css, /\.node-route-gate-actions\s*\{/);
  assert.match(css, /\.node-route-prerequisite:focus-visible/);
  assert.match(css, /@media\s*\(max-width:\s*700px\)[\s\S]*?\.node-route-gate-card/);
});
