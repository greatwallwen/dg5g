#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

const references = [
  'docs/design/image2/dgbook-image2-login-dark-v4.png',
  'docs/design/image2/dgbook-image2-capability-graph-dark-v4.png',
  'docs/design/image2/dgbook-image2-learning-dark-v4.png',
  'docs/design/image2/dgbook-image2-teacher-dark-v4.png',
  'docs/design/image2/dgbook-image2-student-follow-dark-v4.png',
  'docs/design/image2/dgbook-image2-pixi-dark-v4.png',
];

for (const file of references) {
  if (!exists(file)) fail('image2-missing', file);
  else if (statSync(full(file)).size < 100_000) fail('image2-too-small', file);
}

const canonicalPages = [
  'apps/web/src/app/page.tsx',
  'apps/web/src/app/platform/page.tsx',
  'apps/web/src/app/resources/page.tsx',
  'apps/web/src/app/governance/page.tsx',
  'apps/web/src/app/delivery/page.tsx',
  'apps/web/src/app/course/page.tsx',
  'apps/web/src/app/learn/[nodeId]/page.tsx',
  'apps/web/src/app/teacher/sessions/[sessionId]/page.tsx',
  'apps/web/src/app/classroom/[sessionId]/page.tsx',
  'apps/web/src/app/present/[sessionId]/page.tsx',
];
for (const file of canonicalPages) {
  if (!exists(file)) fail('canonical-route-missing', file);
}

const obsoletePages = [
  'apps/web/src/app/projects/page.tsx',
  'apps/web/src/app/projects/[projectId]/page.tsx',
  'apps/web/src/app/tasks/[taskId]/page.tsx',
  'apps/web/src/app/samples/deep-textbook/P01-P02/page.tsx',
  'apps/web/src/app/samples/deep-textbook/P4T2-N04/page.tsx',
  'apps/web/src/app/maps/page.tsx',
  'apps/web/src/app/maps/course/page.tsx',
  'apps/web/src/app/login/student/page.tsx',
  'apps/web/src/app/login/teacher/page.tsx',
  'apps/web/src/app/teacher/page.tsx',
  'apps/web/src/app/classroom/page.tsx',
];
for (const file of obsoletePages) {
  if (exists(file)) fail('obsolete-route-present', file);
}

requireSnippets('apps/web/src/app/page.tsx', ['LoginPage', 'data-login-role']);
requireSnippets('apps/web/src/features/auth/login-page.tsx', ['查看平台总览', 'href="/platform"']);
requireSnippets('apps/web/src/features/platform-overview/public-platform-model.ts', [
  'PublicPlatformCard',
  'buildPublicPlatformModel',
  "'input'",
  "'feedback'",
]);
forbidSnippets('apps/web/src/features/platform-overview/public-platform-model.ts', [
  'AuthoritativeSnapshotReader',
  'getDatabase',
]);
for (const file of [
  'apps/web/src/app/platform/page.tsx',
  'apps/web/src/app/resources/page.tsx',
  'apps/web/src/app/governance/page.tsx',
  'apps/web/src/app/delivery/page.tsx',
]) {
  requireSnippets(file, ['PublicPlatformView', 'buildPublicPlatformModel']);
  forbidSnippets(file, ['AuthoritativeSnapshotReader', 'getDatabase', '<button', "method: 'POST'"]);
}
requireSnippets('apps/web/src/features/auth/role-session.ts', [
  'S20260101',
  'T20260001',
  'webStudentIdStorageKey',
  "student: '/course'",
  "teacher: '/course'",
]);

requireSnippets('apps/web/src/platform/models.ts', [
  'CurriculumGraphNodeKind',
  'CurriculumGraphNode',
  'AchievementLevel',
  'GameAttemptSummary',
  'FormalTestSession',
]);
requireSnippets('apps/web/src/platform/fixtures/curriculum-graph-fixtures.ts', [
  '5G无线网络优化工程师',
  '网络测试工程师',
  '网管与运维工程师',
  '无线网络规划工程师',
  'capability-map-expert-readable-v2.svg',
]);
requireSnippets('apps/web/src/features/capability-map/semantic-course-graph.tsx', [
  "from 'd3-zoom'",
  'data-semantic-course-graph',
  'GraphMinimap',
  '返回全景',
  '课程能力图谱',
]);
requireSnippets('apps/web/src/features/capability-map/graph-geometry.ts', [
  'edgeBoundaryPoints',
  'semanticZoomLevel',
]);

