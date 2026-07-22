#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { textbookOutputRelative } from './textbook-paths.mjs';

const root = process.cwd();
const learnerProjectRoot = `${textbookOutputRelative('projects')}/`;
const learnerWidgetRoot = `${textbookOutputRelative('widgets')}/`;
const localReferenceProject = ['Open', 'MAIC'].join('');
const badPatterns = [
  /\uFFFD/,
  /\u951b/,
  /\u7ed7/,
  /\u5a11/,
  /\u4fd9/,
  /\u93c1/,
  /\u9366/,
  /\u7f03\u6220/,
  /\u6d7c\u6a3a/,
  /\u7039\u3085/,
  /\u941c/,
  /\u6dc7\u2103/,
  /\u93c5/,
  /\u9350/,
  /\u20ac\?/,
];
const contentResiduePatterns = [
  ['task-import-residue', /任务导入|任务要求|任务描述|任务书|实训任务|提交要求|评分标准/],
  ['visible-experiment-term', /互动实验|进入互动实验|实验入口|完成实验/],
  ['visible-internal-tool-term', /\b(?:Manim|OpenMAIC|TeachingStage|renderer|playbackScenes)\b|Generated Web interactive/],
  ['visible-generator-residue', /\b(?:placeholder|TODO|FIXME|docx-importer)\b|占位|待补|草稿/i],
  ['visible-production-trace', /可视化演示|配套约束|实验输出|运行输出|技术实现|实现细节|生成痕迹|调试输出|控制台输出|截图基线|自动审核|动画审核|知识链生成|已按知识链生成/],
  ['visible-template-chain-copy', /Manim\s*知识动画|知识链|知识点闭环|流程展示|步骤展示|任务流程|操作流程|照片、编号、坐标|照片编号坐标/],
  ['visible-ai-term', /(?:^|[^A-Za-z0-9])AI(?:\s*(?:动画|审核|生成|实验|输出))?(?=$|[^A-Za-z0-9])/],
  ['visible-worker-trace', /Ralph\s*Loop|\b(?:subagent|worker|agent)\b|提示词/i],
  ['visible-debug-action-title', /\bexplain\s+[\u3400-\u9fffA-Za-z0-9]/i],
  ['visible-action-title-trace', /\b(?:stage\s+overview|stage\s+\d+\s+(?:transition\s+)?cursor|semantic\s+connector|scene\s+transition|final\s+caption)\b|转场游标|阶段\d+游标/i],
];
const sourceExts = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.py', '.md', '.mdx', '.json']);
const ignoredSegments = new Set([
  'node_modules',
  '.git',
  '.astro',
  '.cache',
  '.next',
  'dist',
  localReferenceProject,
  '__pycache__',
]);
const ignoredRoots = [
  path.join(root, 'archive'),
  path.join(root, 'artifacts'),
  path.join(root, '.codex'),
  path.join(root, '.codex-runtime'),
  path.join(root, '.codegraph'),
  path.join(root, '.playwright-cli'),
  path.join(root, '.playwright-mcp'),
  path.join(root, '.pnpm-store'),
  path.join(root, '.superpowers'),
  path.join(root, '.worktrees'),
  path.join(root, 'research', 'vendor'),
  path.join(root, 'site', 'dist'),
  path.join(root, 'site', 'public', 'media'),
  path.join(root, 'output'),
  path.join(root, 'runtime'),
];

const failures = [];
await scan(root);

if (failures.length) {
  console.log(JSON.stringify({
    tool: 'check-text-quality',
    totals: { failures: failures.length },
    failures: failures.map((item) => ({ ...item, file: path.relative(root, item.file).replaceAll(path.sep, '/') })),
  }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ tool: 'check-text-quality', totals: { failures: 0 }, failures: [] }, null, 2));
}

async function scan(dir) {
  if (ignoredRoots.some((ignored) => dir === ignored || dir.startsWith(`${ignored}${path.sep}`))) return;
  const rel = path.relative(root, dir);
  if (rel.split(path.sep).some(isIgnoredSegment)) return;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await scan(full);
    else if (sourceExts.has(path.extname(entry.name))) await check(full);
  }
}

function isIgnoredSegment(segment) {
  return ignoredSegments.has(segment)
    || segment.startsWith('.next-')
    || segment.startsWith('.next.');
}

async function check(file) {
  const text = await readFile(file, 'utf-8');
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? '';
    if (badPatterns.some((pattern) => pattern.test(line))) {
      failures.push({ file, line: index + 1, code: 'suspicious-encoding', sample: JSON.stringify(line.trim().slice(0, 120)) });
    }
    if (isLearnerContentFile(file)) {
      for (const [code, pattern] of contentResiduePatterns) {
        if (!isLikelyVisibleLine(line)) continue;
        if (pattern.test(line)) failures.push({ file, line: index + 1, code, sample: JSON.stringify(line.trim().slice(0, 120)) });
      }
    }
  }
}

function isLearnerContentFile(file) {
  const rel = path.relative(root, file).replaceAll(path.sep, '/');
  return rel.startsWith(learnerProjectRoot)
    || rel.startsWith(learnerWidgetRoot)
    || rel.startsWith('site/src/');
}

function isLikelyVisibleLine(line) {
  const text = String(line ?? '').trim();
  if (!text) return false;
  if (/^(?:import|export|const|let|return|if|else|case|type|interface|function)\b/.test(text)) return false;
  if (/^\s*["']?(?:id|widget|widgets|project|status|history|by|at|kind|clipId|manifestUrl|posterUrl|videoUrl|indexUrl|audioUrl|mediaTracks|manimSpec)["']?\s*[:=]/.test(text)) return false;
  const visibleTermPattern = /[\u3400-\u9fff]|\b(?:Manim|OpenMAIC)\b|(?:^|[^A-Za-z0-9])AI(?=$|[^A-Za-z0-9])/;
  const hasVisibleNodeText = />[^<]*(?:[\u3400-\u9fff]|\b(?:Manim|OpenMAIC)\b|(?:^|[^A-Za-z0-9])AI(?=$|[^A-Za-z0-9]))[^<]*</.test(text);
  const hasVisibleAttribute = /\b(?:title|caption|alt|aria-label|label)=["'][^"']*(?:[\u3400-\u9fff]|\b(?:Manim|OpenMAIC)\b|(?:^|[^A-Za-z0-9])AI(?=$|[^A-Za-z0-9]))[^"']*["']/.test(text);
  if (/(?:src|poster|href|class|data-[\w-]+)=["']/.test(text) && !hasVisibleNodeText && !hasVisibleAttribute) return false;
  if (/\/(?:media|interactives)\/|P\d{2}-(?:lesson-animation|manim)-/.test(text)) return false;
  if (/<(?:video|img|WidgetSlot)\b/i.test(text) && !hasVisibleAttribute) return false;
  return visibleTermPattern.test(text);
}
