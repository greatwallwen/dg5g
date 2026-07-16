#!/usr/bin/env node
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { textbookOutput, textbookOutputRelative } from './textbook-paths.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_WIDGETS_DIR = textbookOutput('widgets');
const SAMPLE_LIMIT_PER_SLIDE = 24;
const EPSILON = 0.01;
const KEY_TEXT_ROLES = new Set(['title', 'caption', 'metric', 'diagram', 'model', 'annotation']);
const DOMAIN_SHORT_LABELS = new Set(['指标', '节点', '证据', '流程', '定位', '复测', '采集']);
const SHELL_EXACT_TEXT = new Set([
  'title',
  'subtitle',
  'caption',
  'label',
  'step',
  'metric',
  'todo',
  'tbd',
  '标题',
  '副标题',
  '说明',
  '文本',
  '内容',
  '节点',
  '模块',
  '步骤',
  '指标',
  '占位',
  '待填写',
]);
const SHELL_PATTERNS = [
  /\blorem ipsum\b/i,
  /\bplaceholder\b/i,
  /\btemplate\b/i,
  /\bexample\s+(title|text|caption|label)\b/i,
  /{{[^}]+}}/,
  /\bTODO\b/i,
  /\bTBD\b/i,
  /占位/,
  /待填写/,
  /模板/,
];

