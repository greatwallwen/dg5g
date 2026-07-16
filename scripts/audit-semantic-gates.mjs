#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { MANIM_REQUIRED_TARGETS, manimManifestCopyFor, manimSceneSpecFor } from './manim-scene-sources.mjs';
import { textbookOutput } from './textbook-paths.mjs';

const root = process.cwd();
const failures = [];
const rows = {
  visibleCopy: [],
  animationWidgets: [],
  manim: [],
  edugame: [],
};

const visibleTargets = [
  textbookOutput('projects'),
  textbookOutput('widgets'),
  path.join(root, 'site', 'src', 'components', 'WidgetSlot.tsx'),
  path.join(root, 'site', 'src', 'pages', 'projects', '[id].astro'),
  path.join(root, 'packages', 'widgets', 'src', 'lesson-animation', 'LessonAnimation.tsx'),
  path.join(root, 'packages', 'widgets', 'src', 'edugame-pixi', 'EduGameInteractiveV2.tsx'),
];

const visibleTextKeys = new Set([
  'title',
  'label',
  'text',
  'caption',
  'displayText',
  'spokenText',
  'summary',
  'description',
  'body',
  'detail',
  'message',
  'subtitle',
  'alt',
  'content',
  'learningGoal',
  'feedbackHint',
  'actionLabel',
  'replayValue',
  'instruction',
  'prompt',
  'reviewSummary',
  'pass',
  'fail',
]);

const visibleTechPatterns = [
  ['visible-implementation-term', /\b(?:Manim|OpenMAIC|renderer|template|placeholder|Generated|TODO|FIXME)\b/],
  ['visible-widget-term', /\b(?:lesson-animation|mediaTracks|playbackScenes|voiceProfileId|audioUrl)\b/i],
  ['template-copy-tone', /(?:点击继续|click to continue|next step|sample text|lorem ipsum)/i],
  ['non-textbook-production-trace', /(?:可视化演示|配套约束|实验输出|运行输出|技术实现|实现细节|生成痕迹|调试输出|控制台输出|截图基线|自动审核|动画审核|知识链生成|已按知识链生成)/],
  ['visible-template-chain-copy', /Manim\s*知识动画|知识链|知识点闭环|流程展示|步骤展示|任务流程|操作流程|照片、编号、坐标|照片编号坐标/],
  ['visible-ai-term', /(?:^|[^A-Za-z0-9])AI(?:\s*(?:动画|审核|生成|实验|输出))?(?=$|[^A-Za-z0-9])/],
  ['visible-worker-trace', /Ralph\s*Loop|\b(?:subagent|worker|agent)\b|提示词/i],
  ['visible-debug-action-title', /\bexplain\s+[\u3400-\u9fffA-Za-z0-9]/i],
  ['visible-action-title-trace', /\b(?:stage\s+overview|stage\s+\d+\s+(?:transition\s+)?cursor|semantic\s+connector|scene\s+transition|final\s+caption)\b|转场游标|阶段\d+游标/i],
];

auditVisibleCopy();
auditAnimationWidgets();
auditManimShells();
auditEduGameFeedback();

const report = {
  tool: 'audit-semantic-gates',
  totals: {
    visibleFiles: rows.visibleCopy.length,
    animationWidgets: rows.animationWidgets.length,
    manimTargets: rows.manim.length,
    edugameWidgets: rows.edugame.length,
    failures: failures.length,
  },
  rows,
  failures,
};

console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;

function auditVisibleCopy() {
  for (const file of collectFiles(visibleTargets, /\.(mdx|json|tsx|astro)$/)) {
    const relFile = rel(file);
    if (isIgnored(relFile)) continue;
    const textItems = collectVisibleText(file, readText(file)).map(cleanText).filter(Boolean);
    const hits = [];
    for (const item of textItems) {
      for (const [code, pattern] of visibleTechPatterns) {
        if (!pattern.test(item)) continue;
        const hit = { code, sample: item.slice(0, 140) };
        hits.push(hit);
        fail(relFile, code, `learner-visible copy exposes implementation/template wording: ${hit.sample}`);
      }
    }
    rows.visibleCopy.push({ file: relFile, visibleTextItems: textItems.length, hits: summarize(hits) });
  }
}

