import type {
  AnimationPPTElement,
  AnimationSlideScene,
  LessonAnimationArtifact,
  LessonAnimationTarget,
  TeachingAction,
  TeachingScene,
} from '@dgbook/animation';
import {
  chart,
  line,
  normalizeElement,
  shape,
  table,
  text,
} from './elements.ts';
import { defaultActions, normalizeGeneratedActions, parseActionsFromStructuredOutput } from './action-parser.ts';
import { buildPrompt, formatElementsForPrompt } from './prompts.ts';
import { createLLMClient, hasUsableModelCredentials } from './providers.ts';
import { cleanText, extractPlainText, parseJsonResponse, stableId } from './json.ts';
import type {
  DGBookGenerationContext,
  GeneratedAnimationDraft,
  GeneratedSlideContent,
  GenerationOptions,
  LLMClient,
  SceneOutline,
} from './types.ts';

type OutlineResponse = { languageDirective?: string; outlines?: SceneOutline[] } | SceneOutline[];

export async function generateAnimationDraftFromContext(
  context: DGBookGenerationContext,
  options: GenerationOptions = {},
): Promise<GeneratedAnimationDraft> {
  const llm = resolveLLM(options);
  const outlines = await generateSceneOutlines(context, { ...options, llm });
  const selectedOutline = selectAnimationOutline(outlines);
  const content = await generateSlideContent(context, selectedOutline, { ...options, llm });
  const actions = await generateSceneActions(context, selectedOutline, content, { ...options, llm });
  const sources = referencesFor(context.title);
  const { artifact, scene, targets } = buildLessonAnimationArtifact(context, selectedOutline, content, actions);
  const playbackScenes = buildPlaybackScenes(context, actions, selectedOutline);
  return { outlines, selectedOutline, content, actions, artifact, targets, playbackScenes, scene, sources };
}

export async function generateSceneOutlines(
  context: DGBookGenerationContext,
  options: GenerationOptions = {},
): Promise<SceneOutline[]> {
  if (shouldUseLLM(options)) {
    const prompt = buildPrompt('requirements-to-outlines', {
      projectId: context.projectId,
      title: context.title,
      topic: context.topic ?? context.title,
      chapterTitle: context.chapterTitle,
      unitTitle: context.unitTitle,
      sourceText: extractPlainText(context.sourceText, 5200),
    });
    try {
      const raw = await options.llm!.call({ ...prompt, source: 'dgbook-outlines' });
      const parsed = parseJsonResponse<OutlineResponse>(raw);
      const outlines = Array.isArray(parsed) ? parsed : parsed?.outlines;
      if (Array.isArray(outlines) && outlines.length > 0) return sanitizeOutlines(outlines, context);
    } catch {
      // Fall through to deterministic fallback.
    }
  }
  return fallbackOutlines(context);
}

export async function generateSlideContent(
  context: DGBookGenerationContext,
  outline: SceneOutline,
  options: GenerationOptions = {},
): Promise<GeneratedSlideContent> {
  if (shouldUseLLM(options)) {
    const prompt = buildPrompt('slide-content', {
      projectId: context.projectId,
      title: context.title,
      outlineTitle: outline.title,
      outlineDescription: outline.description,
      keyPoints: outline.keyPoints.map((point, index) => `${index + 1}. ${point}`).join('\n'),
    });
    try {
      const raw = await options.llm!.call({ ...prompt, source: 'dgbook-slide-content' });
      const parsed = parseJsonResponse<GeneratedSlideContent>(raw);
      if (parsed?.elements?.length) return normalizeSlideContent(parsed, context);
    } catch {
      // Fall through to deterministic fallback.
    }
  }
  return fallbackSlideContent(context, outline);
}

export async function generateSceneActions(
  context: DGBookGenerationContext,
  outline: SceneOutline,
  content: GeneratedSlideContent,
  options: GenerationOptions = {},
): Promise<TeachingAction[]> {
  const validIds = new Set(content.elements.map((element) => element.id));
  if (shouldUseLLM(options)) {
    const prompt = buildPrompt('slide-actions', {
      projectId: context.projectId,
      title: context.title,
      outlineTitle: outline.title,
      keyPoints: outline.keyPoints.map((point, index) => `${index + 1}. ${point}`).join('\n'),
      elements: formatElementsForPrompt(content.elements),
    });
    try {
      const raw = await options.llm!.call({ ...prompt, source: 'dgbook-slide-actions' });
      const parsed = parseActionsFromStructuredOutput(raw, validIds, {
        sceneType: 'slide',
        allowedActions: ['speech', 'spotlight', 'laser', 'play_video'],
        attachLastFocusToSpeech: true,
      });
      if (parsed.length > 0) return normalizeGeneratedActions(parsed, context.projectId, context.widgetId);
    } catch {
      // Fall through to deterministic fallback.
    }
  }
  return normalizeGeneratedActions(defaultActions(context.projectId, [...validIds]), context.projectId, context.widgetId);
}

