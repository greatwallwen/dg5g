import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getNodeLearningPolicy } from '../../platform/learning-policy.ts';
import type { P1DemoContent } from './p1-content.ts';

const generatedContentUrl = new URL('../../../../../textbook/5g/generated/p1-demo-content.json', import.meta.url);
const textbookRootUrl = new URL('../../../../../textbook/5g/', import.meta.url);
const loaderModuleUrl = new URL('./p1-content.ts', import.meta.url);
const repositoryRoot = dirname(fileURLToPath(new URL('../../../../../pnpm-workspace.yaml', import.meta.url)));
type P1ContentLoaderModule = typeof import('./p1-content.ts');
type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2) ? true : false;
type Expect<Value extends true> = Value;
type _TasksAreFixedTuple = Expect<Equal<P1DemoContent['tasks']['length'], 3>>;
type _NodesAreFixedTuple = Expect<Equal<P1DemoContent['tasks'][number]['nodes']['length'], 4>>;

async function importLoader(): Promise<P1ContentLoaderModule> {
  return import(loaderModuleUrl.href) as Promise<P1ContentLoaderModule>;
}

async function readJson(url: URL): Promise<unknown> {
  return JSON.parse(await readFile(url, 'utf8')) as unknown;
}

function collectMediaUrls(value: unknown, urls = new Set<string>()): Set<string> {
  if (typeof value === 'string' && value.startsWith('/media/')) urls.add(value);
  else if (Array.isArray(value)) value.forEach((item) => collectMediaUrls(item, urls));
  else if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((item) => collectMediaUrls(item, urls));
  }
  return urls;
}

test('the importer generates the complete P1 content contract', async () => {
  assert.equal(
    existsSync(generatedContentUrl),
    true,
    'run pnpm import:5g to generate the P1 content contract',
  );

  const content = JSON.parse(await readFile(generatedContentUrl, 'utf8')) as Record<string, unknown>;
  assert.equal(content.schema, 'dgbook.p1-demo-content/v1');
  assert.deepEqual(content.project, {
    id: 'P1',
    title: '5G网络信息采集',
    finalOutput: '5G网络信息采集成果包',
  });
});

test('the server loader exposes one 80-point N02 test and one teacher-certified N04 output per task', async () => {
  assert.equal(existsSync(loaderModuleUrl), true, 'create the validated P1 server loader');

  const { loadP1DemoContent } = await importLoader();
  const content = loadP1DemoContent();
  assert.deepEqual(content.tasks.map((task) => task.taskId), ['P01', 'P02', 'P03']);
  assert.deepEqual(content.tasks.map((task) => task.runtimeTaskId), ['P1T1', 'P1T2', 'P1T3']);
  assert.equal(content.tasks.some((task) => 'id' in task || 'runtimeId' in task), false);
  assert.deepEqual(content.tasks.map((task) => task.prerequisiteTaskId), [undefined, 'P01', 'P02']);
  assert.equal(content.tasks.every((task) => task.why.length > 0 && task.taskOutputTitle.length > 0), true);
  assert.equal(content.tasks.every((task) => task.nodes.length === 4), true);

  const nodes = content.tasks.flatMap((task) => task.nodes);
  assert.equal(nodes.length, 12);
  assert.equal(new Set(nodes.map((node) => node.id)).size, 12);
  for (const task of content.tasks) {
    assert.deepEqual(task.nodes.map((node) => node.assessmentRole), [
      'none',
      'node-test',
      'none',
      'none',
    ]);
    assert.equal(task.nodes[1]?.requiresFormalTest, true);
    assert.equal(task.nodes[1]?.formalPassScore, 80);
    assert.equal(task.nodes[1]?.requiresProfessionalOutput, false);
    assert.equal(task.nodes[1]?.requiresTeacherVerification, false);
    assert.equal(task.nodes[3]?.requiresFormalTest, false);
    assert.equal(task.nodes[3]?.formalPassScore, undefined);
    assert.equal(task.nodes[3]?.requiresProfessionalOutput, true);
    assert.equal(task.nodes[3]?.requiresTeacherVerification, true);
    assert.equal(task.nodes[3]?.professionalOutputTitle, task.taskOutputTitle);
  }
});