function parseArgs(argv) {
  const args = {
    fix: false,
    widgetsDir: DEFAULT_WIDGETS_DIR,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--fix') {
      args.fix = true;
    } else if (arg === '--widgets-dir') {
      const value = argv[index + 1];
      if (!value) throw new Error('--widgets-dir requires a path');
      args.widgetsDir = path.resolve(process.cwd(), value);
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function usage() {
  return [
    `Usage: node scripts/audit-animation-layout.mjs [--fix] [--widgets-dir ${textbookOutputRelative('widgets')}]`,
    '',
    'Scans animation-slide widget JSON for bounds, overlaps, dense key text,',
    'and template-shell content. Without --fix it never writes files.',
  ].join('\n');
}

function relativeToRoot(filePath) {
  return path.relative(ROOT_DIR, filePath).replaceAll(path.sep, '/');
}

function stripJsonBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asNumber(value, fallback = undefined) {
  return Number.isFinite(value) ? value : fallback;
}

function collectAnimationSlides(node, nodePath = [], slides = []) {
  if (!isObject(node) && !Array.isArray(node)) return slides;
  if (isObject(node) && node.type === 'animation-slide') {
    slides.push({ slide: node, path: nodePath.join('.') || '$' });
  }

  if (Array.isArray(node)) {
    node.forEach((child, index) => collectAnimationSlides(child, [...nodePath, String(index)], slides));
  } else {
    for (const [key, value] of Object.entries(node)) {
      if (isObject(value) || Array.isArray(value)) collectAnimationSlides(value, [...nodePath, key], slides);
    }
  }

  return slides;
}

function getCanvas(slide) {
  const canvas =
    slide?.scene?.content?.canvas ??
    slide?.scene?.canvas ??
    slide?.content?.canvas ??
    slide?.canvas;

  if (!isObject(canvas) || !Array.isArray(canvas.elements)) return null;

  return {
    canvas,
    elements: canvas.elements,
    width: asNumber(canvas.width, 1000),
    height: asNumber(canvas.height, 562),
  };
}

function isHiddenElement(element) {
  return (
    element.hidden === true ||
    element.visible === false ||
    element.display === 'none' ||
    element.opacity === 0
  );
}

function rectOf(element) {
  const left = Number(element.left);
  const top = Number(element.top);
  const width = Number(element.width);
  const height = Number(element.height);
  if (![left, top, width, height].every(Number.isFinite)) return null;
  if (width <= 0 || height <= 0) return null;
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}

function roundedRect(rect) {
  return {
    left: round(rect.left),
    top: round(rect.top),
    width: round(rect.width),
    height: round(rect.height),
    right: round(rect.right),
    bottom: round(rect.bottom),
  };
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function shiftedRect(rect, dx, dy) {
  return {
    left: rect.left + dx,
    top: rect.top + dy,
    width: rect.width,
    height: rect.height,
    right: rect.right + dx,
    bottom: rect.bottom + dy,
  };
}

function intersection(a, b) {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  if (right <= left + EPSILON || bottom <= top + EPSILON) return null;
  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
    right,
    bottom,
    area: (right - left) * (bottom - top),
  };
}

function rectArea(rect) {
  return rect.width * rect.height;
}

function baseElementId(id) {
  return String(id ?? '')
    .replace(/-(text|label|caption)$/i, '')
    .replace(/-text-\d+$/i, '');
}

function isDecorativeElement(element) {
  return element.role === 'decor' || element.role === 'background' || element.type === 'line';
}

function isIntentionalPair(first, second, firstRect, secondRect) {
  if (isDecorativeElement(first) || isDecorativeElement(second)) return true;
  if (baseElementId(first.id) === baseElementId(second.id)) return true;

  const textElement = first.type === 'text' ? first : second.type === 'text' ? second : null;
  if (textElement) {
    const textRect = first.type === 'text' ? firstRect : secondRect;
    const otherRect = first.type === 'text' ? secondRect : firstRect;
    const contained =
      textRect.left >= otherRect.left - EPSILON &&
      textRect.top >= otherRect.top - EPSILON &&
      textRect.right <= otherRect.right + EPSILON &&
      textRect.bottom <= otherRect.bottom + EPSILON;
    if (contained) return true;
  }

  if (isContainerLayerPair(first, second, firstRect, secondRect)) return true;
  if (isParticleLayerPair(first, second)) return true;

  return false;
}

function containsRect(container, child) {
  return (
    child.left >= container.left - EPSILON &&
    child.top >= container.top - EPSILON &&
    child.right <= container.right + EPSILON &&
    child.bottom <= container.bottom + EPSILON
  );
}

function isContainerLayerPair(first, second, firstRect, secondRect) {
  if (first.type !== 'shape' && second.type !== 'shape') return false;
  const firstContainsSecond = first.type === 'shape' && containsRect(firstRect, secondRect) && rectArea(firstRect) > rectArea(secondRect) * 1.8;
  const secondContainsFirst = second.type === 'shape' && containsRect(secondRect, firstRect) && rectArea(secondRect) > rectArea(firstRect) * 1.8;
  if (!firstContainsSecond && !secondContainsFirst) return false;
  const container = firstContainsSecond ? first : second;
  return /field|building|dashboard|lane|core|band|panel|shell|card/i.test(String(container.id ?? '')) || container.role === 'model' || container.role === 'diagram';
}

function isParticleElement(element) {
  return /packet|pulse|spark|dot|room-\d|marker/i.test(String(element.id ?? ''));
}

function isParticleLayerPair(first, second) {
  if (!isParticleElement(first) && !isParticleElement(second)) return false;
  if (first.type === 'text' || second.type === 'text') return false;
  return true;
}

function elementRecord(element, rect) {
  return {
    id: element.id ?? '(no id)',
    type: element.type ?? '(no type)',
    role: element.role ?? null,
    rect,
  };
}

function isBeatChipElement(element) {
  return /(^|-)beat-chip-\d+(?:-text)?$/i.test(String(element.id ?? ''));
}

function isBeatChipText(element) {
  return /(^|-)beat-chip-\d+-text$/i.test(String(element.id ?? ''));
}

function isMetricElement(element) {
  return /(^|-)metric-(?:\d+|chart)(?:-text)?$/i.test(String(element.id ?? ''));
}

function isBeatMetricPair(first, second) {
  return (isBeatChipElement(first) && isMetricElement(second)) || (isBeatChipElement(second) && isMetricElement(first));
}

function decodeHtml(text) {
  return String(text)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6])>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/\s+/g, ' ')
    .trim();
}

function plainText(element) {
  return decodeHtml(element.content ?? element.text ?? element.label ?? '');
}

function fontSizeOf(element) {
  if (Number.isFinite(element.fontSize)) return element.fontSize;
  const match = String(element.content ?? '').match(/font-size\s*:\s*([0-9.]+)px/i);
  return match ? Number(match[1]) : 12;
}

