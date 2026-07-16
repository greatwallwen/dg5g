import type { TeachingAction, TeachingActionType } from '@dgbook/animation';
import { parseJsonArrayResponse, stableId } from './json.ts';

export interface ParseActionsOptions {
  sceneType?: 'slide' | 'quiz' | 'interactive' | 'pbl';
  allowedActions?: Iterable<TeachingActionType>;
  attachLastFocusToSpeech?: boolean;
}

const ALLOWED_ACTIONS = new Set<TeachingActionType>([
  'speech',
  'spotlight',
  'laser',
  'play_video',
  'widget_highlight',
  'widget_setState',
  'widget_timelineCue',
  'widget_annotation',
  'widget_reveal',
]);

const SLIDE_ONLY_ACTIONS = new Set<TeachingActionType>(['spotlight', 'laser', 'play_video']);

export function parseActionsFromStructuredOutput(
  response: string,
  validElementIds: Set<string>,
  options: ParseActionsOptions = {},
): TeachingAction[] {
  const items = parseStructuredItems(response);
  const allowedActions = new Set(options.allowedActions ?? ALLOWED_ACTIONS);
  const attachFocus = options.attachLastFocusToSpeech ?? true;
  const actions: TeachingAction[] = [];
  let lastFocusTarget: string | undefined;

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    if (item.type === 'text') {
      const text = String(item.content ?? '').trim();
      const target = targetFrom(item) ?? (attachFocus ? lastFocusTarget : undefined);
      if (text) actions.push(speech(text, actions.length, target));
      continue;
    }
    const directType = String(item.type ?? '');
    const name = directType !== 'action' && ALLOWED_ACTIONS.has(directType as TeachingActionType)
      ? directType
      : String(item.name ?? item.tool_name ?? '');
    if (!ALLOWED_ACTIONS.has(name as TeachingActionType)) continue;
    if (!allowedActions.has(name as TeachingActionType)) continue;
    if (options.sceneType && options.sceneType !== 'slide' && SLIDE_ONLY_ACTIONS.has(name as TeachingActionType)) continue;

    const params = isRecord(item.params) ? item.params : isRecord(item.parameters) ? item.parameters : {};
    const mergedParams = { ...item, ...params };
    const target = targetFrom(mergedParams);
    const widgetId = stringOrUndefined(mergedParams.widgetId);

    if (name === 'speech') {
      const text = stringOrUndefined(mergedParams.spokenText)
        ?? stringOrUndefined(mergedParams.text)
        ?? stringOrUndefined(mergedParams.content);
      if (text) actions.push(speech(text, actions.length, target ?? (attachFocus ? lastFocusTarget : undefined)));
      continue;
    }

    if (target && !isKnownTarget(target, widgetId, validElementIds)) continue;
    if (SLIDE_ONLY_ACTIONS.has(name as TeachingActionType) && !target) continue;

    actions.push({
      id: String(item.action_id ?? item.tool_id ?? stableId('action', actions.length)),
      type: name as TeachingActionType,
      title: stringOrUndefined(mergedParams.title),
      elementId: target,
      target,
      widgetId,
      color: stringOrUndefined(mergedParams.color),
      content: stringOrUndefined(mergedParams.content),
      focusPolicy: name === 'spotlight' || name === 'laser' ? 'hold' : undefined,
      clearFocusOnEnd: name === 'spotlight' || name === 'laser' ? false : undefined,
    });

    if ((name === 'spotlight' || name === 'laser') && target) lastFocusTarget = target;
  }
  return actions;
}

export function normalizeGeneratedActions(actions: TeachingAction[], projectId: string, widgetId: string): TeachingAction[] {
  return actions.map((action, index) => normalizeGeneratedAction(action, index, projectId, widgetId));
}

function normalizeGeneratedAction(action: TeachingAction, index: number, projectId: string, widgetId: string): TeachingAction {
  if (action.type === 'speech') {
    const text = action.spokenText ?? action.text ?? action.content ?? '';
    return {
      ...action,
      id: action.id || `${projectId}-ai-speech-${String(index + 1).padStart(3, '0')}`,
      title: action.title || '\u8bb2\u89e3',
      speakerId: action.speakerId ?? (index % 2 ? 'engineer' : 'teacher'),
      text,
      spokenText: action.spokenText ?? text,
      caption: action.caption ?? text.slice(0, 72),
      displayText: action.displayText ?? text.slice(0, 96),
      audioId: action.audioId ?? `${projectId}-ai-speech-${String(index + 1).padStart(3, '0')}`,
      elementId: action.elementId ?? action.target,
      target: action.target ?? action.elementId,
    };
  }
  if (action.type.startsWith('widget_')) return { ...action, widgetId: action.widgetId ?? widgetId };
  if (action.type === 'spotlight' || action.type === 'laser') {
    return { ...action, focusPolicy: action.focusPolicy ?? 'hold', clearFocusOnEnd: action.clearFocusOnEnd ?? false };
  }
  return action;
}

