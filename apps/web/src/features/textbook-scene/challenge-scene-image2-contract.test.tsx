import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';
import { EduGameInteractive } from '@dgbook/widgets/edugame-pixi';
import { createDemoTaskProfiles } from '../platform/deep-textbook-demo-data.ts';
import { loadSelfStudyCatalog } from './self-study-content.ts';
import { ChallengeScene } from './challenge-scene.tsx';

Object.assign(globalThis, { React });

const textbookSceneCssUrl = new URL('../../app/textbook-scene.css', import.meta.url);

test('formal challenge declares the Image2 primary-action and motion policy', () => {
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

  assert.match(html, /class="challenge-scene"[^>]*data-motion="paused"/);
  assert.match(html, /class="challenge-scene"[^>]*data-primary-action-policy="exactly-one"/);
});

test('formal game marks only its start control as the primary action', () => {
  const primaryHtml = renderToStaticMarkup(createElement(EduGameInteractive, {
    gameConfig: { title: '设备证据正式测试' },
    primaryAction: true,
  } as never));
  const ordinaryHtml = renderToStaticMarkup(createElement(EduGameInteractive, {
    gameConfig: { title: '微练习' },
  }));

  assert.equal((primaryHtml.match(/data-primary-action=/g) ?? []).length, 1);
  assert.match(primaryHtml, /<button[^>]*data-edugame-start="true"[^>]*data-primary-action="true"/);
  assert.doesNotMatch(ordinaryHtml, /data-primary-action=/);
});

test('formal replay frame stays inside the 390px challenge stage', async () => {
  const css = await readFile(textbookSceneCssUrl, 'utf8');

  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.skill-game-replay-frame\s*\{[^}]*min-width:\s*0[^}]*max-width:\s*100%[^}]*grid-template-columns:\s*auto minmax\(0,\s*1fr\)/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.skill-game-replay-frame (?:dl|> dl),\s*\.skill-game-replay-frame > button\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.skill-game-replay-frame > button\s*\{[^}]*width:\s*100%[^}]*max-width:\s*100%/);
});
