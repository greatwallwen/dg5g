import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SceneVisual } from './learning-scene.tsx';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function renderVisual(visualId: string, activeStep = 2): string {
  return renderToStaticMarkup(<SceneVisual activeStep={activeStep} visualId={visualId} />);
}

test('运行条件课堂图只表达证据状态，不伪造合格结论或置信百分比', () => {
  const html = renderVisual('indoor-condition');

  for (const required of ['可观察', '需授权测量', '阈值来源', '待复核']) {
    assert.match(html, new RegExp(required));
  }
  assert.doesNotMatch(html, /链路在线|-48V稳定|阻值合格|当前运行条件可交付|\d+%/);
});

test('P03 四个课堂视觉都呈现对应的投诉学习关系，不回退到室外路线图', () => {
  const cases = {
    'complaint-facts': ['工单原话', '时间地点', '业务终端', '待追问'],
    'complaint-reproduction': ['投诉事实', '同条件复测', '证据对时', '复现结论'],
    'complaint-evidence': ['投诉事实', '复测记录', '网络证据', '根因假设'],
    'complaint-closure': ['事实与证据', '根因假设', '责任与时限', '复测回访'],
  } as const;

  for (const [visualId, labels] of Object.entries(cases)) {
    const html = renderVisual(visualId);
    assert.match(html, new RegExp(`data-complaint-flow="${visualId}"`), visualId);
    assert.doesNotMatch(html, /coverage-map-visual|采样路线|道路热点/, visualId);
    for (const label of labels) assert.match(html, new RegExp(label), `${visualId}: ${label}`);
  }
});

test('未知课堂视觉显式显示中性证据关系，不静默冒充室外路线图', () => {
  const html = renderVisual('not-configured');

  assert.match(html, /data-scene-visual-fallback="not-configured"/);
  assert.match(html, /证据关系图/);
  assert.doesNotMatch(html, /coverage-map-visual|采样路线|道路热点/);
});
