import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { requireSelfStudyDocument, selfStudySectionDefinitions } from './self-study-content.ts';
import { SelfStudyRenderer } from './self-study-renderer.tsx';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

test('resolves all self-study text through validated P1 generated content', () => {
  const document = requireSelfStudyDocument('P1T1-N02');

  assert.equal(document.taskId, 'P01');
  assert.equal(document.nodeId, 'P1T1-N02');
  assert.equal(document.nodeTitle, '设备拓扑');
  assert.equal(document.content.kind, 'deep');
  assert.deepEqual(selfStudySectionDefinitions.map(({ id, label }) => [id, label]), [
    ['problem', '问题'],
    ['figure', '看图'],
    ['steps', '步骤'],
    ['correction', '纠偏'],
    ['practice', '练习'],
    ['output', '产出'],
  ]);

  const source = readFileSync(new URL('./self-study-content.ts', import.meta.url), 'utf8');
  assert.match(source, /loadP1DemoContent/);
  assert.doesNotMatch(source, /readFileSync|JSON\.parse|demoTaskProfiles/);
});

test('renders the P03 deep textbook with six navigable sections and no N02 output submission', () => {
  const document = requireSelfStudyDocument('P1T3-N02');
  const html = renderToStaticMarkup(
    <SelfStudyRenderer completed={false} document={document} onComplete={() => undefined} saving={false} />,
  );

  assert.match(html, /data-self-study-node="P1T3-N02"/);
  for (const segment of ['problem', 'figure', 'steps', 'correction', 'practice', 'output']) {
    assert.match(html, new RegExp(`data-self-study-section="${segment}"`));
  }
  assert.match(html, /data-self-study-figure="complaint"/);
  assert.equal((html.match(/data-self-study-example=/g) ?? []).length, 2);
  assert.equal((html.match(/data-self-study-counterexample=/g) ?? []).length, 2);
  assert.match(html, /data-practice-level="foundation"/);
  assert.match(html, /data-practice-level="application"/);
  assert.match(html, /data-practice-level="transfer"/);
  assert.match(html, /错误反馈/);
  assert.match(html, /重新作答/);
  assert.match(html, /迁移任务/);
  assert.match(html, /节点学习记录模板/);
  assert.match(html, /评价标准/);
  assert.doesNotMatch(html, /提交专业产出|evidence_submitted/);
});

test('the self-study surface exposes one primary continuation and a bounded textbook scroller', () => {
  const document = requireSelfStudyDocument('P1T1-N02');
  const html = renderToStaticMarkup(
    <SelfStudyRenderer completed={false} document={document} onComplete={() => undefined} saving={false} />,
  );
  const source = readFileSync(new URL('./self-study-renderer.tsx', import.meta.url), 'utf8');

  assert.match(html, /<article[^>]*data-motion="paused"/);
  assert.match(html, /data-primary-action-policy="exactly-one"/);
  assert.match(html, /class="self-study-sections self-study-textbook-body"/);
  assert.equal((html.match(/data-primary-action="true"/g) ?? []).length, 1);
  assert.match(html, /data-primary-action="true"[^>]*>完成本段并继续/);
  assert.equal((html.match(/aria-current="step"/g) ?? []).length, 1);
  assert.equal((html.match(/<button[^>]*data-self-study-section-tab=/g) ?? []).length, 6);
  assert.equal((source.match(/data-primary-action="true"/g) ?? []).length, 3, 'reading, practice, and output branches each own their primary action');
  assert.match(source, /scrollIntoView\(\{ block: 'nearest'/);
});

test('the renderer owns one persistent terminology lookup across all six sections', () => {
  const document = requireSelfStudyDocument('P1T1-N02');
  const html = renderToStaticMarkup(
    <SelfStudyRenderer completed={false} document={document} onComplete={() => undefined} saving={false} />,
  );

  assert.match(html, /data-self-study-figure="topology"/);
  assert.equal((html.match(/data-self-study-glossary="true"/g) ?? []).length, 1);
  assert.match(html, /class="self-study-workspace"/);
});

test('renderer persists canonical six-section cursors and records reading only through explicit continuation', () => {
  const document = requireSelfStudyDocument('P1T1-N02');
  const html = renderToStaticMarkup(
    <SelfStudyRenderer completed={false} document={document} onComplete={() => undefined} saving={false} />,
  );
  const rendererSource = readFileSync(new URL('./self-study-renderer.tsx', import.meta.url), 'utf8');
  const shellSource = readFileSync(new URL('./textbook-scene-shell.tsx', import.meta.url), 'utf8');

  assert.match(rendererSource, /readSelfStudyCursor/);
  assert.match(rendererSource, /saveSelfStudyCursor/);
  assert.match(rendererSource, /selfStudySectionFromCursor/);
  assert.match(rendererSource, /function recordPracticeInteraction\(\)[\s\S]*?markLocalInteraction\(\)[\s\S]*?persistSection\('practice'\)/);
  assert.match(rendererSource, /onAttempt=\{recordPracticeInteraction\}/);
  assert.match(rendererSource, /cursorPersistence\.flush\(document\.nodeId/);
  for (const sectionId of ['problem', 'figure', 'steps', 'correction'] as const) {
    const sectionHtml = renderToStaticMarkup(
      <SelfStudyRenderer
        completed={false}
        document={document}
        initialSection={sectionId}
        onComplete={() => undefined}
        saving={false}
      />,
    );
    assert.match(sectionHtml, new RegExp(`data-complete-reading-section="${sectionId}"`));
  }
  assert.doesNotMatch(html, /data-complete-reading-section="practice"/);
  assert.doesNotMatch(html, /data-complete-reading-section="output"/);
  assert.doesNotMatch(shellSource, /for \(const sectionId of \['understand', 'evidence', 'explain', 'practice'\]\)/);
});

test('the same renderer adapts a standard node without falling back to summary-only content', () => {
  const document = requireSelfStudyDocument('P1T1-N01');
  const html = renderToStaticMarkup(
    <SelfStudyRenderer completed={false} document={document} onComplete={() => undefined} saving={false} />,
  );

  assert.equal(document.content.kind, 'standard');
  assert.match(html, /data-self-study-node="P1T1-N01"/);
  assert.match(html, /关系图/);
  assert.match(html, /结构化节点记录/);
  assert.match(html, /重新作答/);
});
