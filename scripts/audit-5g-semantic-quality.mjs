#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { textbookOutput } from './textbook-paths.mjs';

const root = process.cwd();
const targets = [
  textbookOutput('projects'),
  textbookOutput('widgets'),
  path.join(root, 'site', 'src', 'components', 'WidgetSlot.tsx'),
  path.join(root, 'site', 'src', 'pages', 'projects', '[id].astro'),
  path.join(root, 'packages', 'widgets', 'src', 'lesson-animation', 'LessonAnimation.tsx'),
];

const VISIBLE_INTERNAL_PATTERNS = [
  ['manim-label', /\bManim\b|Manim\s*知识动画/i],
  ['generated-label', /Generated Web interactive/i],
  ['openmaic-visible', /\bOpenMAIC\b|OpenMAIC\s*式/i],
  ['widget-implementation-label', /\b(?:lesson-animation|mediaTracks?|playbackScenes|voiceProfileId|audioUrl|stageId)\b/i],
  ['generator-trace-label', /\b(?:Generated|docx-importer|placeholder|TODO|FIXME)\b|占位|待补|草稿/i],
];

const VISIBLE_EXPERIMENT_PATTERNS = [
  ['interactive-experiment', /互动实验|进入互动实验|实验入口/],
  ['task-import-residue', /任务导入|任务要求|任务描述|任务书|实训任务|提交要求|评分标准/],
  ['student-submission-copy', /提交|上传|得分|评分|作业|闯关/],
  ['generic-learning-stage-copy', /播放知识动画|可视化演示|教学舞台|知识点闭环|先用\s*1\s*分钟/],
  ['template-chain-copy', /Manim\s*知识动画|知识链|流程展示|步骤展示|任务流程|操作流程|配套约束|照片、编号、坐标|照片编号坐标/],
];

const rows = [];
const failures = [];

for (const file of collectFiles(targets)) auditFile(file);

const report = {
  tool: 'audit-5g-semantic-quality',
  totals: {
    files: rows.length,
    visibleTextItems: rows.reduce((sum, row) => sum + row.visibleTextItems, 0),
    failures: failures.length,
  },
  rows,
  failures,
};

console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;

function collectFiles(items) {
  const files = [];
  for (const item of items) {
    if (!exists(item)) continue;
    if (isFile(item)) {
      files.push(item);
      continue;
    }
    for (const entry of readdirSync(item, { withFileTypes: true })) {
      const full = path.join(item, entry.name);
      if (entry.isDirectory()) continue;
      if (/\.(mdx|json|tsx|astro)$/.test(entry.name)) files.push(full);
    }
  }
  return files;
}

function auditFile(file) {
  const text = readFileSync(file, 'utf-8');
  const visibleTexts = collectVisibleText(file, text).map(normalizeText).filter(Boolean);
  const hits = [];
  for (const visibleText of visibleTexts) {
    for (const [code, pattern] of [...VISIBLE_INTERNAL_PATTERNS, ...VISIBLE_EXPERIMENT_PATTERNS]) {
      const match = visibleText.match(pattern);
      if (!match) continue;
      const hit = { code, sample: visibleText.slice(0, 160) };
      hits.push(hit);
      failures.push({
        file: rel(file),
        code,
        sample: hit.sample,
        message: `learner-visible copy contains ${code}`,
      });
    }
  }
  rows.push({
    file: rel(file),
    visibleTextItems: visibleTexts.length,
    hits: summarizeCodes(hits),
  });
}

function collectVisibleText(file, text) {
  if (file.endsWith('.json')) return collectJsonVisibleText(text);
  if (file.endsWith('.mdx')) return collectMdxVisibleText(text);
  if (file.endsWith('.astro')) return collectAstroVisibleText(text);
  if (/\.(tsx|ts|jsx|js|mjs)$/.test(file)) return collectCodeVisibleText(text);
  return [text];
}

function collectJsonVisibleText(text) {
  const data = readJsonText(text);
  if (!data) return [];
  const keys = new Set([
    'title',
    'label',
    'text',
    'caption',
    'displayText',
    'spokenText',
    'summary',
    'alt',
    'content',
    'learningGoal',
    'feedbackHint',
    'actionLabel',
    'replayValue',
  ]);
  const out = [];
  visit(data);
  return out;

  function visit(value, key = '') {
    if (value == null) return;
    if (typeof value === 'string') {
      if (!key || keys.has(key)) out.push(stripTags(value));
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, key);
      return;
    }
    if (typeof value !== 'object') return;
    for (const [childKey, child] of Object.entries(value)) {
      if (typeof child === 'string' && keys.has(childKey)) out.push(stripTags(child));
      else if (typeof child === 'object') visit(child, childKey);
    }
  }
}

function collectMdxVisibleText(text) {
  const body = stripFrontmatter(text)
    .replace(/\b(?:src|poster|href|id|data-[\w-]+)=["'][^"']*["']/g, '')
    .replace(/\b(?:src|poster|href|id|data-[\w-]+)=\{["'][^"']*["']\}/g, '');
  return [
    stripTags(body),
    ...extractStringLiterals(body).filter((item) => !looksLikeSourceFragment(item)),
  ];
}

function collectAstroVisibleText(text) {
  const body = stripFrontmatter(text)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
  return [
    ...[...body.matchAll(/>([^<>{}]*[\u3400-\u9fff][^<>{}]*)</g)].map((match) => match[1]),
    ...extractStringLiterals(body).filter((item) => !looksLikeSourceFragment(item)),
  ];
}

function collectCodeVisibleText(text) {
  return extractStringLiterals(text).filter((item) => !looksLikeSourceFragment(item));
}

function readJsonText(text) {
  try {
    const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    return JSON.parse(source);
  } catch {
    return null;
  }
}

function extractStringLiterals(text) {
  const withoutUrls = String(text ?? '')
    .replace(/https?:\/\/[^\s"'})]+/g, '')
    .replace(/\/(?:media|interactives)\/[^\s"'})]+/g, '');
  return [...withoutUrls.matchAll(/["']([^"']*[\u3400-\u9fffA-Za-z][^"']*)["']/g)].map((match) => match[1]);
}

function looksLikeSourceFragment(text) {
  return /(?:\b(?:import|export|const|let|return|className|client:load|data-widget-id|playbackScenes|lesson-animation|mediaTracks)\b|=>|\?\.)/.test(String(text ?? ''));
}

function stripFrontmatter(text) {
  return String(text ?? '').replace(/^---\r?\n[\s\S]*?\r?\n---/, '');
}

function stripTags(text) {
  return String(text ?? '').replace(/<[^>]+>/g, ' ');
}

function normalizeText(value) {
  return stripTags(value).replace(/&[^;]+;/g, '').replace(/\s+/g, ' ').trim();
}

function summarizeCodes(items) {
  const counts = {};
  for (const item of items) counts[item.code] = (counts[item.code] ?? 0) + 1;
  return counts;
}

function exists(file) {
  return existsSync(file);
}

function isFile(file) {
  return statSync(file).isFile();
}

function rel(file) {
  return path.relative(root, file).replaceAll(path.sep, '/');
}
