import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';
import { createDemoTaskProfiles } from '../platform/deep-textbook-demo-data.ts';
import type { SkillProgress } from '../../platform/models.ts';
import { loadSelfStudyCatalog } from './self-study-content.ts';
import { ChallengeScene } from './challenge-scene.tsx';

Object.assign(globalThis, { React });

test('formal challenge renders missing score facts as untested instead of zero', () => {
  const catalog = loadSelfStudyCatalog();
  const profile = createDemoTaskProfiles(catalog).P01;
  const unit = profile.units.find(({ capabilityNodeId }) => capabilityNodeId === 'P1T1-N02')!;
  const html = renderToStaticMarkup(createElement(ChallengeScene, {
    profile,
    unit,
    gameConfig: { title: '设备证据正式测试' } as never,
    studentId: 'stu-01',
    studentVersion: 2,
    onProgress: () => undefined,
    onContinue: () => undefined,
    onReturnToMap: () => undefined,
  }));

  assert.match(html, /data-formal-score-state="untested"/);
  assert.match(html, /尚未测试/);
  assert.doesNotMatch(html, /data-formal-score-state="untested"[^>]*>\s*<strong>0<\/strong>/);
});

test('formal challenge preserves a submitted zero score and zero duration', () => {
  const catalog = loadSelfStudyCatalog();
  const profile = createDemoTaskProfiles(catalog).P01;
  const unit = profile.units.find(({ capabilityNodeId }) => capabilityNodeId === 'P1T1-N02')!;
  const html = renderToStaticMarkup(createElement(ChallengeScene, {
    profile,
    unit,
    nodeProgress: progressWithZeroAttempt(),
    gameConfig: { title: '设备证据正式测试' } as never,
    studentId: 'stu-01',
    studentVersion: 2,
    onProgress: () => undefined,
    onContinue: () => undefined,
    onReturnToMap: () => undefined,
  }));

  assert.match(html, /data-formal-score-state="formed"><strong>0<\/strong><span>\/ 100<\/span>/);
  assert.match(html, /<small>首分<\/small><strong>0<\/strong>/);
  assert.match(html, /<small>最高分<\/small><strong>0<\/strong>/);
  assert.match(html, /<small>最近分<\/small><strong>0<\/strong>/);
  assert.match(html, /<small>0分钟<\/small>/);
});

function progressWithZeroAttempt(): SkillProgress {
  return {
    studentId: 'stu-01',
    nodeId: 'P1T1-N02',
    state: 'learning',
    masteryPercent: 20,
    completedSectionIds: [],
    requiredSectionIds: [],
    classroomSubmitted: false,
    gameScore: 0,
    gameStars: 0,
    mistakeKnowledgePointIds: [],
    gameAttempts: [{
      attemptId: 'zero-attempt',
      gameId: 'node-test',
      nodeId: 'P1T1-N02',
      score: 0,
      durationSeconds: 0,
      formal: true,
      completedAt: '2026-07-16T02:00:00.000Z',
      mistakeKnowledgePointIds: [],
    }],
    firstGameScore: 0,
    bestGameScore: 0,
    latestGameScore: 0,
    attemptCount: 1,
    evidenceSubmitted: false,
    evidenceReviewStatus: 'not-submitted',
    teacherVerified: false,
    learningState: 'learning',
    learningStateTrail: ['learning'],
  };
}
