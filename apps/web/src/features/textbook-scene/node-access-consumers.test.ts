import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('SceneRail binds label, disabled state, and clickability to NodeAccessProjection', () => {
  const source = readFileSync(new URL('./textbook-scene-support.tsx', import.meta.url), 'utf8');

  assert.match(source, /projectNodeAccess\(unit\.capabilityNodeId, progress\)/);
  assert.match(source, /disabled=\{access\.disabled\}/);
  assert.match(source, /<small>\{access\.label\}<\/small>/);
  assert.doesNotMatch(source, /index === 0 \? ['"]available['"]/);
});

test('unified course graph uses one canonical access DTO for rendering and clicks at every viewport', () => {
  const stage = readFileSync(new URL('./course-graph-stage.tsx', import.meta.url), 'utf8');
  const graph = readFileSync(new URL('../capability-map/semantic-course-graph.tsx', import.meta.url), 'utf8');

  assert.match(stage, /return <SemanticCourseGraph/);
  assert.match(graph, /accessForCurriculumNode\(node, progress\)/);
  assert.match(graph, /const access = accessById\.get\(node\.id\)!/);
  assert.match(graph, /const access = accessById\.get\(node\.id\);/);
  assert.match(graph, /if \(!access \|\| access\.disabled\) return/);
  assert.match(graph, /disabled=\{selectedAccess\.disabled\}/);
  assert.doesNotMatch(graph, /\.startsWith\(prefix\)/);
  assert.doesNotMatch(graph, /\? ['"]learning['"] : ['"]available['"]/);
});

test('desktop semantic graph uses projected access instead of fixture locked flags', () => {
  const graph = readFileSync(new URL('../capability-map/semantic-course-graph.tsx', import.meta.url), 'utf8');
  const elements = readFileSync(new URL('../capability-map/semantic-graph-elements.tsx', import.meta.url), 'utf8');
  const fixtures = readFileSync(new URL('../../platform/fixtures/curriculum-graph-fixtures.ts', import.meta.url), 'utf8');

  assert.match(graph, /accessForCurriculumNode\(node, progress\)/);
  assert.match(graph, /disabled=\{selectedAccess\.disabled\}/);
  assert.match(elements, /aria-disabled=\{access\.disabled\}/);
  assert.match(elements, /if \(!access\.disabled/);
  assert.doesNotMatch(graph, /\.locked/);
  assert.doesNotMatch(elements, /node\.locked/);
  assert.match(fixtures, /graphNode\('P03',[\s\S]*?\{ taskId: 'P03' \}\)/);
});

test('graph callers preserve loading while self-study starts from its server student cut', () => {
  const overview = readFileSync(new URL('./course-overview.tsx', import.meta.url), 'utf8');
  const shell = readFileSync(new URL('./textbook-scene-shell.tsx', import.meta.url), 'utf8');

  assert.match(overview, /useState<GraphSnapshotModel>\(\)/);
  assert.match(overview, /progress=\{snapshot\?\.nodes\}/);
  assert.match(shell, /useState\(initialSnapshot\)/);
  assert.match(shell, /progress=\{snapshot\.progress\}/);
  assert.doesNotMatch(overview, /emptyLearning/);
  assert.doesNotMatch(shell, /emptySnapshot/);
});

test('the student learning shell gates selected textbook content with the same access projection', () => {
  const shell = readFileSync(new URL('./textbook-scene-shell.tsx', import.meta.url), 'utf8');

  assert.match(shell, /const selectedAccess = projectNodeAccess\(selectedNodeId, snapshot\.progress\);/);
  assert.match(shell, /if \(selectedAccess\.disabled\) return <UnavailableNodeNotice access=\{selectedAccess\}/);
  assert.ok(shell.indexOf('if (selectedAccess.disabled)') < shell.indexOf('<LearningScene'));
});

test('self-study consumes the student cut while command clients remain actor scoped', () => {
  const client = readFileSync(new URL('../skill-tree/skill-progress-client.ts', import.meta.url), 'utf8');
  const shell = readFileSync(new URL('./textbook-scene-shell.tsx', import.meta.url), 'utf8');
  const game = readFileSync(new URL('../learning/edugame-practice-panel.tsx', import.meta.url), 'utf8');
  const teacherConsumers = [
    '../classroom/teacher-console-client.tsx',
    '../skill-tree/teacher-skill-pulse.tsx',
  ].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');

  assert.match(client, /fetch\(['"]\/api\/learning\/me['"]/);
  assert.match(client, /\/api\/learning\/class\/\$\{encodeURIComponent\(classId\)\}/);
  assert.doesNotMatch(client, /\/api\/skill-progress/);
  assert.match(shell, /fetchAuthoritativeSnapshot\('student', sessionId\)/);
  assert.match(shell, /projectStudentLearningSnapshot\(studentCut\.me\.learning\)/);
  assert.doesNotMatch(shell, /fetchLearningProgress/);
  assert.match(game, /studentVersion: number/);
  assert.match(game, /\/learn\/\$\{nodeId\}\/test/);
  assert.doesNotMatch(game, /recordSkillEvent|score:\s*nextRecord\.score/);
  assert.doesNotMatch(game, /fetchLearningProgress/);
  assert.match(teacherConsumers, /useAuthoritativeSnapshot/);
  assert.doesNotMatch(teacherConsumers, /fetchClassLearningProgress/);
  assert.doesNotMatch(teacherConsumers, /fetch(?:Learning|Skill)Progress\([^)]*studentId/);
});
