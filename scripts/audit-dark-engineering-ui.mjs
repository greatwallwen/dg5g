#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

const image2References = [
  'docs/design/image2/dgbook-image2-login-dark-v4.png',
  'docs/design/image2/dgbook-image2-capability-graph-dark-v4.png',
  'docs/design/image2/dgbook-image2-learning-dark-v4.png',
  'docs/design/image2/dgbook-image2-teacher-dark-v4.png',
  'docs/design/image2/dgbook-image2-student-follow-dark-v4.png',
  'docs/design/image2/dgbook-image2-pixi-dark-v4.png',
];

for (const file of image2References) {
  if (!exists(file)) fail('image2-reference-missing', file);
  else if (statSync(full(file)).size < 100_000) fail('image2-reference-too-small', file);
}

const layout = text('apps/web/src/app/layout.tsx');
const v4Stylesheet = 'apps/web/src/app/digital-textbook-v4.css';
const classroomStylesheet = 'apps/web/src/app/digital-classroom-v4.css';
if (!exists(v4Stylesheet)) fail('v4-stylesheet-missing', v4Stylesheet);
if (!exists(classroomStylesheet)) fail('v4-stylesheet-missing', classroomStylesheet);
if (!layout.includes("./digital-textbook-v4.css")) fail('v4-stylesheet-not-imported-last', 'layout.tsx');
else if (layout.lastIndexOf("./digital-textbook-v4.css") < layout.lastIndexOf("./auth.css")) {
  fail('v4-stylesheet-not-imported-last', 'digital-textbook-v4.css must follow page styles');
}
if (!layout.includes("./digital-classroom-v4.css") || layout.lastIndexOf("./digital-classroom-v4.css") < layout.lastIndexOf("./digital-textbook-v4.css")) {
  fail('v4-stylesheet-not-imported-last', 'digital-classroom-v4.css must follow digital-textbook-v4.css');
}

const v4 = `${text(v4Stylesheet)}\n${text(classroomStylesheet)}`;
for (const token of [
  '--dg-bg:',
  '--dg-surface:',
  '--dg-current:',
  '--dg-mastered:',
  '--dg-verified:',
  '--dg-returned:',
  '--dg-error:',
  '--dg-font-body: 16px',
  '--dg-font-small: 12px',
  '--dg-control-height: 44px',
  '--dg-narration-height: 104px',
  '100dvh',
  'prefers-reduced-motion',
]) {
  if (!v4.includes(token)) fail('v4-token-missing', token);
}

const activeCss = [
  'apps/web/src/app/globals.css',
  'apps/web/src/app/classroom.css',
  'apps/web/src/app/feature-polish.css',
  'apps/web/src/app/graphic-system.css',
  'apps/web/src/app/skill-learning.css',
  'apps/web/src/app/textbook-scene.css',
  'apps/web/src/app/capability-map.css',
  'apps/web/src/app/auth.css',
  'apps/web/src/app/p1-project.css',
  'apps/web/src/app/annotated-engineering-figure.css',
  'apps/web/src/app/self-study-textbook.css',
  'apps/web/src/app/professional-output.css',
  v4Stylesheet,
  classroomStylesheet,
];
for (const file of activeCss) {
  const source = text(file);
  for (const match of source.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/gi)) {
    if (Number(match[1]) < 12) fail('font-size-below-12px', `${file}: ${match[0]}`);
  }
}

const canonicalSurfaces = [
  'apps/web/src/features/auth/login-page.tsx',
  'apps/web/src/features/textbook-scene/course-overview.tsx',
  'apps/web/src/features/textbook-scene/textbook-scene-shell.tsx',
  'apps/web/src/features/classroom/teacher-console-client.tsx',
  'apps/web/src/features/classroom/student-follow-client.tsx',
  'apps/web/src/features/classroom/projector-client.tsx',
];
for (const file of canonicalSurfaces) {
  const source = text(file);
  if (source.includes('data-ui-surface="light"')) fail('light-surface-remains', file);
}

requireSnippets('apps/web/src/features/textbook-scene/textbook-scene-shell.tsx', [
  'data-ui-surface="dark"',
  'data-context-drawer',
  'data-context-drawer-toggle',
  'data-narration-track',
]);
requireSnippets('apps/web/src/features/playback/web-playback-config.ts', [
  "id: 'teacher-zhang'",
  "name: '张老师'",
  "avatarUrl: '/avatars/teacher-zhang-v1.png'",
  "voiceProfileId: 'qwen-tts'",
]);
requireSnippets('apps/web/src/features/classroom/teacher-console-view.tsx', [
  'data-ui-surface="dark"',
  'data-narration-track',
]);
requireSnippets('apps/web/src/features/classroom/teacher-console-inspector.tsx', [
  'data-teacher-inspector-tab',
]);
requireSnippets('apps/web/src/features/classroom/student-follow-client.tsx', [
  'data-ui-surface="dark"',
]);
requireSnippets('apps/web/src/features/classroom/classroom-follow-renderer.tsx', [
  'data-classroom-activity',
]);
requireSnippets('apps/web/src/features/classroom/projector-client.tsx', [
  'data-ui-surface="dark"',
]);
requireSnippets('apps/web/src/features/capability-map/semantic-course-graph.tsx', [
  'data-graph-density',
  'data-semantic-course-graph',
  'graph.semanticEdges.filter',
  'visibleEdges.map',
  'GraphMinimap',
]);
requireSnippets('apps/web/src/features/textbook-scene/shared-classroom-scene.tsx', [
  'IndoorScopeClassroomVisual',
  'data-classroom-scope-map="true"',
  'data-graphic-system="engineering-line"',
  'data-graphic-theme="dark-engineering"',
]);

const report = {
  tool: 'audit-dark-engineering-ui',
  summary: { failures: failures.length, image2References: image2References.length },
  image2References,
  failures,
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;

function full(file) {
  return path.join(root, file);
}

function exists(file) {
  return existsSync(full(file));
}

function text(file) {
  return exists(file) ? readFileSync(full(file), 'utf8') : '';
}

function requireSnippets(file, snippets) {
  if (!exists(file)) {
    fail('required-file-missing', file);
    return;
  }
  const source = text(file);
  for (const snippet of snippets) {
    if (!source.includes(snippet)) fail('required-contract-missing', `${file}: ${snippet}`);
  }
}

function fail(code, detail) {
  failures.push({ code, detail });
}
