#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { MANIM_REQUIRED_TARGETS } from './manim-scene-catalog.mjs';
import { readTextbookOutputJson, textbookOutput } from './textbook-paths.mjs';

const root = process.cwd();
const projectDir = textbookOutput('projects');
const widgetDir = textbookOutput('widgets');
const publicDir = path.join(root, 'site', 'public');
const screenshotReportPath = path.join(root, 'output', 'playwright', 'animation-screenshot-audit-report.json');
const expectedProjectIds = Array.from({ length: 18 }, (_, index) => `P${String(index + 1).padStart(2, '0')}`);
const failures = [];

const AI_TRACE_PATTERNS = [
  ['ai-disclaimer', /(?:as an ai|large language model|language model|ChatGPT|Claude|Codex|Gemini|OpenAI|作为(?:一个)?AI)/i],
  ['agent-trace', /(?:subagent|system prompt|assistant response|debug note|Ralph loop|提示词|工作痕迹|子代理)/i],
];
const TEMPLATE_RESIDUE_PATTERNS = [
  ['todo-token', /\b(?:TODO|FIXME|TBD)\b/i],
  ['placeholder-token', /(?:placeholder|lorem ipsum|占位|待补|待完善|草稿|模板占位|示例内容)/i],
  ['import-template-section', /(?:template-speech|benchmark-stage|P17-benchmark|sec-task-intro|sec-task-requirements)/i],
  ['unresolved-token', /(?:\{\{[^}]+\}\}|<%=?[\s\S]*?%>|__[^_\s]{2,}__)/],
];

const outline = readTextbookOutputJson('outline');
const manimTargets = readManimTargets();
const pageFiles = mapProjectPages();
const pages = expectedProjectIds.map((projectId) => auditProject(projectId));
const screenshotReport = auditScreenshotReport();
auditGlobalShape();

const totals = {
  expectedPages: expectedProjectIds.length,
  pagesFound: pageFiles.projectCount,
  pagesWithSixKnowledgeUnits: pages.filter((page) => page.knowledgeUnitCount === 6).length,
  pagesWithManim: pages.filter((page) => page.manim.ok).length,
  pagesWithEduGame: pages.filter((page) => page.edugame.ok).length,
  pagesWithQwenAudio: pages.filter((page) => page.qwenAudio.ok).length,
  failures: failures.length,
};

console.log(JSON.stringify({
  tool: 'audit-5g-completion',
  expectedProjectIds,
  totals,
  screenshotReport,
  pages,
  failures,
}, null, 2));

if (failures.length) process.exitCode = 1;

function auditGlobalShape() {
  const outlineProjectIds = Array.isArray(outline?.projects)
    ? outline.projects.map((project) => project?.id).filter(Boolean)
    : [];
  if (outlineProjectIds.length !== expectedProjectIds.length) {
    fail('course', 'outline-project-count', `outline project count is ${outlineProjectIds.length}, expected 18`);
  }
  const missingOutline = expectedProjectIds.filter((projectId) => !outlineProjectIds.includes(projectId));
  const extraOutline = outlineProjectIds.filter((projectId) => !expectedProjectIds.includes(projectId));
  if (missingOutline.length) fail('course', 'outline-project-missing', `outline missing projects: ${missingOutline.join(', ')}`);
  if (extraOutline.length) fail('course', 'outline-project-extra', `outline has extra projects: ${extraOutline.join(', ')}`);
  if (pageFiles.projectCount !== expectedProjectIds.length) {
    fail('course', 'page-count', `project page count is ${pageFiles.projectCount}, expected 18`);
  }
  if (pageFiles.duplicates.length) {
    fail('course', 'duplicate-pages', `duplicate project pages: ${pageFiles.duplicates.join(', ')}`);
  }
  if (pageFiles.extra.length) fail('course', 'extra-pages', `extra project pages: ${pageFiles.extra.join(', ')}`);
}

