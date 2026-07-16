import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { playbackSceneForLearningUnit } from './learning-playback.ts';
import { P01N02LessonStage } from './p01-n02-lesson-stage.tsx';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const n02Unit = {
  id: 'P01-ku-N02',
  capabilityNodeId: 'P1T1-N02',
  title: '设备拓扑',
  question: '如何用证据重建链路？',
  summary: '重建设备链路',
  points: ['位置', '身份', '方向'],
  steps: ['定位', '核验', '追踪'],
  counterexample: '孤立近景',
  correction: '补齐回指',
  action: '重建链路',
  output: '节点证据记录',
  requiredEvidence: '三类证据',
  visualId: 'device-topology',
} as const;

test('P01-N02 classroom playback exposes one authoritative action for every teaching page', () => {
  const scene = playbackSceneForLearningUnit(n02Unit as never, 'P01');
  assert.equal(scene.actions.length, 12);
  assert.equal(scene.actions[0]?.targetId, 'P01-L1-P01');
  assert.equal(scene.actions[5]?.targetId, 'P01-L1-P06');
  assert.equal(scene.actions[6]?.targetId, 'P01-L2-P01');
  assert.equal(scene.actions[11]?.targetId, 'P01-L2-P06');
});

test('shared P01 stage renders the exact second-lesson page selected by authoritative index', () => {
  const html = renderToStaticMarkup(
    <P01N02LessonStage actionIndex={7} phase="lecture" surface="teacher" />,
  );
  assert.match(html, /data-teaching-page="P01-L2-P02"/);
  assert.match(html, /第2课时/);
  assert.match(html, /2 \/ 6/);
  assert.match(html, /8分钟/);
  assert.match(html, /经过ODF跳接的链路重建/);
  assert.match(html, /BBU P2—ODF-07—AAU5619 CPRI-2/);
});

test('teacher console binds its private teaching inspector to the current complete page', () => {
  const client = source('../classroom/teacher-console-client.tsx');
  const inspector = source('../classroom/teacher-console-inspector.tsx');
  const view = source('../classroom/teacher-console-view.tsx');

  assert.match(client, /teachingPageAt/);
  assert.match(inspector, /teacherExplanation/);
  assert.match(inspector, /typicalAnswer/);
  assert.match(inspector, /commonErrors/);
  assert.match(inspector, /followUpPrompts/);
  assert.match(inspector, /studentAction/);
  assert.match(inspector, /transition/);
  assert.doesNotMatch(inspector, /答案需包含对象、证据、判断依据和下一步动作/);
  assert.match(view, /data-teaching-lesson=/);
  assert.match(view, /data-teaching-page=/);
  assert.match(view, /suggestedMinutes/);
});

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}
