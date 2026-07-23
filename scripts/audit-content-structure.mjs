#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { MANIM_REQUIRED_TARGETS } from './manim-scene-sources.mjs';
import { textbookOutput } from './textbook-paths.mjs';

const root = process.cwd();
const projectDir = textbookOutput('projects');
const widgetDir = textbookOutput('widgets');
const pages = readdirSync(projectDir).filter((file) => file.endsWith('.mdx'));
const failures = [];
const rows = [];
const FOCUS_PROJECTS = new Set(['P02', 'P10', 'P11', 'P14', 'P16', 'P18']);
const FOCUS_KNOWLEDGE_TEMPLATES = new Map([
  ['P02', { template: 'outdoor-site-survey', terms: ['地形', '站向', '邻区', '路迹', '照片', '归档'] }],
  ['P10', { template: 'parameter-governance-loop', terms: ['触发', '对象', '取值', '影响', '窗口', '留痕'] }],
  ['P11', { template: 'optimization-implementation', terms: ['定位', '动作', '排程', '执行', '观察', '复测'] }],
  ['P14', { template: 'kpi-source-pipeline', terms: ['口径', 'PM', 'DT', '告警', '清洗', '基线'] }],
  ['P16', { template: 'validation-delta', terms: ['前值', '目标', '差值', '异常', '结论', '固化'] }],
  ['P18', { template: 'signaling-fault-ladder', terms: ['RRC', 'NAS', 'PDU', 'Cause', '边界', '复测'] }],
]);
const KEY_EDUGAME_REFS = new Map([
  ['P01', 'pipe-connect'],
  ['P02', 'drag-match'],
  ['P04', 'quiz-rush'],
  ['P08', 'boss-review'],
  ['P09', 'classification-run'],
  ['P10', 'classification-run'],
  ['P11', 'memory-card'],
  ['P12', 'quiz-rush'],
  ['P14', 'match-3'],
  ['P15', 'classification-run'],
  ['P16', 'quiz-rush'],
  ['P17', 'sort-flow'],
  ['P18', 'maze-troubleshoot'],
]);
const TRACE_PATTERNS = [
  ['ai-disclaimer', /(?:作为(?:一个)?AI|as an ai|large language model|language model|ChatGPT|Claude|Codex|OpenAI|Gemini)/i],
  ['agent-work-trace', /(?:Ralph loop|subagent|子代理|工作痕迹|提示词|prompt|debug note|TODO|FIXME|占位|placeholder|草稿|待补|待完善)/i],
  ['experiment-output', /(?:实验输出|运行输出|console output|terminal output|stdout|stderr|Traceback|stack trace|npm ERR!|pnpm ERR!)/i],
  ['visible-production-trace', /(?:可视化演示|配套约束|技术实现|实现细节|生成痕迹|调试输出|控制台输出|截图基线|自动审核|动画审核|知识链生成|已按知识链生成)/],
  ['visible-template-chain-copy', /Manim\s*知识动画|知识链|知识点闭环|流程展示|步骤展示|任务流程|操作流程|照片、编号、坐标|照片编号坐标/],
  ['visible-worker-trace', /Ralph\s*Loop|\b(?:subagent|worker|agent)\b|提示词/i],
  ['visible-debug-action-title', /\bexplain\s+[\u3400-\u9fffA-Za-z0-9]/i],
  ['visible-action-title-trace', /\b(?:stage\s+overview|stage\s+\d+\s+(?:transition\s+)?cursor|semantic\s+connector|scene\s+transition|final\s+caption)\b|转场游标|阶段\d+游标/i],
  ['visible-implementation-name', /\b(?:Manim|TeachingStage|renderer)\b/],
  ['visible-ai-term', /(?:^|[^A-Za-z0-9])AI(?:\s*(?:动画|审核|生成|实验|输出))?(?=$|[^A-Za-z0-9])/],
  ['assistant-voice', /(?:我将|我已经|下面我|以下是我|抱歉|无法完成|请复制|请保存)/],
];
const MOJIBAKE_PATTERNS = [
  ['replacement-char', /\uFFFD/],
  ['gbk-mojibake', new RegExp([
    '\\u951b',
    '\\u7ed7',
    '\\u5a06',
    '\\u4fef',
    '\\u93c1',
    '\\u934f',
    '\\u7039',
    '\\u7f03',
    '\\u9422',
    '\\u95ab',
    '\\u8930',
    '\\u9438',
    '\\u52ec',
    '\\u20ac\\?',
    '\\u9359',
    '\\u6d93',
    '\\u6d60',
    '\\u5bee',
    '\\u6b0f',
    '\\u54c4',
    '\\u7ad4',
    '\\u68d4',
    '\\u7859',
    '\\u535e',
    '\\u5986',
    '\\u719a',
    '\\u52eb',
  ].join('|'))],
  ['latin-mojibake', /(?:Ã.|Â.|â€|â€™|â€œ|â€\u009d)/],
];
const TASK_PATTERNS = [
  ['task', /任务/g],
  ['exercise', /(?:练习|实训|实验|挑战|闯关|作业)/g],
  ['submit', /(?:提交|上传|打分|评分|得分|截图)/g],
  ['imperative', /(?:请|你需要|完成以下|按要求|回答下列|讨论|思考题)/g],
];
const WIDGET_TTS_FIELDS = ['audioId', 'audioUrl', 'speakerId', 'voiceProfileId', 'voicePrompt', 'promptText'];
const FORBIDDEN_TASK_HEADINGS = /(?:任务导入|任务要求|任务描述|任务书|实训任务|提交要求|评分标准)/;
const GENERIC_TASK_COMPONENTS = /<(?:TaskIntro|TaskRequirements|TaskChecklist|PracticeTask|SubmissionBox)\b/;
const MAIN_TASK_SECTION_PATTERN = /<(?:SectionStep|section)\b[^>]*\bid=["']sec-task-[\w-]+["']/g;
const KNOWLEDGE_UNIT_ID_PATTERN = /^P\d{2}-ku-\d+(?:-(?:body|section))?$/;
const NON_P17_TEMPLATE_RESIDUE = /(?:template-speech|benchmark-stage|P17-benchmark|signaling-ladder|sec-task-intro|sec-task-requirements)/i;
const BROAD_PLAYBACK_TARGETS = new Set([
  'sec-project-overview',
  'sec-overview',
  'sec-task-intro',
  'sec-task-requirements',
  'sec-knowledge',
  'sec-implementation',
  'sec-quiz',
  'sec-hard-points',
  'sec-assessment',
  'sec-case',
]);
const TTS_MISREAD_PATTERNS = [
  ['hyphen-as-minus', /(?:图|表)?\d+\s*减去\s*\d+|(?:RSRP|SINR|PCI|A3|MR|dB|dBm)?\s*\d+\s*减去\s*\d+/i],
  ['spaced-technical-acronym', /\b(?:S S R S R P|S S S I N R|C S I|C S I R S|R R C|N A S|P D U|A M F|S M F|U P F|g N B|U E|d B m)\b/i],
  ['ellipsis-read-literally', /省略号|点点点/],
  ['raw-truncation', /\.\.\.|…$/],
];
const STORYBOARD_VISUAL_RESIDUE = [
  ['generic-concept-chain', /概念\s*→\s*场景\s*→\s*证据/],
  ['truncated-managed-element', /\bManag\b/],
  ['generic-practice-chain', /选择<\/span><span>判定<\/span><span>反馈/],
];

for (const page of pages) auditPage(page);
auditWidgets();
auditMediaCoverage();

console.log(JSON.stringify({ tool: 'audit-content-structure', pages: rows, failures }, null, 2));
if (failures.length) process.exitCode = 1;

function auditPage(page) {
  const text = readFileSync(path.join(projectDir, page), 'utf-8');
  const projectId = page.slice(0, 3);
  const tableCount = count(text, /<table\b/g);
  const taskTerms = countTaskTerms(text);
  const taskWordCount = taskTerms.reduce((sum, item) => sum + item.count, 0);
  const directTaskWords = taskTerms.find((item) => item.label === 'task')?.count ?? 0;
  const taskWordingScore = taskTerms.reduce((sum, item) => sum + item.score, 0);
  const traceHits = findTextTraceIssues(text);
  const taskWords = count(text, /任务/g);
  const manimRefs = count(text, /media\/manim/g);
  const edugameRefs = count(text, /edugame-interactive/g);
  const body = pageBody(text);
  const frontmatter = parseFrontmatter(text);
  const playbackScenes = Array.isArray(frontmatter.playbackScenes) ? frontmatter.playbackScenes : [];
  const mojibakeHits = findMojibakeIssues(text);
  const visualResidueHits = findStoryboardVisualResidue(text);
  const longBodyRuns = findLongBodyRuns(body);
  const taskSectionCount = uniqueMatches(body, MAIN_TASK_SECTION_PATTERN).size;
  const knowledgeUnitCount = countKnowledgeUnits(projectId, body);
  const playbackBroadTargets = auditPlaybackScenes(projectId, playbackScenes);
  const playbackFocusIssues = auditPlaybackActionInterleaving(projectId, playbackScenes);
  const ttsIssues = auditTtsReading(projectId, `page ${page}`, collectPlaybackActions(playbackScenes));
  rows.push({
    projectId,
    tableCount,
    taskWords: taskWordCount,
    directTaskWords,
    taskWordingScore,
    traceHits: traceHits.length,
    mojibakeHits: mojibakeHits.length,
    visualResidueHits: visualResidueHits.length,
    taskSectionCount,
    knowledgeUnitCount,
    longBodyRuns: longBodyRuns.length,
    playbackBroadTargets,
    playbackFocusIssues,
    ttsIssues,
    manimRefs,
    edugameRefs,
  });
  if (tableCount > 4) fail(projectId, `HTML table count too high: ${tableCount}`);
  if (traceHits.length) fail(projectId, `page contains AI/experiment trace: ${traceHits.map((item) => item.label).join(', ')}`);
  if (mojibakeHits.length) fail(projectId, `page contains mojibake/suspicious encoding text: ${mojibakeHits.map((item) => item.label).join(', ')}`);
  if (visualResidueHits.length) fail(projectId, `page contains generic storyboard visual residue: ${visualResidueHits.map((item) => item.label).join(', ')}`);
  if (taskSectionCount > 0) fail(projectId, `main body contains sec-task-* chapters: ${taskSectionCount}`);
  if (knowledgeUnitCount < 4 || knowledgeUnitCount > 6) fail(projectId, `knowledge unit count must stay between 4 and 6: ${knowledgeUnitCount}`);
  for (const run of longBodyRuns) fail(projectId, `continuous long body copy near paragraph ${run.start}: ${run.count} paragraphs, max ${run.maxLength} chars`);
  if (projectId !== 'P17' && NON_P17_TEMPLATE_RESIDUE.test(JSON.stringify(playbackScenes))) {
    fail(projectId, 'non-P17 importer/template residue in playbackScenes');
  }
  if (directTaskWords > 18 || taskWordingScore > 70) fail(projectId, `task wording still too strong: ${taskWordCount} terms, score ${taskWordingScore}`);
  if (FOCUS_PROJECTS.has(projectId)) auditFocusedPage(projectId, text);
}

function auditWidgets() {
  const widgets = readdirSync(widgetDir).filter((file) => file.endsWith('-lesson-animation-001.json'));
  for (const file of widgets) {
    const data = JSON.parse(readFileSync(path.join(widgetDir, file), 'utf-8'));
    const artifact = data.props?.artifact;
    const elements = artifact?.scene?.content?.canvas?.elements ?? [];
    const canvas = artifact?.scene?.content?.canvas;
    const cues = artifact?.timeline?.cues ?? [];
    const actions = artifact?.actions ?? [];
    const sceneActions = artifact?.scene?.actions ?? [];
    const stagePages = artifact?.pages ?? [];
    const projectId = data.project ?? file.slice(0, 3);
    const traceHits = findTextTraceIssues(collectWidgetText(data));
    const mojibakeHits = findMojibakeIssues(collectWidgetText(data));
    if (traceHits.length) fail(projectId, `widget contains AI/experiment trace: ${traceHits.map((item) => item.label).join(', ')}`);
    if (mojibakeHits.length) fail(projectId, `widget contains mojibake/suspicious encoding text: ${mojibakeHits.map((item) => item.label).join(', ')}`);
    const ttsFields = sceneActions.flatMap((action) => WIDGET_TTS_FIELDS.filter((field) => field in action).map((field) => `${action.id}:${field}`));
    if (ttsFields.length) fail(projectId, `lesson animation artifact contains TTS config: ${ttsFields.slice(0, 6).join(', ')}`);
    auditTtsReading(projectId, `widget ${file}`, [...actions, ...sceneActions]);
    if (FOCUS_PROJECTS.has(projectId)) auditFocusedWidget(projectId, artifact, elements, cues, actions, sceneActions);
    if (canvas && Number(canvas.height) < 500) fail(projectId, `stage canvas height too small: ${canvas.height}`);
    if (stagePages.length > 0 && stagePages.length < 4) fail(projectId, `stage page count too low: ${stagePages.length}`);
    if (stagePages.length > 1 && !cues.some((cue) => /transition|camera|pan|zoom/i.test(String(cue.effect ?? '')))) {
      fail(projectId, 'stage pages lack transition/camera cues');
    }
    auditWidgetSemantics(projectId, artifact, elements, cues, [...actions, ...sceneActions]);
    const hasCaptionUpdate = cues.some((cue) => cue.effect === 'captionUpdate')
      || actions.some((action) => action.type === 'captionUpdate' || action.effect === 'captionUpdate' || action.state?.effect === 'captionUpdate');
    if (actions.some((action) => action.type === 'speech') && !hasCaptionUpdate) {
      fail(projectId, 'speech actions lack captionUpdate actions');
    }
    for (let phase = 1; phase <= 6; phase += 1) {
      const visible = elements.filter((element) => isVisibleAtPhase(element, phase));
      const lines = visible.filter(isConnectorLine);
      const arrows = lines.filter(hasArrowHead);
      const textChars = visible
        .filter((element) => element.type === 'text')
        .reduce((total, element) => total + plainText(element.content).length, 0);
      if (visible.length > 42) fail(projectId, `phase ${phase} visible elements too dense: ${visible.length}`);
      if (lines.length > 5) fail(projectId, `phase ${phase} has too many connector lines: ${lines.length}`);
      if (arrows.length > 6) fail(projectId, `phase ${phase} has too many arrow connectors: ${arrows.length}`);
      if (textChars > 140) fail(projectId, `phase ${phase} visible text too long: ${textChars}`);
    }
  }
}

function auditFocusedPage(projectId, text) {
  const body = pageBody(text);
  if (GENERIC_TASK_COMPONENTS.test(text)) fail(projectId, 'focused page imports generic task component');
  if (FORBIDDEN_TASK_HEADINGS.test(text)) fail(projectId, 'focused page uses task-import/task-requirement heading');
  if (!text.includes(`${projectId}-lesson-animation-001`)) fail(projectId, 'focused page missing lesson animation widget');
  if (!text.includes('NetworkVisual')) fail(projectId, 'focused page missing knowledge visual');
  const taskSectionCount = uniqueMatches(body, /sec-task-[\w-]+/g).size;
  const knowledgeUnitCount = countKnowledgeUnits(projectId, body);
  if (taskSectionCount > 2) fail(projectId, `focused page has too many task sections: ${taskSectionCount}`);
  if (knowledgeUnitCount < 5) fail(projectId, `focused page knowledge units too thin: ${knowledgeUnitCount}`);
}

function countKnowledgeUnits(projectId, body) {
  const unitIds = new Set();
  for (const match of String(body ?? '').matchAll(/<[A-Za-z][\w:-]*\b[^>]*>/g)) {
    const tag = match[0];
    const id = getAttribute(tag, 'id');
    const normalizedId = normalizeKnowledgeUnitId(projectId, id);
    if (normalizedId) {
      unitIds.add(normalizedId);
      continue;
    }
    const classes = getAttribute(tag, 'class').split(/\s+/).filter(Boolean);
    if (classes.includes('dg-knowledge-unit')) unitIds.add(`dg-knowledge-unit:${match.index ?? unitIds.size}`);
  }
  return unitIds.size;
}

function normalizeKnowledgeUnitId(projectId, id) {
  const value = String(id ?? '');
  if (!KNOWLEDGE_UNIT_ID_PATTERN.test(value) || !value.startsWith(`${projectId}-ku-`)) return '';
  return value.replace(/-(?:body|section)$/, '');
}

function getAttribute(tag, name) {
  const pattern = new RegExp(`\\b${name}=["']([^"']*)["']`, 'i');
  return String(tag ?? '').match(pattern)?.[1] ?? '';
}

function auditPlaybackScenes(projectId, playbackScenes) {
  const actions = collectPlaybackActions(playbackScenes);
  const broadRefs = actions.flatMap((action) => [action.elementId, action.target])
    .filter((target) => BROAD_PLAYBACK_TARGETS.has(String(target ?? '')));
  const uniqueBroadRefs = new Set(broadRefs);
  const limit = projectId === 'P17' ? 8 : 3;
  if (uniqueBroadRefs.size > limit || broadRefs.length > limit * 2) {
    fail(projectId, `playbackScenes target broad chapters too often: ${uniqueBroadRefs.size} unique, ${broadRefs.length} total`);
  }
  return broadRefs.length;
}

function auditPlaybackActionInterleaving(projectId, playbackScenes) {
  let issues = 0;
  for (const scene of playbackScenes) {
    const actions = Array.isArray(scene?.actions) ? scene.actions : [];
    for (let index = 0; index < actions.length; index += 1) {
      const action = actions[index];
      if (action?.type !== 'speech') continue;
      const previous = actions[index - 1];
      const target = String(action.elementId ?? action.target ?? '');
      const previousTarget = String(previous?.elementId ?? previous?.target ?? '');
      const previousFocus = ['spotlight', 'laser'].includes(String(previous?.type ?? ''))
        && (!target || target === previousTarget);
      if (previous?.type === 'speech') {
        issues += 1;
        fail(projectId, `playbackScenes has consecutive speech actions near ${scene.id}:${action.id ?? index}`);
      } else if (!previousFocus) {
        issues += 1;
        fail(projectId, `playback speech lacks immediate spotlight/laser focus: ${scene.id}:${action.id ?? index}`);
      }
    }
  }
  return issues;
}

function auditTtsReading(projectId, source, actions) {
  let issueCount = 0;
  for (const action of actions) {
    if (action?.type !== 'speech' && !action?.spokenText) continue;
    const spokenText = String(action.spokenText ?? action.text ?? '');
    const sourceText = String(action.text ?? action.caption ?? '');
    for (const [label, pattern] of TTS_MISREAD_PATTERNS) {
      if (!pattern.test(spokenText)) continue;
      issueCount += 1;
      const sourceHint = sourceText ? ` source=${JSON.stringify(sourceText.slice(0, 72))}` : '';
      fail(projectId, `TTS reading looks wrong (${label}) in ${source}:${action.id ?? '(no id)'} spoken=${JSON.stringify(spokenText.slice(0, 96))}${sourceHint}`);
    }
  }
  return issueCount;
}

function auditFocusedWidget(projectId, artifact, elements, cues, actions, sceneActions) {
  const template = FOCUS_KNOWLEDGE_TEMPLATES.get(projectId);
  const widgetText = [
    artifact?.template,
    ...collectArtifactText(artifact),
    ...((artifact?.pages ?? []).flatMap((page) => [page.id, page.title, page.phaseLabel])),
  ].filter(Boolean).join('\n');
  if (artifact?.template !== template.template) fail(projectId, `focused widget template drifted: ${artifact?.template}`);
  const missingTerms = template.terms.filter((term) => !widgetText.includes(term));
  if (missingTerms.length) fail(projectId, `focused widget lost knowledge terms: ${missingTerms.join(', ')}`);
  const pureAnimationTts = findForbiddenKeys(artifact, WIDGET_TTS_FIELDS);
  if (pureAnimationTts.length) fail(projectId, `pure animation widget contains TTS config: ${pureAnimationTts.slice(0, 6).join(', ')}`);
  if (findForbiddenKeys(artifact, ['presenterId', 'avatarId', 'playbackScenes']).length) fail(projectId, 'pure animation widget contains presenter/playback config');
  const stagePages = artifact?.pages ?? [];
  if (stagePages.length < 6) fail(projectId, `focused widget stage pages too low: ${stagePages.length}`);
  const transitionCues = cues.filter((cue) => /transition|camera|pan|zoom/i.test(String(cue.effect ?? cue.content ?? '')));
  if (transitionCues.length < 4) fail(projectId, `focused widget transition/camera cues too low: ${transitionCues.length}`);
  const spotlightCount = cues.filter((cue) => cue.effect === 'spotlight').length
    + actions.filter((action) => action.type === 'spotlight').length
    + sceneActions.filter((action) => action.type === 'spotlight').length;
  if (spotlightCount < 4) fail(projectId, `focused widget spotlight coverage too low: ${spotlightCount}`);
  auditArrowSemantics(projectId, elements, cues);
}

function auditWidgetSemantics(projectId, artifact, elements, cues, actions) {
  const cueTargets = new Set(cues.flatMap((cue) => cue.targets ?? []));
  const actionTargets = new Set(actions.flatMap((action) => [action.target, action.elementId]).filter(Boolean));
  const focusCount = cues.filter((cue) => /spotlight|laser/i.test(String(cue.effect ?? cue.content ?? ''))).length
    + actions.filter((action) => /spotlight|laser/i.test(String(action.type ?? action.effect ?? action.content ?? ''))).length;
  if (focusCount < 4) fail(projectId, 'spotlight-laser-missing', `lesson animation has only ${focusCount} spotlight/laser cues or actions`);

  for (const line of elements.filter(isConnectorLine)) {
    const id = String(line.id ?? '');
    const semanticKind = String(line.semanticKind ?? line.edgeKind ?? line.relationType ?? line.semantic ?? line.data?.semanticKind ?? '');
    const hasSemanticKind = ['process', 'dependency', 'data-flow', 'cause', 'feedback'].includes(semanticKind);
    if (hasArrowHead(line) && !hasSemanticKind && !cueTargets.has(id) && !actionTargets.has(id)) {
      fail(projectId, 'meaningless-arrow', `${id || '(no id)'} has no semantic kind, cue target, or action target`);
    }
  }

  for (const group of duplicateGraphicGroups(elements)) {
    fail(projectId, 'repeated-graphic', `duplicated graphic geometry: ${group.slice(0, 6).join(', ')}`);
  }

  for (const element of elements.filter((item) => item.type === 'text')) {
    const text = plainText(element.content ?? element.text ?? '');
    if (!text) continue;
    const budget = Number(element.textBudget);
    const maxLines = Math.max(1, Number(element.maxLines ?? 1));
    const limit = Number.isFinite(budget) ? Math.max(38, Math.ceil(budget * 1.8)) : 84;
    if (text.length > limit || (maxLines <= 1 && text.length > 52)) {
      fail(projectId, 'long-canvas-text', `${element.id ?? '(no id)'} has ${text.length} visible text chars`);
    }
  }

  const manimSpec = artifact?.manimSpec;
  if (manimSpec) {
    for (const field of ['clipId', 'targetUnitId', 'visualMetaphor', 'sceneBeats']) {
      if (!manimSpec[field]) fail(projectId, 'manim-spec-field-missing', `manimSpec missing ${field}`);
    }
  }
}

function auditArrowSemantics(projectId, elements, cues) {
  const connectors = elements.filter(isConnectorLine);
  const arrowConnectors = connectors.filter(hasArrowHead);
  const cueTargets = new Set(cues.flatMap((cue) => cue.targets ?? []));
  for (const line of connectors) {
    if (!String(line.id ?? '').startsWith(`${projectId}-`)) fail(projectId, `connector line id lacks project prefix: ${line.id}`);
    if (!hasArrowHead(line)) fail(projectId, `connector line lacks arrow marker: ${line.id}`);
  }
  const animatedArrows = arrowConnectors.filter((line) => cueTargets.has(line.id));
  if (arrowConnectors.length > 0 && animatedArrows.length < Math.min(4, arrowConnectors.length)) {
    fail(projectId, `too few arrow connectors have timeline semantics: ${animatedArrows.length}/${arrowConnectors.length}`);
  }
}

function isConnectorLine(element) {
  if (element.type !== 'line') return false;
  const id = String(element.id ?? '');
  return !id.includes('ladder-') && !id.includes('lane-');
}

function hasArrowHead(element) {
  const points = Array.isArray(element.points) ? element.points.join(' ') : '';
  return /arrow|triangle|marker/i.test(`${points} ${element.markerEnd ?? ''} ${element.endMarker ?? ''}`);
}

function duplicateGraphicGroups(elements) {
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
  return [...groups.values()].filter((ids) => ids.length > 1);
}

function auditMediaCoverage() {
  const requiredRenderedProjects = new Set(['P01', 'P02', 'P03']);
  const runtimePublicRoot = path.join(root, 'apps', 'web', 'public');
  for (const target of MANIM_REQUIRED_TARGETS) {
    const file = path.join(runtimePublicRoot, 'media', 'manim', target.project.toLowerCase(), target.template, 'manifest.json');
    const data = readJson(file);
    if (!data && !requiredRenderedProjects.has(target.project)) continue;
    if (data?.status !== 'rendered') fail(target.project, `Manim not rendered: ${target.template}`);
    const videoUrl = data?.outputs?.videoUrl;
    const posterUrl = data?.outputs?.posterUrl;
    if (!videoUrl && !posterUrl) fail(target.project, `Manim has no usable output: ${target.template}`);
    if (videoUrl && !existsSync(path.join(runtimePublicRoot, videoUrl.replace(/^\//, '')))) {
      fail(target.project, `Manim video file missing: ${videoUrl}`);
    }
    const widget = readJson(path.join(widgetDir, `${target.project}-lesson-animation-001.json`));
    const tracks = widget?.props?.artifact?.mediaTracks ?? [];
    if (!tracks.some((track) => track.manifestUrl?.includes(`/media/manim/${target.project.toLowerCase()}/${target.template}/`) && mediaOutputMatches(track, videoUrl, posterUrl))) {
      fail(target.project, `Manim rendered but not referenced by lesson widget: ${target.template}`);
    }
    if (!readProjectPage(target.project).includes(`${target.project}-lesson-animation-001`)) fail(target.project, 'lesson animation widget missing from project page');
  }
  for (const [projectId, expectedType] of KEY_EDUGAME_REFS) {
    const widgetId = `${projectId}-edugame-interactive-001`;
    const widget = readJson(path.join(widgetDir, `${widgetId}.json`));
    const gameConfig = widget?.props?.gameConfig ?? {};
    const pageText = readProjectPage(projectId);
    if (widget?.widget !== 'edugame-pixi') fail(projectId, `EduGame widget missing: ${widgetId}`);
    if (gameConfig.game_type !== expectedType) {
      fail(projectId, `EduGame expected ${expectedType}, got ${gameConfig.game_type ?? '(missing)'}`);
    }
    if (!pageText.includes(widgetId)) fail(projectId, `EduGame widget not attached to project page: ${widgetId}`);
    auditInteractiveFeedback(projectId, widgetId, gameConfig);
  }
}

function auditInteractiveFeedback(projectId, widgetId, gameConfig) {
  const levels = toList(gameConfig.levels);
  const firstLevel = levels[0] ?? {};
  const items = toList(firstLevel.items);
  const checks = [
    ['interactive-levels', levels, 1],
    ['interactive-items', items, 5],
    ['interactive-knowledge-points', toList(gameConfig.knowledge_points), 3],
    ['interactive-badges', toList(gameConfig.reward_rule?.badges), 2],
  ];
  for (const [code, values, minCount] of checks) {
    if (values.length < minCount) fail(projectId, code, `${widgetId} ${code} has ${values.length}, expected ${minCount}`);
  }
  if (!gameConfig.score_rule?.correct || !gameConfig.score_rule?.wrong_penalty) {
    fail(projectId, 'interactive-score-rule', `${widgetId} score rule is incomplete`);
  }
  if (/interactives\/[a-z-]+\//i.test(JSON.stringify(gameConfig))) {
    fail(projectId, 'interactive-legacy-engine', `${widgetId} still references removed external runtime`);
  }
}

function isVisibleAtPhase(element, phase) {
  const itemPhase = Number(element.phase);
  if (!Number.isFinite(itemPhase) || itemPhase <= 0) return true;
  return itemPhase === phase;
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

function plainText(value) {
  return String(value ?? '').replace(/<[^>]+>/g, '').replace(/&[^;]+;/g, '');
}

function collectWidgetText(data) {
  const artifact = data.props?.artifact ?? {};
  const elements = artifact.scene?.content?.canvas?.elements ?? [];
  const actions = artifact.actions ?? [];
  const cues = artifact.timeline?.cues ?? [];
  return [
    data.props?.title,
    ...elements.flatMap((item) => [item.id, item.title, item.alt, plainText(item.content), item.caption]),
    ...actions.flatMap((item) => [item.title, item.text, item.spokenText, item.caption, item.displayText]),
    ...cues.flatMap((item) => [item.id, item.payload?.label, item.payload?.caption, item.payload?.text]),
  ].filter(Boolean).join('\n');
}

function collectArtifactText(artifact) {
  const elements = artifact?.scene?.content?.canvas?.elements ?? [];
  const actions = artifact?.actions ?? [];
  const sceneActions = artifact?.scene?.actions ?? [];
  const cues = [...(artifact?.timeline?.cues ?? []), ...(artifact?.scene?.timeline?.cues ?? [])];
  return [
    artifact?.scene?.title,
    artifact?.scene?.description,
    ...elements.flatMap((item) => [item.id, item.title, item.alt, plainText(item.content), item.caption]),
    ...actions.flatMap((item) => [item.id, item.title, item.text, item.spokenText, item.caption, item.displayText]),
    ...sceneActions.flatMap((item) => [item.id, item.title, item.text, item.spokenText, item.caption, item.displayText]),
    ...cues.flatMap((item) => [item.id, item.effect, item.payload?.label, item.payload?.caption, item.payload?.text]),
  ];
}

function findForbiddenKeys(value, forbidden, trail = []) {
  if (!value || typeof value !== 'object') return [];
  const hits = [];
  for (const [key, child] of Object.entries(value)) {
    const nextTrail = [...trail, key];
    if (forbidden.includes(key)) hits.push(nextTrail.join('.'));
    if (child && typeof child === 'object') hits.push(...findForbiddenKeys(child, forbidden, nextTrail));
  }
  return hits;
}

function countTaskTerms(text) {
  return TASK_PATTERNS.map(([label, pattern], index) => {
    const countValue = count(text, pattern);
    return { label, count: countValue, score: countValue * (index < 2 ? 2 : 3) };
  }).filter((item) => item.count > 0);
}

function pageBody(text) {
  const parts = String(text ?? '').split('---');
  return parts.length >= 3 ? parts.slice(2).join('---') : String(text ?? '');
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

function uniqueMatches(text, pattern) {
  return new Set([...String(text ?? '').matchAll(pattern)].map((match) => match[0]));
}

function findTextTraceIssues(text) {
  return TRACE_PATTERNS.flatMap(([label, pattern]) => {
    const match = String(text ?? '').match(pattern);
    return match ? [{ label, sample: match[0].slice(0, 60) }] : [];
  });
}

function findMojibakeIssues(text) {
  return MOJIBAKE_PATTERNS.flatMap(([label, pattern]) => {
    const match = String(text ?? '').match(pattern);
    return match ? [{ label, sample: match[0].slice(0, 60) }] : [];
  });
}

function findStoryboardVisualResidue(text) {
  return STORYBOARD_VISUAL_RESIDUE.flatMap(([label, pattern]) => {
    const match = String(text ?? '').match(pattern);
    return match ? [{ label, sample: match[0].slice(0, 60) }] : [];
  });
}

function findLongBodyRuns(body) {
  const paragraphs = [...String(body ?? '').matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)]
    .map((match, index) => ({ index: index + 1, text: plainText(match[1]).trim() }))
    .filter((item) => item.text.length > 0);
  const runs = [];
  let current = [];
  for (const paragraph of paragraphs) {
    if (paragraph.text.length >= 240) current.push(paragraph);
    else {
      pushLongRun(runs, current);
      current = [];
    }
  }
  pushLongRun(runs, current);
  return runs;
}

function pushLongRun(runs, current) {
  if (current.length >= 2 || current.some((item) => item.text.length >= 420)) {
    runs.push({
      start: current[0].index,
      count: current.length,
      maxLength: Math.max(...current.map((item) => item.text.length)),
    });
  }
}

function collectPlaybackActions(playbackScenes) {
  return playbackScenes.flatMap((scene) => scene?.actions ?? []);
}

function readProjectPage(projectId) {
  const file = pages.find((item) => item.startsWith(`${projectId}-`));
  return file ? readFileSync(path.join(projectDir, file), 'utf-8') : '';
}

function mediaOutputMatches(track, videoUrl, posterUrl) {
  if (videoUrl) return track.videoUrl === videoUrl;
  if (posterUrl) return track.posterUrl === posterUrl;
  return false;
}

function toList(value) {
  if (Array.isArray(value)) return value.filter((item) => item != null && item !== '');
  if (value == null || value === '') return [];
  return [value];
}

function roundTo(value, step) {
  return Math.round(value / step) * step;
}

function count(text, pattern) {
  return text.match(pattern)?.length ?? 0;
}

function fail(projectId, codeOrMessage, maybeMessage) {
  failures.push({
    projectId,
    code: maybeMessage ? codeOrMessage : 'content-structure',
    message: maybeMessage ?? codeOrMessage,
  });
}