function auditProject(projectId) {
  const pageFile = pageFiles.byProject.get(projectId) ?? '';
  const pagePath = pageFile ? path.join(projectDir, pageFile) : '';
  const pageText = pagePath ? readText(pagePath) : '';
  const frontmatter = parseFrontmatter(pageText);
  const widgetIds = Array.isArray(frontmatter.widgets) ? frontmatter.widgets : [];
  const playbackScenes = Array.isArray(frontmatter.playbackScenes) ? frontmatter.playbackScenes : [];
  const lessonWidgetId = `${projectId}-lesson-animation-001`;
  const edugameWidgetId = `${projectId}-edugame-interactive-001`;
  const lesson = readWidgetJson(`${lessonWidgetId}.json`);
  const edugame = readWidgetJson(`${edugameWidgetId}.json`);
  const lessonRaw = readWidgetText(`${lessonWidgetId}.json`);
  const edugameRaw = readWidgetText(`${edugameWidgetId}.json`);
  const scannedText = [pageText, lessonRaw, edugameRaw].join('\n');
  const knowledgeUnitIds = collectKnowledgeUnits(projectId, pageText);
  const missingUnits = Array.from({ length: 6 }, (_, index) => `${projectId}-ku-${String(index + 1).padStart(2, '0')}`)
    .filter((unitId) => !knowledgeUnitIds.includes(unitId));
  const manim = auditManim(projectId, pageText, lesson);
  const edugameResult = auditEduGame(projectId, pageText, widgetIds, edugame);
  const qwenAudio = auditQwenAudio(projectId, playbackScenes);
  const templateResidue = findPatternHits(scannedText, TEMPLATE_RESIDUE_PATTERNS);
  const aiTrace = findPatternHits(scannedText, AI_TRACE_PATTERNS);

  if (!pageFile) fail(projectId, 'page-missing', `${projectId} page file missing`);
  if (knowledgeUnitIds.length !== 6) {
    fail(projectId, 'knowledge-units', `${projectId} has ${knowledgeUnitIds.length} knowledge units, expected 6`, { missingUnits });
  }
  if (!widgetIds.includes(lessonWidgetId)) fail(projectId, 'lesson-widget-frontmatter', `frontmatter missing ${lessonWidgetId}`);
  if (lesson?.widget !== 'lesson-animation') fail(projectId, 'lesson-widget-file', `${lessonWidgetId}.json is missing or not lesson-animation`);
  if (templateResidue.length) fail(projectId, 'template-residue', `template residue: ${labels(templateResidue)}`);
  if (aiTrace.length) fail(projectId, 'ai-trace', `AI trace: ${labels(aiTrace)}`);

  return {
    projectId,
    pageFile,
    knowledgeUnitCount: knowledgeUnitIds.length,
    missingUnits,
    widgets: {
      declared: widgetIds,
      lessonWidgetOk: widgetIds.includes(lessonWidgetId) && lesson?.widget === 'lesson-animation',
    },
    manim,
    edugame: edugameResult,
    qwenAudio,
    templateResidue,
    aiTrace,
  };
}

