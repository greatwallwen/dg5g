import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { P1PortfolioViewModel } from './p1-portfolio-model.ts';
import { P1PortfolioView } from './p1-portfolio-view.tsx';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

test('renders the complete package as exactly three immutable version references', () => {
  const html = renderToStaticMarkup(<P1PortfolioView displayName="学生一" model={completeModel()} />);

  assert.match(html, /data-p1-portfolio="complete"/);
  assert.match(html, /data-motion="paused"/);
  assert.match(html, /data-primary-action-policy="none"/);
  assert.equal((html.match(/data-primary-action/g) ?? []).length, 1);
  assert.doesNotMatch(html, /data-primary-action="true"/);
  assert.match(html, /5G网络信息采集成果包/);
  assert.match(html, /项目综合分/);
  assert.match(html, />88</);
  for (const taskId of ['P01', 'P02', 'P03']) {
    assert.match(html, new RegExp(`data-p1-portfolio-item="${taskId}"`));
  }
  assert.equal((html.match(/data-p1-package-reference=/g) ?? []).length, 3);
  assert.match(html, /data-p1-package-reference="P01:output-p01:v2"/);
  assert.match(html, /修订后证据闭环/);
  assert.match(html, /任务综合分/);
  assert.match(html, /href="\/student\/projects\/p1"/);
  assert.doesNotMatch(html, /fields|contentJson/);
});

test('shows an explicit unformed state without inventing package references or a zero score', () => {
  const model = completeModel();
  model.packageStatus = 'not-formed';
  model.packageStatusLabel = '尚未形成';
  model.projectCompositeScore = undefined;
  model.projectCompositeScoreLabel = '尚未形成';
  model.packageReferences = [];
  model.items[0] = {
    ...model.items[0]!,
    versionLabel: 'v2',
    status: 'returned',
    statusLabel: '退回修订',
    teacherFeedback: '补拍铭牌并修订。',
    taskCompositeScoreLabel: '尚未形成',
  };

  const html = renderToStaticMarkup(<P1PortfolioView displayName="学生一" model={model} />);

  assert.match(html, /data-p1-portfolio="not-formed"/);
  assert.match(html, /data-motion="paused"/);
  assert.match(html, /data-primary-action-policy="none"/);
  assert.equal((html.match(/data-primary-action/g) ?? []).length, 1);
  assert.doesNotMatch(html, /data-primary-action="true"/);
  assert.match(html, /尚未形成/);
  assert.match(html, /v2/);
  assert.match(html, /退回修订/);
  assert.match(html, /补拍铭牌并修订/);
  assert.doesNotMatch(html, /data-p1-package-reference=/);
  assert.doesNotMatch(html, /项目综合分[^<]*<[^>]*>0</);
});

function completeModel(): P1PortfolioViewModel {
  return {
    projectId: 'P1',
    projectTitle: '5G网络信息采集',
    packageTitle: '5G网络信息采集成果包',
    snapshotVersion: 29,
    packageStatus: 'complete',
    packageStatusLabel: '成果包已形成',
    projectCompositeScore: 88,
    projectCompositeScoreLabel: '88',
    packageReferences: [
      { taskId: 'P01', outputId: 'output-p01', version: 2 },
      { taskId: 'P02', outputId: 'output-p02', version: 3 },
      { taskId: 'P03', outputId: 'output-p03', version: 1 },
    ],
    items: [
      portfolioItem('P01', '室内信息采集', '室内设备与链路证据表', 'v2', '修订后证据闭环。', '86'),
      portfolioItem('P02', '室外信息采集', '室外天线与覆盖证据表', 'v3', '天线姿态证据完整。', '88'),
      portfolioItem('P03', '投诉信息采集', '投诉复现与多源证据记录', 'v1', '投诉复现记录完整。', '91'),
    ],
  };
}

function portfolioItem(
  taskId: 'P01' | 'P02' | 'P03',
  taskTitle: string,
  outputTitle: string,
  versionLabel: string,
  teacherFeedback: string,
  taskCompositeScoreLabel: string,
): P1PortfolioViewModel['items'][number] {
  return {
    taskId,
    taskTitle,
    outputTitle,
    versionLabel,
    status: 'verified',
    statusLabel: '教师已认证',
    teacherFeedback,
    taskCompositeScoreLabel,
  };
}
