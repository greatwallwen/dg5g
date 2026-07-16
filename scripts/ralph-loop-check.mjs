#!/usr/bin/env node
import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { MANIM_REQUIRED_TARGETS } from './manim-scene-sources.mjs';
import { textbookOutput, textbookOutputRelative } from './textbook-paths.mjs';

const root = process.cwd();
const checks = [];
const REQUIRED_EDUGAME_PROJECTS = Array.from({ length: 18 }, (_, index) => `P${String(index + 1).padStart(2, '0')}`);

await checkExists('Review code reader', 'scripts/codegraph-read.mjs');
await checkExists('Layout plan doc', 'docs/architecture/ralph-loop-iteration-plan.md');
await checkExists('Knowledge template schema', 'schemas/templates/knowledge-animation-template.v1.schema.json');
await checkAuditScripts();
await checkAgentDGateDesign();
await checkEduGameP08();
await checkManimCoverage();
await checkEduGameKit();
await checkEduGamePageRefs();

const failed = checks.filter((item) => !item.ok);
console.log(JSON.stringify({ tool: 'ralph-loop-check', checks, failed: failed.length }, null, 2));
if (failed.length) process.exitCode = 1;

async function checkExists(label, relativePath) {
  checks.push({
    loop: loopFor(label),
    label,
    ok: existsSync(path.join(root, relativePath)),
    path: relativePath,
  });
}

async function checkAuditScripts() {
  const packageJson = await readJson('package.json');
  const scripts = packageJson?.scripts ?? {};
  const required = [
    ['audit:content', 'scripts/audit-content-structure.mjs'],
    ['audit:animation-screenshots', 'scripts/audit-animation-screenshots.mjs'],
    ['audit:playback-runtime', 'scripts/audit-playback-runtime.mjs'],
    ['qa:gates', 'pnpm audit:content'],
    ['audit:5g-completion', 'scripts/audit-5g-completion.mjs'],
  ];
  for (const [scriptName, filePath] of required) {
    checks.push({
      loop: 'Harden',
      label: `${scriptName} gate registered`,
      ok: scriptName === 'qa:gates'
        ? String(scripts[scriptName] ?? '').includes(filePath)
        : existsSync(path.join(root, filePath)) && String(scripts[scriptName] ?? '').includes(filePath.replaceAll('\\', '/')),
      path: filePath,
    });
  }
}

async function checkAgentDGateDesign() {
  const audit = await readText('scripts/audit-content-structure.mjs');
  const benchmark = await readText('scripts/validate-animation-benchmarks.mjs');
  const focusedProjects = ['P02', 'P10', 'P11', 'P14', 'P16', 'P18'];
  const focusedOk = focusedProjects.every((project) => audit.includes(project) && benchmark.includes(project));
  checks.push({
    loop: 'Harden',
    label: 'Agent D focused content/animation gates',
    ok: focusedOk
      && audit.includes('FOCUS_KNOWLEDGE_TEMPLATES')
      && audit.includes('GENERIC_TASK_COMPONENTS')
      && audit.includes('MAIN_TASK_SECTION_PATTERN')
      && audit.includes('NON_P17_TEMPLATE_RESIDUE')
      && audit.includes('BROAD_PLAYBACK_TARGETS')
      && audit.includes('TTS_MISREAD_PATTERNS')
      && audit.includes('MOJIBAKE_PATTERNS')
      && audit.includes('findLongBodyRuns')
      && benchmark.includes('validateFocusedKnowledge')
      && benchmark.includes('validateArrowSemantics'),
    path: 'scripts/audit-content-structure.mjs',
  });
}

async function checkEduGameP08() {
  const widgetPath = `${textbookOutputRelative('widgets')}/P08-edugame-interactive-001.json`;
  const pagePath = findProjectPage('P08');
  const widget = await readJson(widgetPath);
  const gameConfig = widget?.props?.gameConfig ?? {};
  const page = pagePath ? await readFile(path.join(root, pagePath), 'utf-8') : '';
  checks.push({
    loop: 'Produce',
    label: 'P08 EduGame interactive',
    ok: widget?.widget === 'edugame-pixi'
      && gameConfig.game_type === 'boss-review'
      && Array.isArray(gameConfig.levels)
      && gameConfig.levels[0]?.items?.length >= 5
      && page.includes('P08-edugame-interactive-001'),
    path: widgetPath,
  });
}

