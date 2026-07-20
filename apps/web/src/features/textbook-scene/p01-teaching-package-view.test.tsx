import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { p01TeachingPackage } from './classroom-lesson-model.ts';
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
  assert.match(html, /带 ODF 的链路重建/);
  assert.match(html, /BBU P2—ODF-07—AAU5619 CPRI-2/);
});

test('the active teaching page remains a measurable playback focus target', () => {
  const html = renderToStaticMarkup(
    <P01N02LessonStage actionIndex={7} phase="lecture" surface="teacher" />,
  );

  assert.match(html, /data-playback-target="P01-L2-P02"/);
});

test('projector markup exposes public material without teacher-private guidance', () => {
  const page = p01TeachingPackage[0]!.pages[0]!;
  const html = renderToStaticMarkup(
    <P01N02LessonStage actionIndex={0} phase="lecture" surface="projector" />,
  );

  assert.match(html, new RegExp(page.projectorContent.material));
  for (const privateCopy of [
    page.teacherExplanation,
    page.caseQuestion,
    page.typicalAnswer,
    ...page.commonErrors,
    ...page.followUpPrompts,
    page.studentAction,
    page.transition,
  ]) assert.doesNotMatch(html, new RegExp(privateCopy));
});

test('teacher console binds its private teaching inspector to the current complete page', () => {
  const client = source('../classroom/teacher-console-client.tsx');
  const inspector = source('../classroom/teacher-console-inspector.tsx');
  const view = source('../classroom/teacher-console-view.tsx');

  assert.match(client, /teachingPageAt/);
  assert.match(inspector, /teacherExplanation/);
  assert.match(inspector, /<p><b>讲<\/b><span>\{p\.teachingPage\.teacherExplanation\}<\/span><\/p>/);
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

test('P01 teaching package keeps two six-page lessons with beginner-friendly classroom actions', () => {
  assert.equal(p01TeachingPackage.length, 2);
  for (const lesson of p01TeachingPackage) {
    assert.equal(lesson.pages.length, 6);
    for (const page of lesson.pages) {
      const combined = [
        page.title,
        page.projectorContent.prompt,
        page.teacherExplanation,
        page.caseQuestion,
        page.typicalAnswer,
        page.commonErrors.join(' '),
        page.followUpPrompts.join(' '),
        page.studentAction,
        page.transition,
      ].join(' ');
      assert.match(combined, /在哪里|是谁|连到哪|证据|缺口|成果|复核/);
      assert.ok(page.studentAction.length >= 20, `${page.id} student action too short`);
      assert.ok(page.typicalAnswer.length >= 40, `${page.id} typical answer too short`);
      assert.ok(page.commonErrors.length >= 2, `${page.id} common errors missing`);
      assert.ok(page.followUpPrompts.length >= 2, `${page.id} follow-up prompts missing`);
    }
  }
});

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}