requireSnippets('apps/web/src/features/textbook-scene/textbook-scene-shell.tsx', [
  'WebPlaybackDock',
  'playbackScenes',
  'data-narration-track',
]);
requireSnippets('apps/web/src/features/textbook-scene/learning-scene.tsx', ['MicroPractice']);
requireSnippets('apps/web/src/features/playback/web-playback-config.ts', [
  "title: '5G网优实训导师'",
  "name: '张老师'",
]);
requireSnippets('apps/web/src/features/playback/web-playback-dock.tsx', [
  "variant?: 'dock' | 'track' | 'game-strip'",
  'pauseAfterActionIds',
  'data-playback-variant',
]);
requireSnippets('apps/web/src/features/textbook-scene/micro-practice-model.ts', [
  "'connection'",
  "'selection'",
  "'card-flip'",
  "'ordering'",
]);

requireSnippets('apps/web/src/platform/learning-mastery.ts', [
  'deriveAchievementLevel',
  'summarizeFormalAttempts',
  'calculateTaskGrade',
  'MAX_FORMAL_ATTEMPTS',
]);
requireSnippets('apps/web/src/platform/skill-progress-store.ts', [
  'firstGameScore',
  'bestGameScore',
  'latestGameScore',
  'attemptCount',
  'calculateTaskGrade',
]);

const gameFixture = text('apps/web/src/platform/fixtures/skill-game-fixtures.ts');
for (const marker of [
  "professionalVariant: 'topology-repair'",
  "professionalVariant: 'evidence-chain'",
  "professionalVariant: 'beam-tuning'",
  "professionalVariant: 'coverage-survey'",
  "'P1T1-N02'",
  "'P1T1-N04'",
  "'P1T2-N02'",
  "'P1T2-N04'",
]) {
  if (!gameFixture.includes(marker)) fail('formal-game-contract', marker);
}
const longDurations = [...gameFixture.matchAll(/duration:\s*(\d+)/g)].map((match) => Number(match[1])).filter((value) => value >= 300 && value <= 480);
if (longDurations.length < 4) fail('formal-game-duration', `expected four 300-480 second games, found ${longDurations.length}`);

for (const [file, markers] of Object.entries({
  'packages/widgets/src/edugame-pixi/TopologyRepairArcade.tsx': ["import('pixi.js')", 'app.destroy', 'data-topology-repair-arcade'],
  'packages/widgets/src/edugame-pixi/EvidenceChainArcade.tsx': ["import('pixi.js')", 'app.destroy', 'data-evidence-chain-arcade'],
  'packages/widgets/src/edugame-pixi/BeamTuningArcade.tsx': ["import('pixi.js')", 'app.destroy', 'data-beam-tuning-arcade'],
  'packages/widgets/src/edugame-pixi/CoverageSurveyArcade.tsx': ["import('pixi.js')", 'app.destroy', 'data-edugame-target-id'],
})) requireSnippets(file, markers);

