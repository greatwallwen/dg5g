import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const failures = [];
const v3Files = {
  chapterFixtures: join(root, 'apps', 'web', 'src', 'platform', 'fixtures', 'capability-fixtures.ts'),
  curriculumFixtures: join(root, 'apps', 'web', 'src', 'platform', 'fixtures', 'curriculum-graph-fixtures.ts'),
  graph: join(root, 'apps', 'web', 'src', 'features', 'capability-map', 'semantic-course-graph.tsx'),
  elements: join(root, 'apps', 'web', 'src', 'features', 'capability-map', 'semantic-graph-elements.tsx'),
  geometry: join(root, 'apps', 'web', 'src', 'features', 'capability-map', 'graph-geometry.ts'),
  minimap: join(root, 'apps', 'web', 'src', 'features', 'capability-map', 'graph-minimap.tsx'),
  models: join(root, 'apps', 'web', 'src', 'platform', 'models.ts'),
  styles: join(root, 'apps', 'web', 'src', 'app', 'capability-map.css'),
};
const v3 = existsSync(v3Files.graph);
const files = v3 ? v3Files : {
  fixtures: v3Files.chapterFixtures,
  graphView: join(root, 'apps', 'web', 'src', 'features', 'capability-map', 'capability-graph-view.tsx'),
  canvas: join(root, 'apps', 'web', 'src', 'features', 'capability-map', 'capability-path-canvas.tsx'),
  model: join(root, 'apps', 'web', 'src', 'features', 'capability-map', 'capability-path-model.ts'),
  styles: v3Files.styles,
};
const texts = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, read(file)]));

if (v3) {
  checkV3ChapterMaps();
  checkV3SemanticGraph();
  checkV3RendererContract();
  checkTextQuality();
} else {
  checkChapterMaps();
  checkSemanticEdges();
  checkRendererContract();
  checkTextQuality();
}
finish(v3 ? 'v3' : 'v2');

function checkV3ChapterMaps() {
  for (let index = 1; index <= 6; index += 1) {
    const id = `ch${index}`;
    const asset = `ch${index}-module-map-readable-v2.svg`;
    if (!texts.chapterFixtures.includes(`capabilityMap('${id}'`)) fail(`missing capability map fixture for ${id}`);
    if (!texts.chapterFixtures.includes(asset)) fail(`missing readable SVG asset reference ${asset}`);
  }
}

function checkV3SemanticGraph() {
  const edgeKinds = ['prerequisite', 'evidence', 'output', 'review', 'assessment'];
  if (!texts.curriculumFixtures.includes('export const curriculumSemanticEdges: SemanticEdge[]')) {
    fail('curriculum fixtures must export curriculumSemanticEdges');
  }
  for (const kind of edgeKinds) {
    if (!texts.curriculumFixtures.includes(`'${kind}')`)) fail(`curriculumSemanticEdges must include ${kind} relation`);
  }
  for (const marker of ['role-optimizer', 'work-indoor', 'cap-device', "graphNode('P01'", "graphNode('P02'", "graphNode('P18'", 'P1T1-N01', 'P1T1-N04', 'P1T2-N01', 'P1T2-N04', 'achievement-p01']) {
    if (!texts.curriculumFixtures.includes(marker)) fail(`curriculum graph is missing ${marker}`);
  }
  for (let project = 3; project <= 18; project += 1) {
    const id = `P${String(project).padStart(2, '0')}`;
    if (!new RegExp(`graphNode\\('${id}'[\\s\\S]{0,260}locked: true`).test(texts.curriculumFixtures)) {
      fail(`curriculum graph must expose ${id} as structure-only`);
    }
  }
  if (!texts.models.includes('semanticEdges: SemanticEdge[]') || !texts.models.includes('edges: SemanticEdge[]')) {
    fail('GraphData must retain semanticEdges and the edges compatibility alias');
  }
  if (!texts.graph.includes('graph.semanticEdges.filter') || !texts.graph.includes('visibleEdges.map')) {
    fail('SemanticCourseGraph must render filtered semanticEdges');
  }
  if (!texts.elements.includes('edgeBoundaryPoints(source, target)')) {
    fail('semantic edges must connect computed node boundaries');
  }
}

