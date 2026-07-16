#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { textbookOutput } from './textbook-paths.mjs';

const root = process.cwd();
const projectDir = textbookOutput('projects');
const widgetDir = textbookOutput('widgets');
const publicDir = path.join(root, 'site', 'public');
const screenshotReportPath = path.join(root, 'output', 'playwright', 'animation-screenshot-audit-report.json');
const projectIds = Array.from({ length: 18 }, (_, index) => `P${String(index + 1).padStart(2, '0')}`);
const failures = [];
const rows = [];
const visualSignatures = new Map();

const VISIBLE_INTERNAL_PATTERNS = [
  ['internal-engine-name', /\b(?:Manim|Qwen|OpenMAIC|TeachingStage|Playwright)\b/],
  ['internal-widget-name', /\b(?:lesson-animation|mediaTracks?|playbackScenes|audioUrl|voiceProfileId|stageId)\b/i],
  ['internal-route', /\/(?:media|interactives)\/(?:manim|tts)\//i],
];
const TEMPLATE_TONE_PATTERNS = [
  ['generic-open-loop', /P\d{2}\s*聚焦.+本页先建立.+知识点闭环/],
  ['generic-stage-copy', /先用\s*1\s*分钟建立本节知识框架|先看知识动画，再阅读下方讲义与证据资料/],
  ['generic-knowledge-mode', /知识点\s*\+\s*动画\s*\+\s*证据\s*\+\s*互动/],
  ['generic-practice-cta', /请在页面中的互动实验里完成.+系统会给出判断反馈和复盘提示/],
  ['visible-generator-trace', /Generated (?:from|pure|Web)|docx-importer/i],
];
const LEARNER_VISIBLE_RESIDUE_PATTERNS = [
  ['task-import-residue', /任务导入|任务要求|任务描述|任务书|实训任务|提交要求|评分标准/],
  ['visible-experiment-term', /互动实验|进入互动实验|实验入口|完成实验/],
  ['visible-submission-term', /提交|上传|得分|评分|作业|闯关/],
  ['visible-production-trace', /可视化演示|配套约束|实验输出|运行输出|技术实现|实现细节|生成痕迹|调试输出|控制台输出|截图基线|自动审核|动画审核|知识链生成|已按知识链生成/],
  ['visible-template-chain-copy', /Manim\s*知识动画|知识链|知识点闭环|流程展示|步骤展示|任务流程|操作流程|照片、编号、坐标|照片编号坐标/],
  ['visible-ai-term', /(?:^|[^A-Za-z0-9])AI(?:\s*(?:动画|审核|生成|实验|输出))?(?=$|[^A-Za-z0-9])/],
  ['visible-worker-trace', /Ralph\s*Loop|\b(?:subagent|worker|agent)\b|提示词/i],
  ['visible-debug-action-title', /\bexplain\s+[\u3400-\u9fffA-Za-z0-9]/i],
  ['visible-action-title-trace', /\b(?:stage\s+overview|stage\s+\d+\s+(?:transition\s+)?cursor|semantic\s+connector|scene\s+transition|final\s+caption)\b|转场游标|阶段\d+游标/i],
];
const LONG_CAPTION_LIMIT = 48;
const LONG_CANVAS_TEXT_LIMIT = 64;
const MAX_PROJECTS_PER_MANIM_TEMPLATE = 1;

const pageFiles = mapProjectPages();
const manimTargets = readManimTargets();

for (const projectId of projectIds) rows.push(auditProject(projectId));
auditSiteVisibleCopy();
auditDuplicateVisualSignatures(rows);
auditDuplicateManimSpecs();
auditScreenshotFreshness();

console.log(JSON.stringify({
  tool: 'audit-5g-quality',
  totals: {
    projects: projectIds.length,
    failures: failures.length,
    rows: rows.length,
  },
  rows,
  failures,
}, null, 2));

if (failures.length) process.exitCode = 1;

function auditProject(projectId) {
  const pageFile = pageFiles.get(projectId);
  const pageText = pageFile ? readText(path.join(projectDir, pageFile)) : '';
  const frontmatter = parseFrontmatter(pageText);
  const playbackScenes = Array.isArray(frontmatter.playbackScenes) ? frontmatter.playbackScenes : [];
  const lesson = readJson(path.join(widgetDir, `${projectId}-lesson-animation-001.json`));
  const edugame = readJson(path.join(widgetDir, `${projectId}-edugame-interactive-001.json`));
  const visibleTexts = [
    ...collectMdxVisibleText(pageText),
    ...collectVisibleStrings(playbackScenes),
    ...collectLessonVisibleText(lesson),
    ...collectEduGameWidgetVisibleText(edugame),
  ];
  const visibleHits = auditVisibleText(projectId, visibleTexts);
  const arrowIssues = auditArrowSemantics(projectId, lesson);
  const longTextIssues = auditLongAnimationText(projectId, lesson, playbackScenes);
  const focusIssues = auditFocusEffects(projectId, lesson);
  const duplicateGraphics = auditRepeatedGraphics(projectId, lesson);
  const manimSpecIssues = auditManimSpecFields(projectId, lesson);
  const edugameIssues = auditEduGameFeedback(projectId, edugame);
  const signature = lesson ? visualSignature(lesson) : '';
  if (signature) visualSignatures.set(projectId, signature);
  return {
    projectId,
    pageFile,
    visibleTextItems: visibleTexts.length,
    visibleHits,
    arrowIssues,
    longTextIssues,
    focusIssues,
    duplicateGraphics,
    manimSpecIssues,
    edugameIssues,
    visualSignatureHash: signature ? hashString(signature) : '',
  };
}

function auditVisibleText(scope, texts) {
  const hits = [];
  for (const text of texts) {
    const clean = normalizeText(text);
    if (!clean) continue;
    for (const [code, pattern] of [...VISIBLE_INTERNAL_PATTERNS, ...TEMPLATE_TONE_PATTERNS, ...LEARNER_VISIBLE_RESIDUE_PATTERNS]) {
      if (!pattern.test(clean)) continue;
      const hit = { code, sample: clean.slice(0, 140) };
      hits.push(hit);
      fail(scope, code, `visible copy contains ${code}: ${hit.sample}`);
    }
  }
  return summarizeCodes(hits);
}

function auditArrowSemantics(projectId, lesson) {
  const artifact = lesson?.props?.artifact;
  const elements = artifact?.scene?.content?.canvas?.elements ?? [];
  const cues = [
    ...(artifact?.timeline?.cues ?? []),
    ...(artifact?.scene?.timeline?.cues ?? []),
  ];
  const cueTargets = new Set(cues.flatMap((cue) => cue?.targets ?? []).filter(Boolean));
  const actionTargets = new Set([
    ...(artifact?.actions ?? []),
    ...(artifact?.scene?.actions ?? []),
  ].flatMap((action) => [action?.target, action?.elementId]).filter(Boolean));
  const issues = [];
  for (const line of elements.filter(isConnectorLine)) {
    const id = String(line.id ?? '');
    if (!id.startsWith(`${projectId}-`)) {
      issues.push({ code: 'arrow-id-prefix', id });
      fail(projectId, 'arrow-id-prefix', `connector line lacks project prefix: ${id || '(no id)'}`);
    }
    if (!hasArrowHead(line)) {
      issues.push({ code: 'arrow-missing-head', id });
      fail(projectId, 'arrow-missing-head', `connector line has no arrow marker: ${id || '(no id)'}`);
      continue;
    }
    const hasSemanticTarget = cueTargets.has(id) || actionTargets.has(id);
    const semanticKind = line.semanticKind ?? line.edgeKind ?? line.relationType ?? line.semantic ?? line.data?.semanticKind;
    const hasSemanticKind = ['process', 'dependency', 'data-flow', 'cause', 'feedback'].includes(String(semanticKind ?? ''));
    const hasSemanticLabel = Boolean(line.title || line.label || line.caption || line.source || line.from || line.to);
    if (!hasSemanticTarget && !hasSemanticLabel && !hasSemanticKind) {
      issues.push({ code: 'meaningless-arrow', id });
      fail(projectId, 'meaningless-arrow', `arrow has no cue/action target or semantic label: ${id || '(no id)'}`);
    }
  }
  return summarizeCodes(issues);
}

function auditLongAnimationText(projectId, lesson, playbackScenes) {
  const artifact = lesson?.props?.artifact;
  const elements = artifact?.scene?.content?.canvas?.elements ?? [];
  const issues = [];
  for (const element of elements.filter((item) => item?.type === 'text')) {
    const text = plainText(element.content ?? element.text ?? element.label ?? '');
    if (!text) continue;
    const budget = Number(element.textBudget);
    const budgetLimit = Number.isFinite(budget) ? Math.ceil(budget * 1.45) : LONG_CANVAS_TEXT_LIMIT;
    const widthRatio = estimateTextWidth(text, Number(element.fontSize ?? 14)) / Math.max(1, Number(element.width ?? 1) * Math.max(1, Number(element.maxLines ?? 1)));
    if (text.length > LONG_CANVAS_TEXT_LIMIT || text.length > budgetLimit || widthRatio > 1.28) {
      const item = { code: 'long-canvas-text', id: element.id, textLength: text.length, widthRatio: round(widthRatio), sample: text.slice(0, 80) };
      issues.push(item);
      fail(projectId, 'long-canvas-text', `${element.id ?? '(no id)'} packs too much text into the animation canvas: ${item.sample}`);
    }
  }
  for (const action of collectObjects(playbackScenes)) {
    if (!action || typeof action !== 'object') continue;
    const caption = normalizeText(action.displayText ?? action.caption ?? '');
    if (caption.length > LONG_CAPTION_LIMIT) {
      const item = { code: 'long-caption-text', id: action.id, textLength: caption.length, sample: caption.slice(0, 96) };
      issues.push(item);
      fail(projectId, 'long-caption-text', `${action.id ?? '(no id)'} caption/displayText is too long for playback: ${item.sample}`);
    }
  }
  return summarizeCodes(issues);
}

function auditFocusEffects(projectId, lesson) {
  const artifact = lesson?.props?.artifact;
  const cues = [
    ...(artifact?.timeline?.cues ?? []),
    ...(artifact?.scene?.timeline?.cues ?? []),
  ];
  const actions = [
    ...(artifact?.actions ?? []),
    ...(artifact?.scene?.actions ?? []),
  ];
  const focusCount = cues.filter((cue) => /spotlight|laser/i.test(String(cue.effect ?? cue.content ?? ''))).length
    + actions.filter((action) => /spotlight|laser/i.test(String(action.type ?? action.effect ?? action.content ?? ''))).length;
  if (focusCount < 4) {
    fail(projectId, 'spotlight-laser-missing', `lesson animation has only ${focusCount} spotlight/laser cues or actions`);
    return { 'spotlight-laser-missing': 1 };
  }
  return {};
}

function auditRepeatedGraphics(projectId, lesson) {
  const elements = lesson?.props?.artifact?.scene?.content?.canvas?.elements ?? [];
  const groups = new Map();
  for (const element of elements) {
    if (!['shape', 'icon', 'chart', 'table'].includes(String(element.type ?? ''))) continue;
    const signature = JSON.stringify({
      type: element.type,
      role: element.role ?? '',
      phase: element.phase ?? '',
      left: roundTo(Number(element.left ?? 0), 4),
      top: roundTo(Number(element.top ?? 0), 4),
      width: roundTo(Number(element.width ?? 0), 4),
      height: roundTo(Number(element.height ?? 0), 4),
      fill: element.fill ?? '',
      text: plainText(element.content ?? element.label ?? element.title ?? ''),
    });
    groups.set(signature, [...(groups.get(signature) ?? []), element.id ?? '(no id)']);
  }
  const issues = [];
  for (const ids of groups.values()) {
    if (ids.length <= 1) continue;
    const issue = { code: 'repeated-graphic', ids: ids.slice(0, 6) };
    issues.push(issue);
    fail(projectId, 'repeated-graphic', `same graphic is duplicated at the same position: ${issue.ids.join(', ')}`);
  }
  return summarizeCodes(issues);
}

function auditManimSpecFields(projectId, lesson) {
  const spec = lesson?.props?.artifact?.manimSpec;
  if (!spec) return {};
  const issues = [];
  for (const field of ['clipId', 'targetUnitId', 'visualMetaphor', 'sceneBeats']) {
    if (spec[field]) continue;
    issues.push({ code: 'manim-spec-field-missing', field });
    fail(projectId, 'manim-spec-field-missing', `manimSpec missing ${field}`);
  }
  return summarizeCodes(issues);
}

function auditEduGameFeedback(projectId, widget) {
  const issues = [];
  const manifestUrl = widget?.props?.manifestUrl ?? '';
  const indexUrl = widget?.props?.indexUrl ?? '';
  const manifest = manifestUrl ? readJson(path.join(publicDir, manifestUrl.replace(/^\//, ''))) : null;
  const indexText = indexUrl ? readText(path.join(publicDir, indexUrl.replace(/^\//, ''))) : '';
  const config = widget?.props?.gameConfig ?? manifest ?? {};
  const interaction = config?.interaction ?? manifest?.interaction ?? {};
  const ruleChecks = toList(interaction.ruleChecks ?? config?.ruleChecks ?? config?.mechanicRules ?? config?.inputModel?.mechanicRules ?? config?.gameExperience?.mechanicRules);
  const itemFeedback = toList(config?.levels).flatMap((level) => toList(level?.items).map((item) => item?.errorFeedback).filter(Boolean));
  const errorFeedback = toList(interaction.errorFeedback ?? config?.errorFeedback ?? itemFeedback);
  const replayPrompts = toList(interaction.replayPrompts ?? config?.replayPrompts ?? toList(config?.challengeLevels).map((level) => level?.goal ?? level?.constraint).filter(Boolean));
  const successCriteria = toList(config?.successCriteria ?? config?.pedagogy?.successCriteria ?? [config?.winCondition, config?.answerModel?.winCondition].filter(Boolean));
  checkMin(ruleChecks, 3, 'edugame-rule-checks', 'interactive ruleChecks');
  checkMin(errorFeedback, 2, 'edugame-error-feedback', 'interactive errorFeedback');
  checkMin(replayPrompts, 2, 'edugame-replay-prompts', 'interactive replayPrompts');
  checkMin(successCriteria, 2, 'edugame-success-criteria', 'interactive successCriteria');
  if (!normalizeText(config?.feedbackHint ?? config?.ui?.feedbackHint ?? config?.pedagogy?.feedbackHint)) add('edugame-feedback-hint', 'interactive feedbackHint is missing');
  if (!normalizeText(interaction.actionLabel ?? config?.actionLabel ?? config?.ui?.actionLabel)) add('edugame-action-label', 'interactive actionLabel is missing');
  const isPixiGameConfig = widget?.widget === 'edugame-pixi'
    && config?.schema === 'dgbook.edugame-pixi/v1'
    && normalizeText(config?.game_type)
    && toList(config?.levels).length > 0;
  if (!isPixiGameConfig && (!/<canvas\b/i.test(indexText) || !/\bEngine\b|\bEDUGAME_CONFIG\b/.test(indexText))) {
    add('edugame-not-real-export', `EduGame index does not look like a real web export: ${indexUrl || '(missing)'}`);
  }
  if (isPixiGameConfig) return summarizeCodes(issues);
  if (/class=["']lab["']|目标\s|参数\s|判定\s|提示\s|复盘\s/.test(indexText) && !/\bEDUGAME_CONFIG\b/.test(indexText)) {
    add('edugame-placeholder-html', `EduGame index looks like placeholder HTML: ${indexUrl}`);
  }
  return summarizeCodes(issues);

  function checkMin(values, minCount, code, label) {
    if (values.length >= minCount) return;
    add(code, `${label} count is ${values.length}, expected at least ${minCount}`);
  }
  function add(code, message) {
    issues.push({ code, message });
    fail(projectId, code, message);
  }
}

function auditSiteVisibleCopy() {
  const siteFiles = listFiles(path.join(root, 'site', 'src'), new Set(['.astro']));
  for (const file of siteFiles) {
    const text = readText(file);
    const visible = collectAstroVisibleText(text);
    auditVisibleText(relative(file), visible);
  }
}

function auditDuplicateVisualSignatures(projectRows) {
  const groups = new Map();
  for (const row of projectRows) {
    const signature = visualSignatures.get(row.projectId);
    if (!signature) continue;
    if (!groups.has(signature)) groups.set(signature, []);
    groups.get(signature).push(row.projectId);
  }
  for (const projects of groups.values()) {
    if (projects.length <= 2) continue;
    fail('widgets', 'duplicate-animation-geometry', `animation visual geometry is reused across ${projects.length} projects: ${projects.join(', ')}`);
  }
}

function auditDuplicateManimSpecs() {
  const byTemplate = new Map();
  for (const target of manimTargets) {
    if (!byTemplate.has(target.template)) byTemplate.set(target.template, []);
    byTemplate.get(target.template).push(target.project);
  }
  for (const [template, projects] of byTemplate) {
    if (projects.length <= MAX_PROJECTS_PER_MANIM_TEMPLATE) continue;
    fail('manim', 'duplicate-manim-spec', `Manim template "${template}" is reused by ${projects.length} projects: ${projects.join(', ')}`);
  }
}

function auditScreenshotFreshness() {
  const report = readJson(screenshotReportPath);
  if (!report) {
    fail('screenshots', 'screenshot-report-missing', 'animation screenshot report is missing or unreadable');
    return;
  }
  const reportMtime = mtimeMs(screenshotReportPath);
  const visualSources = [
    ...listFiles(projectDir, new Set(['.mdx'])),
    ...listFiles(widgetDir, new Set(['.json'])),
    ...listFiles(path.join(root, 'site', 'src'), new Set(['.astro', '.tsx', '.ts', '.css'])),
  ];
  const newest = visualSources.map((file) => ({ file, mtime: mtimeMs(file) })).sort((a, b) => b.mtime - a.mtime)[0];
  if (newest && newest.mtime > reportMtime + 1000) {
    fail('screenshots', 'screenshot-report-stale', `screenshot report is older than ${relative(newest.file)}`);
  }
  const covered = new Set((report.results ?? []).map((item) => item?.projectId).filter(Boolean));
  const missing = projectIds.filter((projectId) => !covered.has(projectId));
  if (missing.length) fail('screenshots', 'screenshot-report-coverage', `screenshot report missing projects: ${missing.join(', ')}`);
  const blocking = Number(report?.totals?.blockingIssues ?? 0);
  if (blocking > 0) fail('screenshots', 'screenshot-report-blocking', `screenshot report has ${blocking} blocking issues`);
}

function collectMdxVisibleText(text) {
  const body = stripFrontmatter(text)
    .replace(/\b(?:src|poster|href)=["'][^"']*["']/g, '')
    .replace(/\b(?:src|poster|href)=\{["'][^"']*["']\}/g, '');
  return [
    stripTags(body),
    ...extractStringLiterals(body),
  ];
}

function collectAstroVisibleText(text) {
  const body = stripAstroFrontmatter(text)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
  const textNodes = [...body.matchAll(/>([^<>{}]*[\u3400-\u9fff][^<>{}]*)</g)]
    .map((match) => match[1]);
  return [
    ...textNodes,
    ...extractStringLiterals(body).filter((item) => !looksLikeSourceFragment(item)),
  ];
}

function collectLessonVisibleText(widget) {
  const artifact = widget?.props?.artifact ?? {};
  const elements = artifact?.scene?.content?.canvas?.elements ?? [];
  return [
    widget?.props?.title,
    artifact?.scene?.title,
    artifact?.scene?.description,
    ...((artifact?.pages ?? []).flatMap((page) => [page.title, page.summary, page.phaseLabel])),
    ...elements.flatMap((item) => [item.title, item.label, item.alt, item.caption, plainText(item.content ?? item.text)]),
    ...collectVisibleStrings([artifact?.actions, artifact?.scene?.actions, artifact?.timeline?.cues, artifact?.scene?.timeline?.cues]),
  ];
}

function collectEduGameWidgetVisibleText(widget) {
  const manifestUrl = widget?.props?.manifestUrl ?? '';
  const manifest = manifestUrl ? readJson(path.join(publicDir, manifestUrl.replace(/^\//, ''))) : null;
  return [
    widget?.props?.title,
    manifest?.title,
    manifest?.learningGoal,
    manifest?.feedbackHint,
    manifest?.replayValue,
    ...toList(manifest?.successCriteria),
    ...toList(manifest?.ruleChecks),
    ...toList(manifest?.errorFeedback),
    ...toList(manifest?.replayPrompts),
    ...collectVisibleStrings(manifest?.interaction),
  ];
}

function collectVisibleStrings(value) {
  const keys = new Set(['title', 'text', 'spokenText', 'caption', 'displayText', 'content', 'description', 'label', 'summary', 'prompt', 'feedbackHint', 'replayValue', 'actionLabel']);
  const out = [];
  visit(value);
  return out;

  function visit(node, key = '') {
    if (node == null) return;
    if (typeof node === 'string') {
      if (!key || keys.has(key)) out.push(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item, key);
      return;
    }
    if (typeof node !== 'object') return;
    for (const [childKey, child] of Object.entries(node)) {
      if (typeof child === 'string' && keys.has(childKey)) out.push(child);
      else if (typeof child === 'object') visit(child, childKey);
    }
  }
}

function visualSignature(widget) {
  const elements = widget?.props?.artifact?.scene?.content?.canvas?.elements ?? [];
  const records = elements.map((item) => ({
    type: item.type ?? '',
    role: item.role ?? '',
    layer: item.layer ?? '',
    phase: Number(item.phase ?? 0),
    left: roundTo(Number(item.left ?? 0), 24),
    top: roundTo(Number(item.top ?? 0), 24),
    width: roundTo(Number(item.width ?? 0), 24),
    height: roundTo(Number(item.height ?? 0), 24),
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return JSON.stringify(records);
}

function mapProjectPages() {
  const result = new Map();
  for (const file of readdirSync(projectDir).filter((item) => item.endsWith('.mdx'))) {
    const projectId = file.match(/^(P\d{2})-/)?.[1];
    if (projectId) result.set(projectId, file);
  }
  return result;
}

function readManimTargets() {
  const source = readText(path.join(root, 'scripts', 'manim-scene-sources.mjs'));
  return [...source.matchAll(/\{\s*project:\s*'(?<project>P\d{2})',\s*template:\s*'(?<template>[^']+)'/g)]
    .map((match) => ({
      project: match.groups.project,
      template: match.groups.template,
      hasProjectScene: source.includes(`'${match.groups.project}:${match.groups.template}'`),
    }));
}

function parseFrontmatter(text) {
  const match = String(text ?? '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!field) continue;
    const [, key, rawValue] = field;
    const value = rawValue.trim();
    if (!value) continue;
    if ((value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']'))) {
      try {
        data[key] = JSON.parse(value);
        continue;
      } catch {
        data[key] = value;
        continue;
      }
    }
    data[key] = value.replace(/^["']|["']$/g, '');
  }
  return data;
}

function listFiles(dir, exts) {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['dist', '.astro', 'node_modules'].includes(entry.name)) files.push(...listFiles(full, exts));
    } else if (exts.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

function collectObjects(value) {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(collectObjects);
  return [value, ...Object.values(value).flatMap(collectObjects)];
}

function isConnectorLine(element) {
  if (element?.type !== 'line') return false;
  const id = String(element.id ?? '');
  return !/ladder-|lane-|grid|axis|tick/i.test(id);
}

function hasArrowHead(element) {
  const points = Array.isArray(element.points) ? element.points.join(' ') : '';
  return /arrow|triangle|marker/i.test(`${points} ${element.markerEnd ?? ''} ${element.endMarker ?? ''}`);
}

function plainText(value) {
  return stripTags(String(value ?? '')).replace(/&[^;]+;/g, '');
}

function stripTags(text) {
  return String(text ?? '').replace(/<[^>]+>/g, ' ');
}

function stripFrontmatter(text) {
  return String(text ?? '').replace(/^---\r?\n[\s\S]*?\r?\n---/, '');
}

function stripAstroFrontmatter(text) {
  return String(text ?? '').replace(/^---\r?\n[\s\S]*?\r?\n---/, '');
}

function extractStringLiterals(text) {
  const literals = [];
  const withoutUrls = String(text ?? '')
    .replace(/https?:\/\/[^\s"'})]+/g, '')
    .replace(/\/(?:media|interactives)\/[^\s"'})]+/g, '');
  for (const match of withoutUrls.matchAll(/["']([^"']*[\u3400-\u9fff][^"']*)["']/g)) {
    literals.push(match[1]);
  }
  return literals;
}

function normalizeText(value) {
  return plainText(value).replace(/\s+/g, ' ').trim();
}

function looksLikeSourceFragment(text) {
  return /(?:\b(?:import|export|const|let|return|className|client:load|data-widget-id|playbackScenes)\b|=>|\?\.)/.test(String(text ?? ''));
}

function estimateTextWidth(text, fontSize) {
  let units = 0;
  for (const char of String(text ?? '')) {
    if (/[\u3400-\u9fff\uf900-\ufaff]/.test(char)) units += 1;
    else if (/[A-Z0-9]/.test(char)) units += 0.64;
    else if (/\s/.test(char)) units += 0.35;
    else units += 0.55;
  }
  return units * Math.max(10, fontSize);
}

function toList(value) {
  if (Array.isArray(value)) return value.filter((item) => item != null).map(String).filter(Boolean);
  if (value == null || value === '') return [];
  return [String(value)];
}

function summarizeCodes(items) {
  const counts = {};
  for (const item of items) counts[item.code] = (counts[item.code] ?? 0) + 1;
  return counts;
}

function readJson(file) {
  try {
    const text = readFileSync(file, 'utf-8');
    return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
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

function mtimeMs(file) {
  try {
    return statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function roundTo(value, step) {
  return Math.round(value / step) * step;
}

function hashString(value) {
  let hash = 5381;
  for (const char of String(value ?? '')) hash = ((hash << 5) + hash + char.charCodeAt(0)) >>> 0;
  return hash.toString(16).padStart(8, '0');
}

function relative(file) {
  return path.relative(root, file).replaceAll(path.sep, '/');
}

function fail(scope, code, message) {
  failures.push({ scope, code, message });
}