requireSnippets('apps/web/src/platform/classroom-roster-repository.ts', [
  'FROM classroom_sessions AS classroom',
  'JOIN classroom_members AS member',
  'JOIN users AS user',
  'WHERE classroom.session_id = ?',
  'ORDER BY member.joined_at, member.student_id',
]);
requireSnippets('apps/web/src/platform/class-session-store.ts', [
  'new ClassroomRosterRepository(getDatabase())',
  '.readStudentRoster(DEMO_CLASS_ID, nodeId)',
]);
requireSnippets('apps/web/src/platform/fixtures/session-fixtures.ts', [
  'suppliedRoster: readonly StudentProgress[]',
  'canonicalTaskIdForNode(nodeId)',
  'getNodeLearningPolicy(nodeId)',
]);
forbidSnippets('apps/web/src/platform/fixtures/session-fixtures.ts', [
  'createDeterministicRoster(',
  'index < 18',
  'index < 22',
  "const activeTaskId = nodeId.startsWith(",
]);
requireSnippets('apps/web/src/app/teacher/sessions/[sessionId]/page.tsx', [
  'AuthoritativeSnapshotReader',
  "read(actor, 'teacher'",
  'sessionId: params.sessionId',
]);
requireSnippets('apps/web/src/app/present/[sessionId]/page.tsx', [
  'AuthoritativeSnapshotReader',
  "read(actor, 'projector'",
  'sessionId: params.sessionId',
]);
requireSnippets('apps/web/src/features/classroom/teacher-console-client.tsx', [
  'useAuthoritativeSnapshot',
  'projectTeacherConsoleSnapshot',
  'snapshotModel.formalAssessment',
]);
forbidSnippets('apps/web/src/features/classroom/teacher-console-client.tsx', [
  'getRosterStats',
  'submittedFormalScores',
  '.filter(',
  '.reduce(',
]);
requireSnippets('apps/web/src/features/classroom/teacher-console-inspector.tsx', [
  'formalAssessment.submittedCount',
  'activeNodeTestHighestScore',
  'activeTaskCompositeAverageScore',
  'projectCompositeAverageScore',
]);
requireSnippets('apps/web/src/features/classroom/projector-client.tsx', [
  'useAuthoritativeSnapshot',
  'snapshot.submissions.activeAssessment',
  '正式测试',
]);
forbidSnippets('apps/web/src/features/classroom/projector-client.tsx', [
  'anonymousProgress',
  'formalTest?.participants',
  'participants: studentRoster.map',
  '.filter(',
  '.reduce(',
]);

const activeProductFiles = listActiveProductFiles();
for (const file of activeProductFiles) {
  const source = text(file);
  for (const fixedClassroomFact of ['18/24', '21/24']) {
    if (source.includes(fixedClassroomFact)) fail('fixed-classroom-fact', `${file}: ${fixedClassroomFact}`);
  }
  for (const phrase of ['生成与治理', 'AI生产工具链', '平台演示', '深度样板', '样例项目完整闭环']) {
    if (source.includes(phrase)) fail('legacy-product-copy', `${file}: ${phrase}`);
  }
}

const report = {
  tool: 'audit-digital-textbook-v3',
  summary: { failures: failures.length, references: references.length, canonicalPages: canonicalPages.length },
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

function forbidSnippets(file, snippets) {
  if (!exists(file)) {
    fail('required-file-missing', file);
    return;
  }
  const source = text(file);
  for (const snippet of snippets) {
    if (source.includes(snippet)) fail('forbidden-contract-present', `${file}: ${snippet}`);
  }
}

function listActiveProductFiles() {
  const roots = [
    'apps/web/src/app',
    'apps/web/src/features',
    'apps/web/src/platform',
  ];
  const files = [];
  for (const directory of roots) walk(directory, files);
  return files.filter((file) => /\.(?:ts|tsx|css)$/.test(file));
}

function walk(directory, files) {
  const absolute = full(directory);
  if (!existsSync(absolute)) return;
  for (const entry of Object.values(importDirectory(absolute))) {
    const relative = path.relative(root, entry.path).replaceAll('\\', '/');
    if (entry.directory) walk(relative, files);
    else files.push(relative);
  }
}

function importDirectory(directory) {
  // Keep this audit dependency-free and synchronous.
  const { readdirSync } = requireFs();
  return readdirSync(directory, { withFileTypes: true }).map((entry) => ({
    path: path.join(directory, entry.name),
    directory: entry.isDirectory(),
  }));
}

function requireFs() {
  return globalThis.__dgbookAuditFs ??= loadFs();
}

function loadFs() {
  // ESM-safe indirection is replaced below during module initialization.
  return { readdirSync: fsReaddirSync };
}

import { readdirSync as fsReaddirSync } from 'node:fs';

function fail(code, detail) {
  failures.push({ code, detail });
}