function auditManim(projectId, pageText, lesson) {
  const target = manimTargets.get(projectId);
  const result = {
    ok: false,
    template: target?.template ?? '',
    pageRef: false,
    widgetTrackRef: false,
    manifestStatus: '',
    outputFileOk: false,
  };
  if (!target) {
    fail(projectId, 'manim-target', 'Manim target missing from scripts/manim-scene-sources.mjs');
    return result;
  }
  const baseUrl = `/media/manim/${projectId.toLowerCase()}/${target.template}/`;
  result.pageRef = pageText.includes(baseUrl);
  const tracks = lesson?.props?.artifact?.mediaTracks ?? [];
  result.widgetTrackRef = tracks.some((track) => String(track?.manifestUrl ?? '').includes(baseUrl));
  const manifest = readJson(path.join(publicDir, 'media', 'manim', projectId.toLowerCase(), target.template, 'manifest.json'));
  result.manifestStatus = manifest?.status ?? '';
  const outputUrl = manifest?.outputs?.videoUrl || manifest?.outputs?.posterUrl || '';
  result.outputFileOk = outputUrl ? existsSync(path.join(publicDir, outputUrl.replace(/^\//, ''))) : false;
  result.ok = result.pageRef && result.widgetTrackRef && result.manifestStatus === 'rendered' && result.outputFileOk;
  if (!result.pageRef) fail(projectId, 'manim-page-ref', `page missing Manim URL ${baseUrl}`);
  if (!result.widgetTrackRef) fail(projectId, 'manim-widget-ref', `lesson widget missing Manim mediaTrack ${baseUrl}`);
  if (result.manifestStatus !== 'rendered') fail(projectId, 'manim-rendered', `Manim manifest status is ${result.manifestStatus || '(missing)'}`);
  if (!result.outputFileOk) fail(projectId, 'manim-output-file', `Manim output file missing for ${baseUrl}`);
  return result;
}

function auditEduGame(projectId, pageText, widgetIds, edugame) {
  const widgetId = `${projectId}-edugame-interactive-001`;
  const gameConfig = edugame?.props?.gameConfig ?? {};
  const levels = Array.isArray(gameConfig.levels) ? gameConfig.levels : [];
  const firstLevel = levels[0] ?? {};
  const items = Array.isArray(firstLevel.items) ? firstLevel.items : [];
  const knowledgePoints = Array.isArray(gameConfig.knowledge_points) ? gameConfig.knowledge_points : [];
  const result = {
    ok: false,
    frontmatterRef: widgetIds.includes(widgetId),
    pagePracticeRef: pageText.includes(widgetId),
    widgetFileOk: edugame?.widget === 'edugame-pixi',
    gameType: gameConfig.game_type ?? '',
    levels: levels.length,
    items: items.length,
    knowledgePoints: knowledgePoints.length,
    scoreRuleOk: Boolean(gameConfig.score_rule?.correct && gameConfig.score_rule?.wrong_penalty),
  };
  result.ok = result.frontmatterRef
    && result.pagePracticeRef
    && result.widgetFileOk
    && Boolean(result.gameType)
    && result.levels >= 1
    && result.items >= 5
    && result.knowledgePoints >= 3
    && result.scoreRuleOk;
  if (!result.frontmatterRef) fail(projectId, 'edugame-frontmatter-ref', `frontmatter missing ${widgetId}`);
  if (!result.pagePracticeRef) fail(projectId, 'edugame-page-ref', `page missing ${widgetId}`);
  if (!result.widgetFileOk) fail(projectId, 'edugame-widget-file', `${widgetId}.json is missing or not edugame-pixi`);
  if (!result.gameType) fail(projectId, 'edugame-game-type', `${widgetId} missing game_type`);
  if (result.levels < 1 || result.items < 5 || result.knowledgePoints < 3 || !result.scoreRuleOk) {
    fail(projectId, 'edugame-config', `${widgetId} standard gameConfig is incomplete`);
  }
  return result;
}

function auditQwenAudio(projectId, playbackScenes) {
  const speechActions = collectObjects(playbackScenes)
    .filter((item) => item?.type === 'speech' || typeof item?.spokenText === 'string');
  const missingAudio = [];
  const nonQwen = [];
  const missingFiles = [];
  for (const action of speechActions) {
    const audioUrl = String(action.audioUrl ?? '');
    const voice = String(action.voiceProfileId ?? '');
    const id = String(action.id ?? '(no id)');
    if (!audioUrl) {
      missingAudio.push(id);
      continue;
    }
    if (!audioUrl.startsWith('/media/tts/qwen-') || !voice.startsWith('qwen:')) {
      nonQwen.push(id);
    }
    if (!existsSync(path.join(publicDir, audioUrl.replace(/^\//, '')))) {
      missingFiles.push(`${id}:${audioUrl}`);
    }
  }
  if (!speechActions.length) fail(projectId, 'qwen-speech-actions', 'no speech actions found in playbackScenes');
  if (missingAudio.length) fail(projectId, 'qwen-audio-url-missing', `speech actions missing audioUrl: ${missingAudio.slice(0, 6).join(', ')}`);
  if (nonQwen.length) fail(projectId, 'qwen-audio-url-provider', `speech actions are not Qwen audio: ${nonQwen.slice(0, 6).join(', ')}`);
  if (missingFiles.length) fail(projectId, 'qwen-audio-file', `Qwen audio files missing: ${missingFiles.slice(0, 6).join(', ')}`);
  return {
    ok: speechActions.length > 0 && !missingAudio.length && !nonQwen.length && !missingFiles.length,
    speechActions: speechActions.length,
    missingAudio: missingAudio.length,
    nonQwen: nonQwen.length,
    missingFiles: missingFiles.length,
  };
}

function auditScreenshotReport() {
  const report = readJson(screenshotReportPath);
  const result = {
    path: path.relative(root, screenshotReportPath).replaceAll('\\', '/'),
    readable: Boolean(report),
    tool: report?.tool ?? '',
    projectsCovered: [],
    missingProjects: expectedProjectIds,
    blockingIssues: null,
    screenshotFilesOk: 0,
    screenshotFilesMissing: 0,
    ok: false,
  };
  if (!report) {
    fail('screenshots', 'report-readable', 'animation screenshot audit report is missing or not readable');
    return result;
  }
  const results = Array.isArray(report.results) ? report.results : [];
  const covered = [...new Set(results.map((item) => item?.projectId).filter(Boolean))].sort();
  result.projectsCovered = covered;
  result.missingProjects = expectedProjectIds.filter((projectId) => !covered.includes(projectId));
  result.blockingIssues = Number(report?.totals?.blockingIssues ?? 0);
  if (report.tool !== 'audit-animation-screenshots') {
    fail('screenshots', 'report-tool', `unexpected screenshot report tool: ${report.tool ?? '(missing)'}`);
  }
  if (result.missingProjects.length) {
    fail('screenshots', 'report-coverage', `screenshot report missing projects: ${result.missingProjects.join(', ')}`);
  }
  if (result.blockingIssues > 0) fail('screenshots', 'report-blocking-issues', `screenshot report has ${result.blockingIssues} blocking issues`);
  for (const item of results) {
    const projectId = item?.projectId ?? 'screenshots';
    const overlapCount = (item?.blockingOverlaps?.length ?? 0) + (item?.blockingIssues?.length ?? 0);
    if (overlapCount > 0) fail(projectId, 'rendered-overlap', `screenshot report has ${overlapCount} blocking overlap/issues`);
    for (const file of [item?.screenshot, item?.runtimeScreenshot].filter(Boolean)) {
      if (existsSync(path.isAbsolute(file) ? file : path.join(root, file))) result.screenshotFilesOk += 1;
      else result.screenshotFilesMissing += 1;
    }
  }
  if (result.screenshotFilesMissing > 0) {
    fail('screenshots', 'report-screenshot-files', `missing screenshot files: ${result.screenshotFilesMissing}`);
  }
  result.ok = report.tool === 'audit-animation-screenshots'
    && result.missingProjects.length === 0
    && result.blockingIssues === 0
    && result.screenshotFilesMissing === 0;
  try {
    result.updatedAt = statSync(screenshotReportPath).mtime.toISOString();
  } catch {
    result.updatedAt = '';
  }
  return result;
}

function mapProjectPages() {
  const byProject = new Map();
  const duplicates = [];
  const extra = [];
  for (const file of readdirSync(projectDir).filter((item) => item.endsWith('.mdx'))) {
    const match = file.match(/^(P\d{2})-/);
    if (!match) continue;
    const projectId = match[1];
    if (!expectedProjectIds.includes(projectId)) extra.push(file);
    if (byProject.has(projectId)) duplicates.push(projectId);
    byProject.set(projectId, file);
  }
  return { byProject, duplicates, extra, projectCount: byProject.size };
}

function readManimTargets() {
  const targets = new Map();
  for (const target of MANIM_REQUIRED_TARGETS) {
    targets.set(target.project, target);
  }
  return targets;
}

function parseFrontmatter(text) {
  const match = String(text ?? '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!field) continue;
    const [, key, rawValue] = field;
    const trimmed = rawValue.trim();
    if (!trimmed) continue;
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        data[key] = JSON.parse(trimmed);
        continue;
      } catch {
        data[key] = trimmed;
        continue;
      }
    }
    data[key] = trimmed.replace(/^["']|["']$/g, '');
  }
  return data;
}

function collectKnowledgeUnits(projectId, text) {
  return [...new Set([...String(text ?? '').matchAll(/id=["'](P\d{2}-ku-\d+)(?:-body)?["']/g)]
    .map((match) => match[1])
    .filter((unitId) => unitId.startsWith(`${projectId}-ku-`)))].sort();
}

function collectObjects(value) {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(collectObjects);
  return [value, ...Object.values(value).flatMap(collectObjects)];
}

function findPatternHits(text, patterns) {
  return patterns.flatMap(([label, pattern]) => {
    const match = String(text ?? '').match(pattern);
    return match ? [{ label, sample: match[0].slice(0, 80) }] : [];
  });
}

function readWidgetJson(file) {
  return readJson(path.join(widgetDir, file));
}

function readWidgetText(file) {
  return readText(path.join(widgetDir, file));
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

function readText(file) {
  try {
    return readFileSync(file, 'utf-8');
  } catch {
    return '';
  }
}

function labels(items) {
  return items.map((item) => item.label).join(', ');
}

function fail(scope, code, message, detail = undefined) {
  failures.push({ scope, code, message, ...(detail ? { detail } : {}) });
}
