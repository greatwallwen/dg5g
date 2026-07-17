import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { migrateDatabase } from '../../platform/db/migrations.ts';
import { seedDemo } from '../../platform/db/demo-seed.ts';
import { createTestDatabase } from '../../platform/db/test-database.ts';
import { readP1ProjectProjection } from '../../platform/p1-project-projection.ts';
import { buildP1ProjectViewModel } from './p1-project-model.ts';
import { P1ProjectView } from './p1-project-view.tsx';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

test('renders the P1 project chain with stable audit selectors and no locked task links', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const model = buildP1ProjectViewModel(readP1ProjectProjection('stu-01', fixture.database));
    const html = renderToStaticMarkup(<P1ProjectView displayName="学生一" model={model} />);

    assert.match(html, /data-p1-project="P1"/);
    assert.match(html, /data-motion="paused"/);
    assert.match(html, /data-primary-action-policy="exactly-one"/);
    assert.equal((html.match(/data-primary-action="true"/g) ?? []).length, 1);
    assert.match(html, /data-primary-action="true"[^>]*data-p1-next-action="P1T1-N01"|data-p1-next-action="P1T1-N01"[^>]*data-primary-action="true"/);
    assert.match(html, /data-p1-task="P01"/);
    assert.match(html, /data-p1-task="P02"/);
    assert.match(html, /data-p1-task="P03"/);
    assert.match(html, /data-p1-node-state="available"/);
    assert.match(html, /data-p1-node-state="locked"/);
    assert.match(html, /data-p1-next-action="P1T1-N01"/);
    assert.match(html, /data-p1-portfolio-status="not-started"/);
    assert.match(html, /data-p1-portfolio-link="not-started"/);
    assert.match(html, /data-p1-task-rail="true"/);
    assert.match(html, /data-p1-task-detail-flow="full-width"/);
    assert.equal((html.match(/data-p1-task-summary=/g) ?? []).length, 3);
    for (const taskId of ['P01', 'P02', 'P03']) {
      assert.match(html, new RegExp(`data-p1-task-summary="${taskId}"`));
    }
    assert.match(html, /data-p1-task-summary="P01"[^>]*aria-current="step"|aria-current="step"[^>]*data-p1-task-summary="P01"/);
    assert.equal((html.match(/<details/g) ?? []).length, 3);
    assert.match(html, /<details[^>]*data-p1-task="P01"[^>]*open=""|<details[^>]*open=""[^>]*data-p1-task="P01"/);
    assert.match(html, /data-p1-task-detail-summary="P03"/);
    assert.match(html, /href="\/student\/projects\/p1\/portfolio"/);
    assert.match(html, /href="\/learn\/P1T1-N01"/);
    assert.doesNotMatch(html, /href="\/learn\/P1T2-/);
    assert.doesNotMatch(html, /href="\/learn\/P1T3-/);
    assert.match(html, /当前任务/);
    assert.match(html, /下一步/);
    assert.match(html, /完成标准/);
    assert.match(html, /5G网络信息采集成果包/);
  } finally {
    fixture.cleanup();
  }
});

test('keeps the long project and portfolio pages scrollable without hiding document overflow', () => {
  const css = readFileSync(new URL('../../app/p1-project.css', import.meta.url), 'utf8');
  assert.match(css, /html:has\(\.p1-project-shell\)/);
  assert.match(css, /body:has\(\.p1-project-shell\)[\s\S]*overflow-y:\s*auto/);
  assert.match(css, /body:has\(\.p1-project-shell\)[\s\S]*height:\s*auto/);
  assert.match(css, /html:has\(\.p1-portfolio-shell\)/);
  assert.doesNotMatch(css, /overflow-x:\s*(?:hidden|clip)/);
  assert.ok((css.match(/overflow-x:\s*auto/g) ?? []).length >= 2);
});

test('renders every seeded verified task as explicit demonstration data', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const model = buildP1ProjectViewModel(readP1ProjectProjection('stu-03', fixture.database));
    const html = renderToStaticMarkup(<P1ProjectView displayName="学生三" model={model} />);

    assert.equal(
      (html.match(/class="p1-task-state is-verified">教师已认证 · 演示数据/g) ?? []).length,
      3,
    );
  } finally {
    fixture.cleanup();
  }
});

test('shows every P01 P02 P03 task rail title in full at the 390px breakpoint', () => {
  const css = readFileSync(new URL('../../app/p1-project.css', import.meta.url), 'utf8');
  const mobile = css.match(/@media\s*\(max-width:\s*760px\)[\s\S]*?(?=\/\* P1 verified-output portfolio \*\/)/)?.[0] ?? '';
  assert.match(mobile, /\.p1-task-rail strong\s*\{[^}]*white-space:\s*normal/);
  assert.match(mobile, /\.p1-task-rail strong\s*\{[^}]*text-overflow:\s*clip/);
  assert.match(mobile, /\.p1-task-rail strong\s*\{[^}]*overflow-wrap:\s*anywhere/);
});

test('uses one stable full-width native-details reading flow on desktop', () => {
  const css = readFileSync(new URL('../../app/p1-project.css', import.meta.url), 'utf8');
  const desktop = css.match(/@media\s*\(min-width:\s*1181px\)[\s\S]*?(?=@media\s*\(max-width:\s*1180px\))/)?.[0] ?? '';
  assert.match(desktop, /\.p1-task-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(desktop, /\.p1-task-slot\s*\{[^}]*width:\s*100%/);
  assert.match(desktop, /\.p1-task-connector\s*\{[^}]*display:\s*none/);
});
