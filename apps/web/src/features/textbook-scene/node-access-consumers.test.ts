import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('SceneRail separates learning access from navigation to prerequisite notices', () => {
  const source = readFileSync(new URL('./textbook-scene-support.tsx', import.meta.url), 'utf8');

  assert.match(source, /projectNodeAccess\(unit\.capabilityNodeId, progress\)/);
  assert.match(source, /disabled=\{!access\.canNavigate\}/);
  assert.match(source, /access\.kind === 'locked'/);
  assert.doesNotMatch(source, /index === 0 \? ['"]available['"]/);
});

test('unified course graph uses one canonical access DTO for rendering and clicks at every viewport', () => {
  const stage = readFileSync(new URL('./course-graph-stage.tsx', import.meta.url), 'utf8');
  const graph = readFileSync(new URL('../capability-map/semantic-course-graph.tsx', import.meta.url), 'utf8');

  assert.match(stage, /return <SemanticCourseGraph/);
  assert.match(stage, /if \(!access\.canNavigate\) return;/);
  assert.doesNotMatch(stage, /if \(access\.disabled\) return;/);
  assert.match(graph, /accessForCurriculumNode\(node, progress\)/);
  assert.match(graph, /const access = accessById\.get\(node\.id\)!/);
  assert.match(graph, /const access = accessById\.get\(node\.id\);/);
  assert.match(graph, /if \(!access \|\| !access\.canNavigate\) return/);
  assert.match(graph, /disabled=\{!selectedAccess\.canNavigate\}/);
  assert.doesNotMatch(graph, /\.startsWith\(prefix\)/);
  assert.doesNotMatch(graph, /\? ['"]learning['"] : ['"]available['"]/);
});

test('task selection opens the first prerequisite notice for locked tasks but rejects unavailable tasks', () => {
  const shell = readFileSync(new URL('./textbook-scene-shell.tsx', import.meta.url), 'utf8');

  assert.match(shell, /const access = projectTaskAccess\(nextTaskId, snapshot\.progress\);/);
  assert.match(shell, /if \(!access\.canNavigate\) return;/);
  assert.match(shell, /const firstNodeId = nextProfile\.units\[0\]\.capabilityNodeId;/);
  assert.match(shell, /if \(access\.kind === 'locked'\) \{[\s\S]*?router\.push\(`\/learn\/\$\{firstNodeId\}`\);[\s\S]*?return;[\s\S]*?\}/);
});

test('desktop semantic graph uses projected access instead of fixture locked flags', () => {
  const graph = readFileSync(new URL('../capability-map/semantic-course-graph.tsx', import.meta.url), 'utf8');
  const elements = readFileSync(new URL('../capability-map/semantic-graph-elements.tsx', import.meta.url), 'utf8');
  const fixtures = readFileSync(new URL('../../platform/fixtures/curriculum-graph-fixtures.ts', import.meta.url), 'utf8');

  assert.match(graph, /accessForCurriculumNode\(node, progress\)/);
  assert.match(graph, /disabled=\{!selectedAccess\.canNavigate\}/);
  assert.match(elements, /aria-disabled=\{!access\.canNavigate\}/);
  assert.match(elements, /if \(access\.canNavigate/);
  assert.doesNotMatch(graph, /\.locked/);
  assert.doesNotMatch(elements, /node\.locked/);
  assert.match(fixtures, /graphNode\('P03',[\s\S]*?\{ taskId: 'P03' \}\)/);
});

test('graph callers start from a server graph cut while self-study starts from its server student cut', () => {
  const overview = readFileSync(new URL('./course-overview.tsx', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../../app/course/page.tsx', import.meta.url), 'utf8');
  const shell = readFileSync(new URL('./textbook-scene-shell.tsx', import.meta.url), 'utf8');

  assert.match(page, /new AuthoritativeSnapshotReader\(getDatabase\(\)\)\.read\(actor, 'graph'\)/);
  assert.match(page, /projectGraphSnapshot/);
  assert.match(overview, /initialSnapshot: GraphSnapshotModel/);
  assert.match(overview, /useState<GraphSnapshotModel>\(initialSnapshot\)/);
  assert.match(overview, /progress=\{snapshot\.nodes\}/);
  assert.doesNotMatch(overview, /data-snapshot-version=\{facts\?\.snapshotVersion \?\? 0\}/);
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

test('node selection updates the canonical URL and record saving covers all six textbook sections', () => {
  const shell = readFileSync(new URL('./textbook-scene-shell.tsx', import.meta.url), 'utf8');
  const client = readFileSync(new URL('./textbook-scene-client.ts', import.meta.url), 'utf8');

  assert.match(shell, /syncLearningUrl\(nodeId\)/);
  assert.match(client, /window\.history\.pushState\(\{ nodeId \}, '', nextPath\)/);
  assert.match(shell, /for \(const \{ id: sectionId \} of selfStudySectionDefinitions\)/);
  assert.doesNotMatch(shell, /\['understand', 'evidence', 'explain', 'practice'\]/);
});

test('self-study consumes the student cut while command clients remain actor scoped', () => {
  const client = readFileSync(new URL('../skill-tree/skill-progress-client.ts', import.meta.url), 'utf8');
  const shell = readFileSync(new URL('./textbook-scene-shell.tsx', import.meta.url), 'utf8');
  const sceneClient = readFileSync(new URL('./textbook-scene-client.ts', import.meta.url), 'utf8');
  const game = readFileSync(new URL('../learning/edugame-practice-panel.tsx', import.meta.url), 'utf8');
  const teacherConsumers = [
    '../classroom/teacher-console-client.tsx',
    '../skill-tree/teacher-skill-pulse.tsx',
  ].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');

  assert.match(client, /fetch\(['"]\/api\/learning\/me['"]/);
  assert.match(client, /\/api\/learning\/class\/\$\{encodeURIComponent\(classId\)\}/);
  assert.doesNotMatch(client, /\/api\/skill-progress/);
  assert.match(sceneClient, /fetchAuthoritativeSnapshot\('student', sessionId\)/);
  assert.match(sceneClient, /projectStudentLearningSnapshot\(studentCut\.me\.learning\)/);
  assert.doesNotMatch(shell, /fetchLearningProgress/);
  assert.match(game, /studentVersion: number/);
  assert.match(game, /\/learn\/\$\{nodeId\}\/test/);
  assert.doesNotMatch(game, /recordSkillEvent|score:\s*nextRecord\.score/);
  assert.doesNotMatch(game, /fetchLearningProgress/);
  assert.match(teacherConsumers, /useAuthoritativeSnapshot/);
  assert.doesNotMatch(teacherConsumers, /fetchClassLearningProgress/);
  assert.doesNotMatch(teacherConsumers, /fetch(?:Learning|Skill)Progress\([^)]*studentId/);
});