function auditAnimationWidgets() {
  const widgetDir = textbookOutput('widgets');
  if (!existsSync(widgetDir)) return;
  for (const name of readdirSync(widgetDir).filter((item) => item.endsWith('-lesson-animation-001.json')).sort()) {
    const file = path.join(widgetDir, name);
    const data = readJson(file);
    if (!data) {
      fail(rel(file), 'invalid-json', 'lesson animation widget is not valid JSON');
      continue;
    }
    const project = data.project ?? name.slice(0, 3);
    const artifact = data.props?.artifact ?? {};
    const lessonAstFile = path.join(textbookOutput('generatedAst'), 'lesson-ast', `${project}.json`);
    const lessonAst = existsSync(lessonAstFile) ? readJson(lessonAstFile) : null;
    const storyboardLabels = toList(lessonAst?.content?.storyboard?.knowledgeUnits).map((item) => cleanText(item?.title));
    const astTargetLabels = toList(lessonAst?.animation?.targets).map((item) => cleanText(item?.label));
    const widgetTargetLabels = toList(data.props?.targets)
      .filter((item) => !String(item?.id ?? '').endsWith('-step-final'))
      .map((item) => cleanText(item?.label));
    const contentAligned = storyboardLabels.length > 0
      && sameList(storyboardLabels, astTargetLabels)
      && sameList(storyboardLabels, widgetTargetLabels);
    if (!lessonAst) fail(project, 'lesson-ast-missing', `${project} has no generated lesson AST sidecar`);
    else if (!contentAligned) {
      fail(
        project,
        'lesson-animation-semantic-drift',
        `storyboard [${storyboardLabels.join(' / ')}], AST [${astTargetLabels.join(' / ')}], widget [${widgetTargetLabels.join(' / ')}]`,
      );
    }
    const elements = artifact.scene?.content?.canvas?.elements ?? [];
    const pages = artifact.pages ?? [];
    const cues = [...toList(artifact.timeline?.cues), ...toList(artifact.scene?.timeline?.cues)];
    const actions = [...toList(artifact.actions), ...toList(artifact.scene?.actions)];
    const elementIds = new Set(elements.map((item) => item?.id).filter(Boolean));
    const targetRows = [];
    let arrowCount = 0;
    let spotlightCount = 0;

    for (const page of pages) {
      if (page.focusElementId) assertTarget(project, elementIds, page.focusElementId, 'page-focus-target-missing', `page ${page.id} focusElementId`);
      if (page.semanticEdgeId) assertTarget(project, elementIds, page.semanticEdgeId, 'page-edge-target-missing', `page ${page.id} semanticEdgeId`);
    }

    for (const cue of cues) {
      const effect = String(cue.effect ?? cue.type ?? '');
      const targets = toList(cue.targets);
      if (/spotlight|laser/i.test(effect)) {
        spotlightCount += 1;
        if (!targets.length) fail(project, 'spotlight-target-missing', `${cue.id ?? '(cue)'} has no spotlight target`);
        for (const target of targets) assertTarget(project, elementIds, target, 'spotlight-target-missing', `${cue.id ?? '(cue)'} target`);
      }
      for (const target of targets) targetRows.push(target);
    }

    for (const action of actions) {
      const type = String(action.type ?? action.effect ?? '');
      const target = action.target ?? action.elementId ?? action.targetElementId;
      if (/spotlight|laser/i.test(type)) {
        spotlightCount += 1;
        assertTarget(project, elementIds, target, 'spotlight-target-missing', `${action.id ?? '(action)'} target`);
      }
      if (target) targetRows.push(target);
    }

    for (const line of elements.filter((item) => item?.type === 'line')) {
      if (!hasArrow(line)) continue;
      arrowCount += 1;
      const semantic = line.semanticKind ?? line.edgeKind ?? line.relationType ?? line.data?.semanticKind;
      const payloadSemantic = cues
        .filter((cue) => toList(cue.targets).includes(line.id))
        .some((cue) => cue.payload?.semantic || cue.payload?.relationType || cue.payload?.kind);
      const hasKnownTarget = targetRows.includes(line.id);
      if (!isSemanticEdge(semantic) && !payloadSemantic && !hasKnownTarget) {
        fail(project, 'meaningless-arrow', `${line.id ?? '(line)'} has arrow styling but no semantic kind or guided cue`);
      }
    }

    rows.animationWidgets.push({ project, file: rel(file), elements: elements.length, pages: pages.length, arrows: arrowCount, spotlightTargets: spotlightCount, contentAligned });
  }
}