export function buildLessonAnimationArtifact(
  context: DGBookGenerationContext,
  outline: SceneOutline,
  content: GeneratedSlideContent,
  actions: TeachingAction[],
): { artifact: LessonAnimationArtifact; scene: AnimationSlideScene; targets: LessonAnimationTarget[] } {
  const scene: AnimationSlideScene = {
    id: `${context.projectId}-generated-animation-scene`,
    title: outline.title,
    type: 'slide',
    description: outline.description,
    content: {
      type: 'slide',
      canvas: {
        id: `${context.projectId}-generated-slide`,
        width: 1000,
        height: 562,
        background: content.background ?? { type: 'solid', color: '#f8fafc' },
        theme: { backgroundColor: '#f8fafc', colors: ['#0f766e', '#2563eb', '#f59e0b'] },
        elements: content.elements,
      },
    },
    actions,
  };
  const targets = content.elements
    .filter((element) => element.role && element.role !== 'decor')
    .slice(0, 12)
    .map((element) => ({
      id: element.id,
      label: labelForElement(element),
      description: `${context.title} 的动画定位元素`,
      selector: `[data-animation-element-id="${element.id}"]`,
    }));
  const artifact: LessonAnimationArtifact = {
    type: 'animation-slide',
    version: 2,
    aspectRatio: '16:9',
    durationMs: Math.max(32000, actions.length * 2200),
    scene,
  };
  return { artifact, scene, targets };
}

export function buildPlaybackScenes(
  context: DGBookGenerationContext,
  actions: TeachingAction[],
  outline: SceneOutline,
): TeachingScene[] {
  return [
    {
      id: `${context.projectId}-generated-animation-review`,
      title: '示意动画审核',
      type: 'animation',
      order: 1,
      stageId: context.projectId,
      description: `DGBook teaching-stage generated playback for ${outline.title}`,
      actions: [
        {
          id: `${context.projectId}-generated-review-open`,
          type: 'widget_highlight',
          widgetId: context.widgetId,
          target: context.widgetId,
          title: '打开动画部件',
        },
        ...actions.map((action, index) => action.type.startsWith('widget_') ? { ...action, widgetId: context.widgetId } : {
          ...action,
          id: action.id || `${context.projectId}-generated-review-${String(index + 1).padStart(3, '0')}`,
          widgetId: action.widgetId ?? context.widgetId,
        }),
      ],
    },
  ];
}

function resolveLLM(options: GenerationOptions): LLMClient | undefined {
  if (options.llm) return options.llm;
  if (options.useLLM === false) return undefined;
  if (!hasUsableModelCredentials(options.model)) return undefined;
  return createLLMClient(options.model);
}

function shouldUseLLM(options: GenerationOptions): boolean {
  return options.useLLM !== false && Boolean(options.llm);
}

function sanitizeOutlines(raw: SceneOutline[], context: DGBookGenerationContext): SceneOutline[] {
  return raw.slice(0, 6).map((outline, index) => ({
    id: outline.id || `${context.projectId}-outline-${String(index + 1).padStart(2, '0')}`,
    type: outline.type === 'slide' ? 'slide' : 'slide',
    title: cleanText(outline.title || `${context.title} 动画场景`, 32),
    description: cleanText(outline.description || `${context.title} 的动画讲解场景`, 160),
    keyPoints: (outline.keyPoints?.length ? outline.keyPoints : fallbackKeyPoints(context)).slice(0, 5).map((point) => cleanText(point, 48)),
    teachingObjective: outline.teachingObjective ? cleanText(outline.teachingObjective, 90) : undefined,
    estimatedDuration: Number.isFinite(outline.estimatedDuration) ? outline.estimatedDuration : 60,
    order: index + 1,
    languageNote: outline.languageNote,
  }));
}

