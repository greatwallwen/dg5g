import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';
import { createDemoTaskProfiles } from '../platform/deep-textbook-demo-data.ts';
import { professionalOutputSchemaForTask } from '../portfolio/output-schema.ts';
import { loadSelfStudyCatalog } from './self-study-content.ts';
import { ChallengeScene } from './challenge-scene.tsx';

Object.assign(globalThis, { React });

test('N04 challenge renders the generated professional form without mounting a formal-test game', () => {
  const catalog = loadSelfStudyCatalog();
  const profile = createDemoTaskProfiles(catalog).P03;
  const unit = profile.units.find(({ capabilityNodeId }) => capabilityNodeId === 'P1T3-N04')!;
  const html = renderToStaticMarkup(createElement(ChallengeScene, {
    profile,
    unit,
    outputSchema: professionalOutputSchemaForTask(catalog, 'P03'),
    gameConfig: {} as never,
    studentId: 'stu-01',
    studentVersion: 2,
    onProgress: () => undefined,
    onContinue: () => undefined,
    onReturnToMap: () => undefined,
  }));

  assert.match(html, /data-task-challenge="P03-output"/);
  assert.match(html, /data-professional-output="P03"/);
  assert.doesNotMatch(html, /data-skill-game=/);
  assert.doesNotMatch(html, /正式测试记录/);
});