function estimateTextWidth(text, fontSize) {
  let units = 0;
  for (const char of text) {
    if (/\s/.test(char)) units += 0.35;
    else if (/[\u3400-\u9fff\uf900-\ufaff]/.test(char)) units += 1;
    else if (/[A-Z0-9]/.test(char)) units += 0.62;
    else if (/[.,;:|/\\()[\]{}'"`~-]/.test(char)) units += 0.35;
    else units += 0.55;
  }
  return units * fontSize;
}

function isKeyText(element) {
  if (element.type !== 'text') return false;
  if (KEY_TEXT_ROLES.has(element.role)) return true;
  return /title|caption|metric|beat-chip|msg|node|label/i.test(String(element.id ?? ''));
}

function shellReason(text) {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return null;
  if (DOMAIN_SHORT_LABELS.has(text.trim())) return null;
  if (SHELL_EXACT_TEXT.has(normalized) || SHELL_EXACT_TEXT.has(text.trim())) return 'generic-placeholder-text';
  for (const pattern of SHELL_PATTERNS) {
    if (pattern.test(text)) return `matches:${pattern.source}`;
  }
  return null;
}

function pushDiagnostic(state, diagnostic) {
  state.total += 1;
  state.byCode[diagnostic.code] = (state.byCode[diagnostic.code] ?? 0) + 1;
  state.byLevel[diagnostic.level] = (state.byLevel[diagnostic.level] ?? 0) + 1;
  if (state.samples.length < SAMPLE_LIMIT_PER_SLIDE) state.samples.push(diagnostic);
}

function auditSlide(slide, slidePath, fileName) {
  const canvasInfo = getCanvas(slide);
  const state = {
    total: 0,
    byCode: {},
    byLevel: {},
    samples: [],
  };

  if (!canvasInfo) {
    pushDiagnostic(state, {
      code: 'missing-canvas',
      level: 'error',
      message: 'animation-slide has no scene.content.canvas.elements array',
      file: fileName,
      slidePath,
    });
    return {
      slidePath,
      canvas: null,
      elementCount: 0,
      diagnosticCounts: state.byCode,
      levelCounts: state.byLevel,
      diagnosticTotal: state.total,
      diagnostics: state.samples,
    };
  }

  const { elements, width, height } = canvasInfo;
  const visibleElements = elements
    .map((element) => ({ element, rect: rectOf(element) }))
    .filter(({ element, rect }) => rect && !isHiddenElement(element));

  for (const { element, rect } of visibleElements) {
    const overflow = {
      left: Math.max(0, -rect.left),
      top: Math.max(0, -rect.top),
      right: Math.max(0, rect.right - width),
      bottom: Math.max(0, rect.bottom - height),
    };
    if (Object.values(overflow).some((value) => value > EPSILON)) {
      pushDiagnostic(state, {
        code: 'out-of-bounds',
        level: 'error',
        message: `${element.id ?? '(no id)'} exceeds canvas bounds`,
        element: elementRecord(element, roundedRect(rect)),
        canvas: { width, height },
        overflow,
      });
    }
  }

  for (let firstIndex = 0; firstIndex < visibleElements.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < visibleElements.length; secondIndex += 1) {
      const first = visibleElements[firstIndex];
      const second = visibleElements[secondIndex];
      const overlap = intersection(first.rect, second.rect);
      if (!overlap) continue;

      const overlapRatio = overlap.area / Math.min(rectArea(first.rect), rectArea(second.rect));
      const beatMetric = isBeatMetricPair(first.element, second.element);
      if (!beatMetric && (overlapRatio < 0.18 || isIntentionalPair(first.element, second.element, first.rect, second.rect))) {
        continue;
      }

      pushDiagnostic(state, {
        code: beatMetric ? 'metric-beat-overlap' : 'overlap',
        level: beatMetric || overlapRatio >= 0.45 ? 'error' : 'warning',
        message: `${first.element.id ?? '(no id)'} overlaps ${second.element.id ?? '(no id)'}`,
        overlapRatio: round(overlapRatio),
        overlap: roundedRect(overlap),
        elements: [
          elementRecord(first.element, roundedRect(first.rect)),
          elementRecord(second.element, roundedRect(second.rect)),
        ],
      });
    }
  }

  for (const { element, rect } of visibleElements) {
    if (!isKeyText(element)) continue;
    const text = plainText(element);
    if (!text) continue;

    const fontSize = fontSizeOf(element);
    const maxLines = Math.max(1, Number(element.maxLines) || 1);
    const availableWidth = Math.max(1, rect.width * maxLines);
    const estimatedWidth = estimateTextWidth(text, fontSize);
    const budget = Number(element.textBudget);
    const exceedsBudget = Number.isFinite(budget) && text.length > Math.ceil(budget * 1.35);
    const widthRatio = estimatedWidth / availableWidth;

    if (exceedsBudget || widthRatio > 1.12) {
      pushDiagnostic(state, {
        code: 'key-text-density',
        level: widthRatio > 1.35 ? 'error' : 'warning',
        message: `${element.id ?? '(no id)'} may be too dense for its text box`,
        element: elementRecord(element, roundedRect(rect)),
        textLength: text.length,
        textBudget: Number.isFinite(budget) ? budget : null,
        maxLines,
        estimatedWidth: round(estimatedWidth),
        availableWidth: round(availableWidth),
        widthRatio: round(widthRatio),
        textSample: text.slice(0, 80),
      });
    }

    const reason = shellReason(text);
    if (reason) {
      pushDiagnostic(state, {
        code: 'template-shell-content',
        level: 'warning',
        message: `${element.id ?? '(no id)'} looks like template shell content`,
        element: elementRecord(element, roundedRect(rect)),
        reason,
        textSample: text.slice(0, 80),
      });
    }
  }

  return {
    slidePath,
    canvas: { width, height },
    elementCount: elements.length,
    diagnosticCounts: state.byCode,
    levelCounts: state.byLevel,
    diagnosticTotal: state.total,
    diagnostics: state.samples,
  };
}

function projectIdFrom(fileName, elements) {
  const fromFile = fileName.match(/^(P\d+)/i)?.[1];
  if (fromFile) return fromFile.toUpperCase();
  const fromElement = elements.map((element) => String(element.id ?? '').match(/^(P\d+)/i)?.[1]).find(Boolean);
  return fromElement ? fromElement.toUpperCase() : null;
}

function groupBounds(items) {
  const rects = items.map(({ rect }) => rect).filter(Boolean);
  if (!rects.length) return null;
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function chipIndex(element) {
  return Number(String(element.id ?? '').match(/beat-chip-(\d+)/i)?.[1] ?? Number.MAX_SAFE_INTEGER);
}

function hasMetricBeatOverlap(elements) {
  const beatItems = elements
    .map((element) => ({ element, rect: rectOf(element) }))
    .filter(({ element, rect }) => rect && !isHiddenElement(element) && isBeatChipElement(element));
  const metricItems = elements
    .map((element) => ({ element, rect: rectOf(element) }))
    .filter(({ element, rect }) => rect && !isHiddenElement(element) && isMetricElement(element));

  for (const beat of beatItems) {
    for (const metric of metricItems) {
      if (intersection(beat.rect, metric.rect)) return true;
    }
  }
  return false;
}

function candidateBottomTops(canvasHeight, groupHeight) {
  const preferred = Math.max(0, canvasHeight - groupHeight - 58);
  const lower = Math.max(0, canvasHeight - groupHeight - 28);
  const upperLimit = Math.max(148, Math.floor(canvasHeight * 0.56));
  const values = [preferred, lower, canvasHeight - groupHeight - 44, 472, 464, 448, 432];
  for (let top = preferred; top >= upperLimit; top -= 8) values.push(top);
  return [...new Set(values.map((value) => Math.round(value)).filter((value) => Number.isFinite(value) && value >= 0))];
}

function hasBlockingCollision(movedBeatItems, otherItems, canvasWidth, canvasHeight) {
  for (const beat of movedBeatItems) {
    if (
      beat.rect.left < -EPSILON ||
      beat.rect.top < -EPSILON ||
      beat.rect.right > canvasWidth + EPSILON ||
      beat.rect.bottom > canvasHeight + EPSILON
    ) {
      return true;
    }

    for (const other of otherItems) {
      const overlap = intersection(beat.rect, other.rect);
      if (!overlap) continue;
      const ratio = overlap.area / Math.min(rectArea(beat.rect), rectArea(other.rect));
      if (ratio < 0.12) continue;
      if (isIntentionalPair(beat.element, other.element, beat.rect, other.rect)) continue;
      return true;
    }
  }
  return false;
}

function applyBeatChipFix(slide, fileName) {
  const canvasInfo = getCanvas(slide);
  if (!canvasInfo) return [];

  const { elements, width, height } = canvasInfo;
  const projectId = projectIdFrom(fileName, elements);
  if (projectId === 'P17') return [];
  if (!hasMetricBeatOverlap(elements)) return [];

  const beatItems = elements
    .map((element) => ({ element, rect: rectOf(element) }))
    .filter(({ element, rect }) => rect && !isHiddenElement(element) && isBeatChipElement(element))
    .sort((a, b) => chipIndex(a.element) - chipIndex(b.element) || a.rect.left - b.rect.left);
  if (!beatItems.length) return [];

  const beatSet = new Set(beatItems.map(({ element }) => element));
  const otherItems = elements
    .map((element) => ({ element, rect: rectOf(element) }))
    .filter(({ element, rect }) => rect && !isHiddenElement(element) && !beatSet.has(element) && !isDecorativeElement(element));
  const bounds = groupBounds(beatItems);
  if (!bounds) return [];

  for (const targetTop of candidateBottomTops(height, bounds.height)) {
    const dy = targetTop - bounds.top;
    const movedBeatItems = beatItems.map(({ element, rect }) => ({ element, rect: shiftedRect(rect, 0, dy) }));
    if (hasBlockingCollision(movedBeatItems, otherItems, width, height)) continue;

    for (const { element } of beatItems) {
      element.top = round(Number(element.top) + dy);
    }

    return [
      {
        code: 'move-beat-chip-group',
        message: 'Moved beat-chip group toward the bottom to avoid metric overlap',
        projectId,
        elementCount: beatItems.length,
        fromTop: round(bounds.top),
        toTop: round(targetTop),
        deltaY: round(dy),
      },
    ];
  }

  const textItems = beatItems
    .filter(({ element }) => isBeatChipText(element))
    .sort((a, b) => chipIndex(a.element) - chipIndex(b.element));
  const hidden = [];
  for (const { element } of textItems.slice(3)) {
    element.opacity = 0;
    element.hidden = true;
    hidden.push(element.id ?? '(no id)');
  }

  return hidden.length
    ? [
        {
          code: 'hide-non-key-beat-chip-text',
          message: 'Could not find a collision-free bottom row; hid non-key beat-chip text',
          projectId,
          hiddenElementIds: hidden,
        },
      ]
    : [];
}

async function processFile(filePath, args) {
  const originalText = await readFile(filePath, 'utf8');
  const fileName = path.basename(filePath);
  const data = JSON.parse(stripJsonBom(originalText));
  const slides = collectAnimationSlides(data);
  const fixes = [];
  const before = [];
  const after = [];

  for (const { slide, path: slidePath } of slides) {
    const beforeAudit = auditSlide(slide, slidePath, fileName);
    before.push(beforeAudit);
    if (args.fix) fixes.push(...applyBeatChipFix(slide, fileName).map((fix) => ({ ...fix, slidePath })));
    after.push(args.fix ? auditSlide(slide, slidePath, fileName) : beforeAudit);
  }

  let written = false;
  if (args.fix && fixes.length) {
    const nextText = `${JSON.stringify(data, null, 2)}\n`;
    if (nextText !== originalText) {
      await writeFile(filePath, nextText, 'utf8');
      written = true;
    }
  }

  return {
    file: relativeToRoot(filePath),
    slidesScanned: slides.length,
    written,
    fixes,
    before: args.fix ? before : undefined,
    slides: after,
  };
}

function addCounts(target, source = {}) {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + value;
  }
}

function summarizeFiles(files) {
  const totals = {
    filesScanned: files.length,
    slidesScanned: 0,
    diagnostics: 0,
    fixes: 0,
    filesWritten: 0,
    byCode: {},
    byLevel: {},
  };

  for (const file of files) {
    totals.slidesScanned += file.slidesScanned;
    totals.fixes += file.fixes.length;
    if (file.written) totals.filesWritten += 1;
    for (const slide of file.slides) {
      totals.diagnostics += slide.diagnosticTotal;
      addCounts(totals.byCode, slide.diagnosticCounts);
      addCounts(totals.byLevel, slide.levelCounts);
    }
  }

  return totals;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const entries = await readdir(args.widgetsDir, { withFileTypes: true });
  const jsonFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(args.widgetsDir, entry.name))
    .sort((first, second) => first.localeCompare(second));

  const files = [];
  for (const filePath of jsonFiles) {
    files.push(await processFile(filePath, args));
  }

  const totals = summarizeFiles(files);
  const summary = {
    tool: 'audit-animation-layout',
    mode: args.fix ? 'fix' : 'audit',
    widgetsDir: relativeToRoot(args.widgetsDir),
    modified: totals.filesWritten > 0,
    totals,
    files,
  };

  console.log(JSON.stringify(summary, null, 2));
  if (totals.diagnostics > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    tool: 'audit-animation-layout',
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exitCode = 1;
});