function auditManimShells() {
  const fingerprints = new Map();
  for (const target of MANIM_REQUIRED_TARGETS) {
    const spec = safeManimSpec(target);
    const copy = safeManimCopy(target);
    const fingerprint = stableHash({
      sceneTemplateId: spec.sceneTemplateId,
      title: spec.title,
      subtitle: spec.subtitle,
      mode: spec.mode,
      scenes: spec.scenes,
      items: spec.items,
    });
    const row = {
      project: target.project,
      template: target.template,
      sceneTemplate: spec.sceneTemplateId,
      title: copy.title ?? '',
      fingerprint,
    };
    rows.manim.push(row);
    pushMap(fingerprints, fingerprint, row);
    if (!target.template.toLowerCase().includes(target.project.toLowerCase())) {
      fail(target.project, 'manim-template-not-project-scoped', `${target.template} is not project-scoped`);
    }
    if (/\b(?:generic|template|manim|placeholder)\b/i.test(`${copy.title ?? ''} ${copy.body ?? ''}`)) {
      fail(target.project, 'manim-visible-template-copy', `${target.project} manifest copy uses implementation wording`);
    }
  }
  for (const group of fingerprints.values()) {
    if (group.length <= 1) continue;
    fail('manim', 'repeated-manim-shell', `same Manim scene shell reused by ${group.map((item) => item.project).join(', ')}`);
  }
}

function safeManimSpec(target) {
  try {
    return manimSceneSpecFor(target.project, target.template);
  } catch {
    return {
      sceneTemplateId: target.template,
      title: '',
      subtitle: '',
      mode: '',
      scenes: [],
      items: [],
    };
  }
}

function safeManimCopy(target) {
  try {
    return manimManifestCopyFor(target.project, target.template);
  } catch {
    return { title: '', body: '' };
  }
}

function auditEduGameFeedback() {
  const widgetDir = textbookOutput('widgets');
  if (!existsSync(widgetDir)) return;
  for (const file of readdirSync(widgetDir).filter((item) => item.endsWith('-edugame-interactive-001.json')).sort()) {
    const widget = readJson(path.join(widgetDir, file));
    const config = widget?.props?.gameConfig ?? {};
    const levels = toList(config.levels);
    const firstLevel = levels[0] ?? {};
    const items = toList(firstLevel.items);
    const row = {
      id: widget?.id ?? file,
      kind: config.game_type ?? '',
      levels: levels.length,
      items: items.length,
      knowledgePoints: toList(config.knowledge_points).length,
      hasScoreRule: Boolean(config.score_rule),
    };
    rows.edugame.push(row);
    if (!row.kind || levels.length < 1 || items.length < 5 || row.knowledgePoints < 3 || !row.hasScoreRule) {
      fail(row.id, 'interactive-feedback-too-thin', `${row.id} needs standard game_type, levels, items, knowledge points, and score rule`);
    }
    if (/interactives\/[a-z-]+\//i.test(JSON.stringify(widget))) {
      fail(row.id, 'interactive-legacy-engine-reference', `${row.id} still references removed external runtime`);
    }
  }
}

function collectFiles(items, extPattern) {
  const out = [];
  for (const item of items) {
    if (!existsSync(item)) continue;
    if (statSync(item).isFile()) {
      if (extPattern.test(item)) out.push(item);
      continue;
    }
    walk(item, out, extPattern);
  }
  return out;
}

function walk(dir, out, extPattern) {
  const relative = rel(dir);
  if (isIgnored(relative)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out, extPattern);
    else if (extPattern.test(entry.name)) out.push(full);
  }
}

function collectVisibleText(file, text) {
  if (file.endsWith('.json')) return collectJsonVisibleText(text);
  if (file.endsWith('.mdx')) return collectMdxVisibleText(text);
  if (file.endsWith('.astro')) return collectMarkupText(text);
  return stringLiterals(text).filter((item) => !looksLikeSourceOnly(item));
}