export function defaultActions(projectId: string, elementIds: string[]): TeachingAction[] {
  return buildDefaultActions(projectId, elementIds);
}

function speech(textValue: string, index: number, elementId?: string): TeachingAction {
  return makeSpeech(textValue, index, elementId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseStructuredItems(response: string): Array<Record<string, unknown>> {
  const parsed = parseJsonArrayResponse<Record<string, unknown>>(response);
  if (parsed.length) return parsed;

  const candidate = extractArrayCandidate(response);
  if (!candidate) return [];

  for (const value of repairCandidates(candidate)) {
    try {
      const items = JSON.parse(value);
      if (Array.isArray(items)) return items.filter(isRecord);
    } catch {
      // Try the next repair candidate.
    }
  }
  return [];
}

function extractArrayCandidate(value: string): string | null {
  const start = value.indexOf('[');
  if (start < 0) return null;
  const end = value.lastIndexOf(']');
  return end > start ? value.slice(start, end + 1) : `${value.slice(start)}]`;
}

function repairCandidates(value: string): string[] {
  const base = value
    .trim()
    .replace(/^\uFEFF/, '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
  return [...new Set([base, base.replace(/,\s*$/, ']')])];
}

function targetFrom(params: Record<string, unknown>): string | undefined {
  return stringOrUndefined(params.elementId) ?? stringOrUndefined(params.target);
}

function stringOrUndefined(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function isKnownTarget(target: string, widgetId: string | undefined, validElementIds: Set<string>): boolean {
  return validElementIds.has(target) || Boolean(widgetId && (widgetId === target || widgetId.includes(target)));
}

function buildDefaultActions(projectId: string, elementIds: string[]): TeachingAction[] {
  const primaryTargets = elementIds.filter((id) => /-(title|step-\d+|caption|metric-chart|evidence-table)/.test(id)).slice(0, 8);
  const titleTarget = primaryTargets[0] ?? `${projectId}-title`;
  const actions: TeachingAction[] = [{
    id: stableId(`${projectId}-focus`, 0),
    type: 'spotlight',
    elementId: titleTarget,
    target: titleTarget,
    color: '#0f766e',
    title: '\u5bfc\u5b66\u91cd\u70b9',
    focusPolicy: 'hold',
    clearFocusOnEnd: false,
  }, makeSpeech('\u5148\u5efa\u7acb\u672c\u8282\u8bfe\u7684\u77e5\u8bc6\u89c6\u89d2\uff0c\u518d\u6cbf\u7740\u8bc1\u636e\u3001\u5206\u6790\u3001\u9a8c\u8bc1\u4e09\u4e2a\u73af\u8282\u89c2\u5bdf\u7f51\u7edc\u4f18\u5316\u95ed\u73af\u3002', 1, titleTarget)];

  primaryTargets.forEach((target, index) => {
    actions.push({
      id: stableId(`${projectId}-focus`, index + 1),
      type: index % 2 ? 'laser' : 'spotlight',
      elementId: target,
      target,
      color: index % 2 ? '#2563eb' : '#0f766e',
      title: `${'\u805a\u7126'} ${index + 1}`,
      focusPolicy: 'hold',
      clearFocusOnEnd: false,
    });
    actions.push(makeSpeech(`\u8fd9\u91cc\u91cd\u70b9\u770b\u7b2c ${index + 1} \u4e2a\u5173\u952e\u5bf9\u8c61\uff0c\u5b83\u5bf9\u5e94\u6559\u6750\u4e2d\u7684\u4efb\u52a1\u8bc1\u636e\u3001\u5224\u65ad\u4f9d\u636e\u6216\u8f93\u51fa\u7ed3\u679c\u3002`, actions.length, target));
  });
  return actions;
}

function makeSpeech(textValue: string, index: number, elementId?: string): TeachingAction {
  return {
    id: stableId('speech', index),
    type: 'speech',
    title: '\u8bb2\u89e3',
    text: textValue,
    spokenText: textValue,
    caption: textValue.slice(0, 72),
    displayText: textValue.slice(0, 96),
    audioId: stableId('speech-audio', index),
    speakerId: index % 2 ? 'engineer' : 'teacher',
    elementId,
    target: elementId,
  };
}