test('the server loader resolves runtime content from only the repository or apps/web working directory', async () => {
  const loaderSource = await readFile(loaderModuleUrl, 'utf8');
  assert.doesNotMatch(
    loaderSource,
    /new URL\(['"]\.\.\/\.\.\/\.\.\/\.\.\/\.\.\//,
    'production code must not make webpack statically resolve the repository root',
  );

  const { loadP1DemoContent } = await importLoader();
  const originalWorkingDirectory = process.cwd();
  const unsupportedWorkingDirectory = mkdtempSync(join(tmpdir(), 'dgbook-p1-cwd-'));
  try {
    for (const workingDirectory of [repositoryRoot, join(repositoryRoot, 'apps', 'web')]) {
      process.chdir(workingDirectory);
      assert.deepEqual(loadP1DemoContent().tasks.map((task) => task.taskId), ['P01', 'P02', 'P03']);
    }

    process.chdir(unsupportedWorkingDirectory);
    assert.throws(
      () => loadP1DemoContent(),
      /Unable to resolve DGBook repository root/,
      'unknown working directories must fail closed instead of loading fallback content',
    );
  } finally {
    process.chdir(originalWorkingDirectory);
    rmSync(unsupportedWorkingDirectory, { recursive: true, force: true });
  }
});

test('the server loader resolves traced content from a standalone runtime below the release working directory', async () => {
  const { loadP1DemoContent } = await importLoader();
  const originalWorkingDirectory = process.cwd();
  const deploymentRoot = mkdtempSync(join(tmpdir(), 'dgbook-p1-standalone-'));
  const releaseRoot = join(deploymentRoot, 'current');
  const runtimeRoot = join(releaseRoot, 'runtime');

  try {
    mkdirSync(join(runtimeRoot, 'apps', 'web'), { recursive: true });
    cpSync(
      join(repositoryRoot, 'apps', 'web', 'package.json'),
      join(runtimeRoot, 'apps', 'web', 'package.json'),
    );
    cpSync(
      join(repositoryRoot, 'textbook', '5g', 'generated'),
      join(runtimeRoot, 'textbook', '5g', 'generated'),
      { recursive: true },
    );

    process.chdir(releaseRoot);
    assert.deepEqual(loadP1DemoContent().tasks.map((task) => task.taskId), ['P01', 'P02', 'P03']);
  } finally {
    process.chdir(originalWorkingDirectory);
    rmSync(deploymentRoot, { recursive: true, force: true });
  }
});

test('the server loader resolves traced content from the standalone apps/web working directory', async () => {
  const { loadP1DemoContent } = await importLoader();
  const originalWorkingDirectory = process.cwd();
  const deploymentRoot = mkdtempSync(join(tmpdir(), 'dgbook-p1-standalone-web-'));
  const runtimeRoot = join(deploymentRoot, 'current', 'runtime');
  const runtimeWebRoot = join(runtimeRoot, 'apps', 'web');

  try {
    mkdirSync(runtimeWebRoot, { recursive: true });
    cpSync(
      join(repositoryRoot, 'apps', 'web', 'package.json'),
      join(runtimeWebRoot, 'package.json'),
    );
    cpSync(
      join(repositoryRoot, 'textbook', '5g', 'generated'),
      join(runtimeRoot, 'textbook', '5g', 'generated'),
      { recursive: true },
    );

    process.chdir(runtimeWebRoot);
    assert.deepEqual(loadP1DemoContent().tasks.map((task) => task.taskId), ['P01', 'P02', 'P03']);
  } finally {
    process.chdir(originalWorkingDirectory);
    rmSync(deploymentRoot, { recursive: true, force: true });
  }
});

test('the generated contract traces every task and node to current importer artifacts', async () => {
  const { loadP1DemoContent } = await importLoader();
  const content = loadP1DemoContent();
  const animationManifest = await readJson(new URL('animations/published.json', textbookRootUrl)) as {
    projects: Record<string, string[]>;
  };

  for (const task of content.tasks) {
    const astPath = `generated/lesson-ast/${task.taskId}.json`;
    const lessonAst = await readJson(new URL(astPath, textbookRootUrl)) as {
      source: { path: string };
      lesson: { id: string; title: string };
      content: {
        storyboard: {
          schema: string;
          knowledgeUnits: Array<{ id: string; title: string; shortText: string }>;
        };
      };
    };
    const sourceUnits = [0, 1, 2, 5].map((index) => lessonAst.content.storyboard.knowledgeUnits[index]!);

    assert.equal(task.title, lessonAst.lesson.title);
    assert.equal(task.source.lessonAstId, lessonAst.lesson.id);
    assert.equal(task.source.lessonAstPath, `textbook/5g/${astPath}`);
    assert.equal(task.source.sourceDocumentPath, lessonAst.source.path);
    assert.equal(task.source.storyboardSchema, lessonAst.content.storyboard.schema);
    assert.deepEqual(task.source.knowledgeUnitRefs, sourceUnits.map((unit) => unit.id));
    assert.deepEqual(task.nodes.map((node) => node.sourceKnowledgeUnitId), sourceUnits.map((unit) => unit.id));
    assert.deepEqual(task.nodes.map((node) => node.title), sourceUnits.map((unit) => unit.title));
    assert.deepEqual(task.nodes.map((node) => node.goal), sourceUnits.map((unit) => unit.shortText));

    const expectedWidgetIds = animationManifest.projects[task.taskId];
    assert.deepEqual(task.source.widgetRefs.map((ref) => ref.id), expectedWidgetIds);
    const widgetMediaUrls = new Set<string>();
    for (const ref of task.source.widgetRefs) {
      assert.equal(ref.path, `textbook/5g/widgets/${ref.id}.json`);
      const widget = await readJson(new URL(`widgets/${ref.id}.json`, textbookRootUrl));
      collectMediaUrls(widget, widgetMediaUrls);
    }
    assert.equal(task.source.mediaRefs.length > 0, true);
    assert.equal(new Set(task.source.mediaRefs).size, task.source.mediaRefs.length);
    assert.equal(task.source.mediaRefs.every((ref) => ref.startsWith('/media/')), true);
    for (const mediaUrl of widgetMediaUrls) assert.equal(task.source.mediaRefs.includes(mediaUrl), true);
  }
});

test('the loader delegates assessment validation to the authoritative learning policy', async () => {
  const loaderSource = await readFile(loaderModuleUrl, 'utf8');
  assert.match(loaderSource, /getNodeLearningPolicy/);
  assert.doesNotMatch(loaderSource, /isNodeTest|isTaskEnd/);

  const { loadP1DemoContent } = await importLoader();
  const content = loadP1DemoContent();
  for (const node of content.tasks.flatMap((task) => task.nodes)) {
    const policy = getNodeLearningPolicy(node.id);
    assert.ok(policy, `missing learning policy for ${node.id}`);
    assert.equal(node.assessmentRole, policy.assessmentRole);
    assert.equal(node.requiresFormalTest, policy.requiresFormalTest);
    assert.equal(node.requiresProfessionalOutput, policy.requiresProfessionalOutput);
    assert.equal(node.requiresTeacherVerification, policy.requiresTeacherVerification);
    assert.equal(node.professionalOutputTitle, policy.professionalOutputTitle);
  }
});

test('the server loader rejects exact contract drift cases', async () => {
  type MutableNode = Record<string, unknown>;
  type MutableTask = Record<string, unknown> & {
    nodes: MutableNode[];
    source: Record<string, unknown>;
  };
  type MutableContent = { tasks: MutableTask[] };

  const valid = JSON.parse(await readFile(generatedContentUrl, 'utf8')) as MutableContent;
  const mutations: Array<{ name: string; mutate: (content: MutableContent) => void }> = [
    {
      name: 'node source mapping swapped',
      mutate(content) {
        const first = content.tasks[0]!.nodes[0]!;
        const second = content.tasks[0]!.nodes[1]!;
        [first.title, second.title] = [second.title, first.title];
        [first.goal, second.goal] = [second.goal, first.goal];
      },
    },
    { name: 'required field missing', mutate: (content) => { delete content.tasks[0]!.why; } },
    { name: 'wrong runtime ID', mutate: (content) => { content.tasks[0]!.runtimeTaskId = 'P1-T1'; } },
    {
      name: 'duplicate node ID',
      mutate: (content) => { content.tasks[0]!.nodes[2]!.id = content.tasks[0]!.nodes[1]!.id; },
    },
    {
      name: 'assessment policy drift',
      mutate: (content) => { content.tasks[0]!.nodes[1]!.assessmentRole = 'none'; },
    },
    { name: 'source refs missing', mutate: (content) => { content.tasks[0]!.source.mediaRefs = []; } },
    { name: 'wrong P03 prerequisite', mutate: (content) => { content.tasks[2]!.prerequisiteTaskId = 'P01'; } },
  ];

  const directory = mkdtempSync(join(tmpdir(), 'dgbook-p1-drift-'));
  const candidatePath = join(directory, 'candidate.json');
  try {
    const { loadP1DemoContent } = await importLoader();
    for (const mutation of mutations) {
      const candidate = structuredClone(valid);
      mutation.mutate(candidate);
      writeFileSync(candidatePath, JSON.stringify(candidate), 'utf8');
      assert.throws(
        () => loadP1DemoContent(candidatePath),
        /Invalid P1 demo content/,
        mutation.name,
      );
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('demo profiles are projected from the validated generated catalog and fail closed for unknown nodes', async () => {
  const { loadP1DemoContent } = await importLoader();
  const { loadSelfStudyCatalog } = await import('../textbook-scene/self-study-content.ts');
  const profiles = await import('./deep-textbook-demo-data.ts');
  const catalog = loadSelfStudyCatalog(loadP1DemoContent());
  const projected = profiles.createDemoTaskProfiles(catalog);
  assert.deepEqual(Object.keys(projected), ['P01', 'P02', 'P03']);
  assert.equal(typeof profiles.getDemoTaskProfileForNode, 'function');
  assert.equal(profiles.getDemoTaskProfileForNode('P1T1-N01', projected)?.taskId, 'P01');
  assert.equal(profiles.getDemoTaskProfileForNode('P1T2-N04', projected)?.taskId, 'P02');
  assert.equal(profiles.getDemoTaskProfileForNode('P1T3-N01', projected)?.taskId, 'P03');
  assert.equal(profiles.getDemoTaskProfileForNode('P1T3-N04', projected)?.taskId, 'P03');
  assert.equal(profiles.getDemoTaskProfileForNode('P1T4-N01', projected), undefined);
  assert.equal(profiles.getDemoTaskProfileForNode('not-a-node', projected), undefined);
  assert.deepEqual(
    projected.P03.units.map((unit) => unit.capabilityNodeId),
    ['P1T3-N01', 'P1T3-N02', 'P1T3-N03', 'P1T3-N04'],
  );
  assert.equal(projected.P01.units[1]?.question, catalog['P1T1-N02'].content.kind === 'deep'
    ? catalog['P1T1-N02'].content.taskQuestion
    : undefined);
});

test('the server loader throws for missing, malformed, or schema-invalid content', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'dgbook-p1-content-'));
  const malformedPath = join(directory, 'malformed.json');
  const schemaInvalidPath = join(directory, 'schema-invalid.json');
  writeFileSync(malformedPath, '{not-json', 'utf8');
  writeFileSync(schemaInvalidPath, JSON.stringify({ schema: 'wrong' }), 'utf8');

  try {
    const { loadP1DemoContent } = await importLoader();
    assert.throws(
      () => loadP1DemoContent(join(directory, 'missing.json')),
      /Unable to load P1 demo content/,
    );
    assert.throws(
      () => loadP1DemoContent(malformedPath),
      /Malformed P1 demo content JSON/,
    );
    assert.throws(
      () => loadP1DemoContent(schemaInvalidPath),
      /Invalid P1 demo content.*schema/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