function fallbackOutlines(context: DGBookGenerationContext): SceneOutline[] {
  const keyPoints = fallbackKeyPoints(context);
  return [
    {
      id: `${context.projectId}-outline-01`,
      type: 'slide',
      title: `${context.title} 任务链路`,
      description: '把教材正文转换为输入、分析、验证、输出的网络优化闭环。',
      keyPoints,
      teachingObjective: '建立任务对象和证据链视角。',
      estimatedDuration: 70,
      order: 1,
    },
    {
      id: `${context.projectId}-outline-02`,
      type: 'slide',
      title: `${context.title} 指标证据`,
      description: '聚焦关键指标、表格、截图或信令字段，说明判断依据。',
      keyPoints: keyPoints.slice(0, 4),
      teachingObjective: '说明如何从证据到结论。',
      estimatedDuration: 80,
      order: 2,
    },
    {
      id: `${context.projectId}-outline-03`,
      type: 'slide',
      title: `${context.title} 动画复盘`,
      description: '用纯动画复盘任务流程和输出结果。',
      keyPoints: keyPoints.slice(0, 5),
      teachingObjective: '形成可复查的网优闭环。',
      estimatedDuration: 90,
      order: 3,
    },
  ];
}

function selectAnimationOutline(outlines: SceneOutline[]): SceneOutline {
  return outlines.find((outline) => /动画|复盘|流程|链路/.test(outline.title + outline.description)) ?? outlines[0]!;
}

function fallbackKeyPoints(context: DGBookGenerationContext): string[] {
  const points = extractDomainKeyPoints(context.sourceText);
  const domainBase = points.length > 0 ? points : ['DT/CQT 测试场景', 'RSRP 覆盖评估', 'SINR 质量分析', '切换事件定位', '采集路线复测', '信令流程核查'];
  return domainBase.slice(0, 6).map((item) => cleanText(item, 24));
}

const SHELL_HEADING_RE = /^(?:任务(?:导入|要求|实施|描述|目标|小结)|知识(?:准备|梳理)|学习目标|实训目标|背景介绍|操作步骤|成果提交|评价标准)$/;

const DOMAIN_POINT_RULES: Array<{ label: string; patterns: RegExp[] }> = [
  { label: 'DT/CQT 测试场景', patterns: [/\bDT\b/i, /\bCQT\b/i, /路测/, /定点测试/] },
  { label: 'RSRP 覆盖评估', patterns: [/\bRSRP\b/i, /参考信号接收功率/, /覆盖(?:弱|差|评估|分析)/] },
  { label: 'SINR 质量分析', patterns: [/\bSINR\b/i, /信干噪比/, /干扰(?:定位|分析|排查)?/, /质量(?:差|分析)/] },
  { label: '切换事件与邻区关系', patterns: [/切换/, /\bA[1-6]\b/i, /邻区/, /重选/] },
  { label: '测试路线规划', patterns: [/路线/, /测试(?:路线|路径|轨迹)/, /栅格/, /里程/] },
  { label: '数据采集与采样点', patterns: [/采集/, /采样点/, /测试数据/, /扫频/, /打点/] },
  { label: '优化后复测验证', patterns: [/复测/, /验证/, /回归测试/, /优化(?:后|效果)/] },
  { label: '信令流程与异常定位', patterns: [/信令/, /\bRRC\b/i, /\bNAS\b/i, /流程/, /失败原因/] },
  { label: 'PCI 与小区参数核查', patterns: [/\bPCI\b/i, /小区参数/, /频点/, /SSB/, /\bTA\b/i] },
  { label: '接入与业务指标判读', patterns: [/接入/, /掉线/, /速率/, /时延/, /吞吐率/, /成功率/] },
];

function extractDomainKeyPoints(sourceText: string): string[] {
  const bodyText = normalizeMdxBody(sourceText);
  const found = DOMAIN_POINT_RULES
    .map((rule, index) => ({
      label: rule.label,
      index,
      position: firstPatternPosition(bodyText, rule.patterns),
      hits: rule.patterns.reduce((sum, pattern) => sum + countMatches(bodyText, pattern), 0),
    }))
    .filter((item) => item.position >= 0)
    .sort((left, right) => left.position - right.position || right.hits - left.hits || left.index - right.index)
    .map((item) => item.label);

  const phrasePoints = extractKeywordPhrases(bodyText);
  return uniqueKeyPoints([...found, ...phrasePoints]).filter((point) => !isShellHeading(point));
}