async function checkManimCoverage() {
  const requiredRenderedProjects = new Set(['P01', 'P04', 'P08', 'P09', 'P12', 'P15', 'P17']);
  for (const target of MANIM_REQUIRED_TARGETS) {
    const manifestPath = `site/public/media/manim/${target.project.toLowerCase()}/${target.template}/manifest.json`;
    const detail = await manimReferenceDetail(target, manifestPath);
    if (!detail.manifestExists && !requiredRenderedProjects.has(target.project)) continue;
    checks.push({
      loop: 'Produce',
      label: `${target.project} Manim ${target.template}`,
      ok: detail.ok,
      path: manifestPath,
      detail,
    });
  }
}

async function checkEduGameKit() {
  const registry = await readText('packages/edugame-core/src/templates.ts');
  const templateCount = (registry.match(/^\s+\['[a-z0-9-]+'/gm) ?? []).length;
  const readyBlock = registry.match(/const ready = new Set<GameType>\(\[\s*([\s\S]*?)\s*\]\);/)?.[1] ?? '';
  const readyCount = (readyBlock.match(/'[a-z0-9-]+'/g) ?? []).length;
  checks.push({
    loop: 'Produce',
    label: '24 EduGameKit templates ready',
    ok: templateCount >= 24 && readyCount >= 24,
    path: 'packages/edugame-core/src/templates.ts',
    templateCount,
    readyCount,
  });
}

async function checkEduGamePageRefs() {
  const refs = REQUIRED_EDUGAME_PROJECTS;
  let attached = 0;
  for (const project of refs) {
    const widgetId = `${project}-edugame-interactive-001`;
    const widget = await readJson(`${textbookOutputRelative('widgets')}/${widgetId}.json`);
    const gameConfig = widget?.props?.gameConfig ?? {};
    const pagePath = findProjectPage(project);
    const page = pagePath ? await readFile(path.join(root, pagePath), 'utf-8') : '';
    const widgetOk = widget?.widget === 'edugame-pixi'
      && typeof gameConfig.game_type === 'string'
      && Array.isArray(gameConfig.levels)
      && gameConfig.levels.length > 0;
    if (widgetOk && page.includes(widgetId)) attached += 1;
  }
  checks.push({
    loop: 'Produce',
    label: '18 pages attach EduGame practice',
    ok: attached === refs.length,
    path: textbookOutputRelative('projects'),
    attached,
    expected: refs.length,
  });
}

async function manimReferenceDetail(target, manifestPath) {
  const manifest = await readJson(manifestPath);
  const videoUrl = manifest?.outputs?.videoUrl;
  const posterUrl = manifest?.outputs?.posterUrl;
  const widget = await readJson(`${textbookOutputRelative('widgets')}/${target.project}-lesson-animation-001.json`);
  const tracks = widget?.props?.artifact?.mediaTracks ?? [];
  const pagePath = findProjectPage(target.project);
  const page = pagePath ? await readFile(path.join(root, pagePath), 'utf-8') : '';
  const outputUrl = videoUrl || posterUrl || '';
  const outputFileOk = outputUrl ? existsSync(path.join(root, 'site/public', outputUrl.replace(/^\//, ''))) : false;
  const trackOk = tracks.some((track) => (
    String(track.manifestUrl ?? '').includes(`/media/manim/${target.project.toLowerCase()}/${target.template}/`) &&
    mediaOutputMatches(track, videoUrl, posterUrl)
  ));
  return {
    ok: manifest?.status === 'rendered' && Boolean(outputUrl) && outputFileOk && trackOk && page.includes(`${target.project}-lesson-animation-001`),
    manifestExists: Boolean(manifest),
    rendered: manifest?.status === 'rendered',
    outputFileOk,
    trackOk,
    pageAttached: page.includes(`${target.project}-lesson-animation-001`),
  };
}

function mediaOutputMatches(track, videoUrl, posterUrl) {
  if (videoUrl) return track.videoUrl === videoUrl;
  if (posterUrl) return track.posterUrl === posterUrl;
  return false;
}

async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(path.join(root, relativePath), 'utf-8'));
  } catch {
    return null;
  }
}

async function readText(relativePath) {
  try {
    return await readFile(path.join(root, relativePath), 'utf-8');
  } catch {
    return '';
  }
}

function findProjectPage(projectId) {
  const projectDir = textbookOutput('projects');
  const file = readdirSync(projectDir).find((item) => item.startsWith(`${projectId}-`) && item.endsWith('.mdx'));
  return file ? `${textbookOutputRelative('projects')}/${file}` : '';
}

function loopFor(label) {
  if (label.startsWith('Review')) return 'Review';
  if (label.startsWith('Layout')) return 'Layout';
  if (label.includes('schema')) return 'Layout';
  return 'Harden';
}
