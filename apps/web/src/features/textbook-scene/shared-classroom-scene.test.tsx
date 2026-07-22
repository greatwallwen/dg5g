import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { DemoTaskProfile, DemoUnit } from '@/features/platform/deep-textbook-demo-data';
import { SharedClassroomScene } from './shared-classroom-scene';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const unit: DemoUnit = {
  id: 'P1T1-N01',
  capabilityNodeId: 'P1T1-N01',
  kind: 'case',
  title: '室内资源边界',
  question: '哪些设备属于本次采集范围？',
  summary: '先核对任务单和机房门牌，再确认目标机柜。',
  points: ['任务单界定站点', '门牌确认机房', '机柜编号确认采集对象'],
  steps: [],
  visualId: 'indoor-scope-boundary',
  counterexample: '',
  correction: '',
  action: '完成室内采集范围分类',
  output: '室内资源边界学习记录',
  requiredEvidence: '任务单、门牌、机柜编号',
};

const profile: DemoTaskProfile = {
  taskId: 'P01',
  title: '室内环境信息采集',
  gameNodeId: 'P1T1-N02',
  units: [unit],
};

test('P1T1-N01 classroom scene renders an indoor scope relation map without outdoor route imagery', () => {
  const html = renderToStaticMarkup(
    <SharedClassroomScene pageIndex={1} profile={profile} surface="projector" unit={unit} />,
  );

  assert.match(html, /data-classroom-scope-map="true"/);
  for (const label of ['机房入口', '01号机房', 'K01', 'K02', 'K03', 'K04', '排除对象']) {
    assert.match(html, new RegExp(label));
  }
  assert.doesNotMatch(html, /道路热点|采样路线|覆盖路线|map-road|coverage-map-visual/);
});