function checkV3RendererContract() {
  const required = [
    ['D3 zoom', "from 'd3-zoom'", texts.graph],
    ['bounded zoom scale', '.scaleExtent([.42, 1.55])', texts.graph],
    ['bounded graph world', '.translateExtent(', texts.graph],
    ['semantic graph surface', 'data-semantic-course-graph', texts.graph],
    ['search', 'graph-search', texts.graph],
    ['zoom controls', 'graph-zoom-controls', texts.graph],
    ['minimap', 'GraphMinimap', texts.graph],
    ['achievement lighting', 'achievementForNode', texts.graph],
    ['computed edge endpoints', 'edgeBoundaryPoints', texts.elements],
    ['arrow markers', 'markerEnd=', texts.elements],
    ['minimap viewport', 'data-graph-minimap', texts.minimap],
    ['semantic zoom levels', 'semanticZoomLevel', texts.geometry],
  ];
  for (const [label, snippet, text] of required) {
    if (!text.includes(snippet)) fail(`missing ${label}`);
  }
  if (texts.curriculumFixtures.includes('Math.random') || texts.graph.includes('Math.random')) {
    fail('course graph layout must remain deterministic');
  }
}

function checkChapterMaps() {
  for (let index = 1; index <= 6; index += 1) {
    const id = `ch${index}`;
    const asset = `ch${index}-module-map-readable-v2.svg`;
    if (!texts.fixtures.includes(`capabilityMap('${id}'`)) fail(`missing capability map fixture for ${id}`);
    if (!texts.fixtures.includes(asset)) fail(`missing readable SVG asset reference ${asset}`);
  }
}

function checkSemanticEdges() {
  const edgeKinds = ['prerequisite', 'evidence', 'output', 'review', 'assessment'];
  if (!texts.fixtures.includes('export const semanticEdges: SemanticEdge[]')) {
    fail('capability fixtures must export semanticEdges');
  }
  for (const kind of edgeKinds) {
    if (!texts.fixtures.includes(`'${kind}')`)) fail(`semanticEdges must include ${kind} relation`);
  }
  if (!texts.model.includes('graph.semanticEdges.map')) {
    fail('CapabilityPathModel must render edges from semanticEdges');
  }
  if (/graphData\.edges\.map|<path\s+d=|M\d+[, ]\d+/u.test(texts.graphView)) {
    fail('CapabilityGraphView must not render hardcoded path lines');
  }
}

function checkRendererContract() {
  const required = [
    ['React Flow canvas', 'ReactFlow', texts.canvas],
    ['ELK layout', 'elkjs/lib/elk.bundled.js', texts.canvas],
    ['MiniMap', 'MiniMap', texts.canvas],
    ['Controls', 'Controls', texts.canvas],
    ['full map modal', 'capability-map-modal', texts.styles],
    ['expert 3D entry', 'CapabilityGalaxyView', texts.graphView],
    ['playback target binding', 'data-playback-target', read(join(root, 'apps', 'web', 'src', 'features', 'capability-map', 'capability-node-card.tsx'))],
  ];
  for (const [label, snippet, text] of required) {
    if (!text.includes(snippet)) fail(`missing ${label}`);
  }
}

function checkTextQuality() {
  const badPattern = /\u7F03|\u9473|\u9365|\u6D93|\u701B|\u7487|\u93B6|\u7EFE|\u8930|\u95C8|\u20AC|\uFFFD/u;
  for (const [label, text] of Object.entries(texts)) {
    if (badPattern.test(text)) fail(`${label} contains mojibake`);
  }
  if (!v3 && (texts.graphView.includes('graph-project') || texts.graphView.includes('graph-node'))) {
    fail('CapabilityGraphView still references old hardcoded graph classes');
  }
}

function read(file) {
  try {
    statSync(file);
    return readFileSync(file, 'utf8');
  } catch {
    fail(`${file} is missing`);
    return '';
  }
}

function fail(message) {
  failures.push(message);
}

function finish(version = 'v2') {
  if (failures.length) {
    console.error(`capability map ${version} audit failed (${failures.length})`);
    for (const item of failures) console.error(`- ${item}`);
    process.exit(1);
  }
  console.log(`capability map ${version} audit passed`);
}