function normalizeMdxBody(sourceText: string): string {
  return sourceText
    .replace(/^---[\s\S]*?\n---/m, ' ')
    .replace(/<SectionStep\b[^>]*>/gi, ' ')
    .replace(/<\/SectionStep>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{[\s\S]*?\}/g, ' ')
    .replace(/[`*_>#|[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractKeywordPhrases(bodyText: string): string[] {
  return bodyText
    .split(/[。！？；;.!?\n]/)
    .map((sentence) => cleanText(sentence, 36))
    .filter((sentence) => /DT|CQT|RSRP|SINR|切换|路线|采集|复测|信令/i.test(sentence))
    .filter((sentence) => !isShellHeading(sentence))
    .map(compactDomainPhrase)
    .filter(Boolean)
    .slice(0, 6);
}

function compactDomainPhrase(sentence: string): string {
  const match = sentence.match(/(?:DT|CQT|RSRP|SINR|切换|路线|采集|复测|信令|邻区|干扰|覆盖|接入|掉线|速率|时延)[^，、,：:\s]{0,10}/i);
  if (!match) return '';
  return cleanText(match[0], 18);
}

function firstPatternPosition(textValue: string, patterns: RegExp[]): number {
  const positions = patterns
    .map((pattern) => {
      pattern.lastIndex = 0;
      const match = pattern.exec(textValue);
      return match?.index ?? -1;
    })
    .filter((position) => position >= 0);
  return positions.length > 0 ? Math.min(...positions) : -1;
}

function countMatches(textValue: string, pattern: RegExp): number {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const matcher = new RegExp(pattern.source, flags);
  return [...textValue.matchAll(matcher)].length;
}

function uniqueKeyPoints(points: string[]): string[] {
  const seen = new Set<string>();
  return points.filter((point) => {
    const key = point.replace(/\s+/g, '').toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isShellHeading(value: string): boolean {
  return SHELL_HEADING_RE.test(cleanText(value, 32).replace(/\s+/g, ''));
}

function normalizeSlideContent(content: GeneratedSlideContent, context: DGBookGenerationContext): GeneratedSlideContent {
  const elements = content.elements
    .slice(0, 80)
    .map((element, index) => normalizeElement(element, `${context.projectId}-ai-element-${String(index + 1).padStart(2, '0')}`));
  if (elements.length < 30) return fallbackSlideContent(context, fallbackOutlines(context)[0]!);
  return { ...content, elements };
}

function fallbackSlideContent(context: DGBookGenerationContext, outline: SceneOutline): GeneratedSlideContent {
  const points = (outline.keyPoints.length ? outline.keyPoints : fallbackKeyPoints(context)).slice(0, 6);
  while (points.length < 6) points.push(`环节${points.length + 1}`);
  const elements: AnimationPPTElement[] = [
    shape(`${context.projectId}-bg`, 0, 0, 1000, 562, '#f8fafc', { role: 'decor', outlineColor: '#f8fafc' }),
    shape(`${context.projectId}-top-band`, 38, 28, 924, 82, '#ffffff', { role: 'decor', outlineColor: '#d8e0ea' }),
    text(`${context.projectId}-title`, 60, 44, 610, 48, `<p style="font-size:28px;font-weight:900;color:#0f172a;">${escapeHtml(cleanText(context.title, 22))}</p>`, { role: 'title', maxLines: 1, minFontSize: 20 }),
    text(`${context.projectId}-scenario`, 704, 46, 224, 44, '<p style="font-size:14px;font-weight:850;color:#0f766e;text-align:right;">5G 网络优化闭环</p>', { role: 'subtitle' }),
    shape(`${context.projectId}-input-band`, 58, 146, 266, 238, '#ecfeff', { role: 'decor', outlineColor: '#a5f3fc' }),
    shape(`${context.projectId}-analysis-band`, 367, 146, 266, 238, '#f5f3ff', { role: 'decor', outlineColor: '#ddd6fe' }),
    shape(`${context.projectId}-output-band`, 676, 146, 266, 238, '#f0fdf4', { role: 'decor', outlineColor: '#bbf7d0' }),
    text(`${context.projectId}-input-label`, 80, 164, 120, 26, '<p style="font-size:13px;font-weight:900;color:#0e7490;">输入</p>', { role: 'subtitle', maxLines: 1 }),
    text(`${context.projectId}-analysis-label`, 389, 164, 120, 26, '<p style="font-size:13px;font-weight:900;color:#6d28d9;">分析</p>', { role: 'subtitle', maxLines: 1 }),
    text(`${context.projectId}-output-label`, 698, 164, 120, 26, '<p style="font-size:13px;font-weight:900;color:#15803d;">输出</p>', { role: 'subtitle', maxLines: 1 }),
  ];

  const slots: Array<[number, number]> = [[92, 246], [250, 190], [425, 246], [596, 190], [760, 246], [424, 414]];
  points.forEach((point, index) => {
    const slot = slots[index] ?? slots[slots.length - 1]!;
    const color = ['#0f766e', '#2563eb', '#7c3aed', '#f59e0b', '#16a34a', '#dc2626'][index] ?? '#0f766e';
    elements.push(shape(`${context.projectId}-step-${String(index + 1).padStart(2, '0')}`, slot[0], slot[1], 126, 82, '#ffffff', { role: 'step', outlineColor: color }));
    elements.push(text(`${context.projectId}-step-${String(index + 1).padStart(2, '0')}-text`, slot[0] + 10, slot[1] + 12, 106, 56, `<p style="font-size:15px;font-weight:900;color:#0f172a;text-align:center;">${escapeHtml(cleanText(point, 10))}</p><p style="font-size:11px;color:#475569;text-align:center;">${index + 1}</p>`, { role: 'caption', maxLines: 2, minFontSize: 10 }));
    if (index > 0) {
      const previous = slots[index - 1] ?? slots[0]!;
      elements.push(line(`${context.projectId}-flow-${String(index).padStart(2, '0')}`, [previous[0] + 126, previous[1] + 41], [slot[0], slot[1] + 41], color, [(previous[0] + slot[0]) / 2, Math.min(previous[1], slot[1]) - 20]));
    }
  });

  elements.push(
    shape(`${context.projectId}-model-card`, 374, 400, 252, 92, '#fff7ed', { role: 'model', outlineColor: '#fdba74' }),
    text(`${context.projectId}-model-title`, 394, 412, 208, 28, '<p style="font-size:16px;font-weight:900;color:#9a3412;">核心模型</p>', { role: 'subtitle', maxLines: 1 }),
    text(`${context.projectId}-model-formula`, 394, 442, 208, 32, '<p style="font-size:17px;font-weight:900;color:#9a3412;">证据 x 判断 x 复测</p>', { role: 'caption', maxLines: 1, minFontSize: 12 }),
    table(`${context.projectId}-evidence-table`, 70, 404, 270, 92),
    chart(`${context.projectId}-metric-chart`, 672, 404, 250, 92),
    shape(`${context.projectId}-caption-strip`, 146, 510, 708, 32, '#ffffff', { role: 'decor', outlineColor: '#d8e0ea' }),
    text(`${context.projectId}-caption`, 166, 514, 668, 24, '<p style="font-size:15px;font-weight:850;color:#0f5132;text-align:center;">画面只保留可视化链路，讲解由播放条统一控制。</p>', { role: 'caption', maxLines: 1, minFontSize: 11 }),
  );

  for (let index = 0; index < 8; index++) {
    elements.push(shape(`${context.projectId}-decor-${String(index + 1).padStart(2, '0')}`, 838 + index * 14, 30, 8, 8, index === 0 ? '#0f766e' : '#cbd5e1', { role: 'decor', outlineColor: index === 0 ? '#0f766e' : '#cbd5e1' }));
  }

  return { background: { type: 'solid', color: '#f8fafc' }, elements };
}

function labelForElement(element: AnimationPPTElement): string {
  if (element.type === 'text') return cleanText(element.content.replace(/<[^>]*>/g, ''), 16);
  if (element.role) return element.role;
  return element.id;
}

function referencesFor(title: string) {
  if (title.includes('信令')) {
    return [
      { label: '3GPP TS 23.502', href: 'https://www.3gpp.org/DynaReport/23502.htm', note: '信令流程参考' },
      { label: '3GPP TS 38.331', href: 'https://www.3gpp.org/DynaReport/38331.htm', note: 'RRC 参考' },
    ];
  }
  if (title.includes('性能') || title.includes('测试') || title.includes('指标')) {
    return [
      { label: '3GPP TS 38.215', href: 'https://portal.3gpp.org/desktopmodules/Specifications/SpecificationDetails.aspx?specificationId=3217', note: '测量指标参考' },
      { label: '3GPP TS 38.300', href: 'https://portal.3gpp.org/desktopmodules/Specifications/SpecificationDetails.aspx?specificationId=3191', note: 'NR 总体参考' },
    ];
  }
  return [{ label: '3GPP TS 38.300', href: 'https://portal.3gpp.org/desktopmodules/Specifications/SpecificationDetails.aspx?specificationId=3191', note: '5G 系统参考' }];
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