function collectMdxVisibleText(text) {
  const body = stripFrontmatter(text)
    .replace(/\b(?:src|poster|href|id|data-[\w-]+|widget|widgets|kind|clipId|manifestUrl|audioUrl|voiceProfileId)=["'][^"']*["']/g, '')
    .replace(/\b(?:src|poster|href|id|data-[\w-]+|widget|widgets|kind|clipId|manifestUrl|audioUrl|voiceProfileId)=\{["'][^"']*["']\}/g, '')
    .replace(/<WidgetSlot[\s\S]*?\/>/g, ' ')
    .replace(/<video\b[\s\S]*?<\/video>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ');
  return [
    stripTags(body),
    ...stringLiterals(body).filter((item) => !looksLikeSourceOnly(item)),
  ];
}

function collectJsonVisibleText(text) {
  const data = parseJson(text);
  if (!data) return [];
  const out = [];
  visit(data);
  return out;

  function visit(value, key = '') {
    if (value == null) return;
    if (typeof value === 'string') {
      if (visibleTextKeys.has(key)) out.push(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, key);
      return;
    }
    if (typeof value !== 'object') return;
    for (const [childKey, child] of Object.entries(value)) visit(child, childKey);
  }
}

function collectMarkupText(text) {
  const body = stripFrontmatter(text)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
  return [
    ...[...body.matchAll(/>([^<>{}]*(?:[\u3400-\u9fff]|[A-Za-z]{3})[^<>{}]*)</g)].map((match) => match[1]),
    ...stringLiterals(body).filter((item) => !looksLikeSourceOnly(item)),
  ];
}

function assertTarget(project, elementIds, target, code, label) {
  if (!target) {
    fail(project, code, `${label} is empty`);
    return;
  }
  if (!elementIds.has(target)) fail(project, code, `${label} "${target}" does not match a canvas element id`);
}

function hasAssessableAnswer(inputModel, answerModel) {
  if (!inputModel?.kind || !answerModel || !Object.keys(answerModel).length) return false;
  const pairs = answerModel.pairs && typeof answerModel.pairs === 'object' ? Object.keys(answerModel.pairs) : [];
  const sequence = toList(answerModel.sequence);
  const requiredIds = toList(answerModel.requiredIds);
  const targetIds = toList(answerModel.targetIds);
  if (inputModel.kind === 'ordering') return sequence.length >= 2;
  if (inputModel.kind === 'selection') return requiredIds.length >= 1 && targetIds.length >= 1;
  return pairs.length >= 2 && targetIds.length >= 2;
}

function hasArrow(element) {
  return /arrow|triangle|marker/i.test(`${element.markerEnd ?? ''} ${element.endMarker ?? ''} ${toList(element.points).join(' ')}`);
}

function isSemanticEdge(value) {
  return ['process', 'dependency', 'data-flow', 'cause', 'feedback', 'sequence', 'contrast'].includes(String(value ?? ''));
}

function stringLiterals(text) {
  return [...String(text ?? '').matchAll(/["'`]([^"'`]*(?:[\u3400-\u9fff]|[A-Za-z]{3})[^"'`]*)["'`]/g)].map((match) => match[1]);
}

function looksLikeSourceOnly(text) {
  const value = String(text ?? '').trim();
  if (/^(?:dg|eg)-[\w-]+(?:\s+(?:dg|eg)-[\w-]+)*$/.test(value)) return true;
  return /(?:\b(?:import|export|const|return|className|client:load|data-widget-id|lesson-animation|mediaTracks|playbackScenes)\b|=>|\/(?:media|interactives)\/|#[0-9a-f]{3,6})/i.test(value);
}

function cleanText(value) {
  return stripTags(value).replace(/&[^;]+;/g, '').replace(/\s+/g, ' ').trim();
}

function stripFrontmatter(text) {
  return String(text ?? '').replace(/^---\r?\n[\s\S]*?\r?\n---/, '');
}

function stripTags(text) {
  return String(text ?? '').replace(/<[^>]+>/g, ' ');
}

function readText(file) {
  return readFileSync(file, 'utf-8');
}

function readJson(file) {
  return parseJson(readText(file));
}

function parseJson(text) {
  try {
    const source = String(text ?? '');
    return JSON.parse(source.charCodeAt(0) === 0xfeff ? source.slice(1) : source);
  } catch {
    return null;
  }
}

function stableHash(value) {
  return createHash('sha1').update(stableJson(value)).digest('hex').slice(0, 12);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function summarize(items) {
  const counts = {};
  for (const item of items) counts[item.code] = (counts[item.code] ?? 0) + 1;
  return counts;
}

function pushMap(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function toList(value) {
  if (Array.isArray(value)) return value.filter((item) => item !== undefined && item !== null);
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

function sameList(first, second) {
  return first.length === second.length && first.every((item, index) => item === second[index]);
}

function isIgnored(relative) {
  return /^(?:archive|research|vendor|node_modules|site\/dist|OpenMAIC)(?:\/|$)/.test(relative.replaceAll(path.sep, '/'));
}

function rel(file) {
  return path.relative(root, file).replaceAll(path.sep, '/');
}

function fail(scope, code, message) {
  failures.push({ scope, code, message });
}
