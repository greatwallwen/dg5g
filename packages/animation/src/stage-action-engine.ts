import type { AnimationTimelineCue, TeachingAction, TeachingActionType } from './types';

export interface StageActionExecutionContext {
  sceneId?: string;
  currentTimeMs?: number;
  signal?: AbortSignal;
}

export interface StageActionExecutionResult {
  actionId: string;
  type: TeachingActionType;
  blocking: boolean;
  ok: boolean;
  durationMs?: number;
  error?: string;
}

export interface StageActionEngineCallbacks {
  onSpeech?: (action: TeachingAction, context: StageActionExecutionContext) => Promise<void> | void;
  onCaption?: (caption: string, action: TeachingAction, context: StageActionExecutionContext) => Promise<void> | void;
  onSpotlight?: (action: TeachingAction, context: StageActionExecutionContext) => Promise<void> | void;
  onLaser?: (action: TeachingAction, context: StageActionExecutionContext) => Promise<void> | void;
  onHighlight?: (action: TeachingAction, context: StageActionExecutionContext) => Promise<void> | void;
  onVideo?: (action: TeachingAction, context: StageActionExecutionContext) => Promise<void> | void;
  onWidgetAction?: (action: TeachingAction, context: StageActionExecutionContext) => Promise<void> | void;
  onTimelineCue?: (cue: AnimationTimelineCue, action: TeachingAction, context: StageActionExecutionContext) => Promise<void> | void;
  onClearEffects?: (action: TeachingAction, context: StageActionExecutionContext) => Promise<void> | void;
  wait?: (durationMs: number, context: StageActionExecutionContext) => Promise<void> | void;
}

export class StageActionEngine {
  private callbacks: StageActionEngineCallbacks;
  private stopped = false;

  constructor(callbacks: StageActionEngineCallbacks = {}) {
    this.callbacks = callbacks;
  }

  updateCallbacks(callbacks: StageActionEngineCallbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  stop() {
    this.stopped = true;
  }

  reset() {
    this.stopped = false;
  }

  async execute(action: TeachingAction, context: StageActionExecutionContext = {}): Promise<StageActionExecutionResult> {
    if (this.stopped || context.signal?.aborted) {
      return result(action, false, true);
    }

    try {
      const blocking = await this.dispatch(action, context);
      return result(action, blocking, true, action.durationMs);
    } catch (error) {
      return result(action, isBlockingAction(action.type), false, action.durationMs, error instanceof Error ? error.message : String(error));
    }
  }

  async executeMany(actions: TeachingAction[], context: StageActionExecutionContext = {}) {
    const results: StageActionExecutionResult[] = [];
    for (const action of actions) {
      if (this.stopped || context.signal?.aborted) break;
      const output = await this.execute(action, context);
      results.push(output);
    }
    return results;
  }

  private async dispatch(action: TeachingAction, context: StageActionExecutionContext): Promise<boolean> {
    switch (action.type) {
      case 'speech':
        if (action.caption) await this.callbacks.onCaption?.(action.caption, action, context);
        await this.callbacks.onSpeech?.(action, context);
        await this.waitForActionDuration(action, context);
        return true;
      case 'spotlight':
        await this.callbacks.onSpotlight?.(action, context);
        await this.waitForOptionalDelay(action, context);
        return false;
      case 'laser':
        await this.callbacks.onLaser?.(action, context);
        await this.waitForOptionalDelay(action, context);
        return false;
      case 'play_video':
        await this.callbacks.onVideo?.(action, context);
        return true;
      case 'widget_timelineCue':
        await this.callbacks.onTimelineCue?.(actionToCue(action), action, context);
        return false;
      case 'widget_highlight':
        await this.callbacks.onHighlight?.(action, context);
        await withActionTimeout(this.callbacks.onWidgetAction?.(action, context), action.timeoutMs);
        return false;
      case 'widget_setState':
      case 'widget_annotation':
      case 'widget_reveal':
        await withActionTimeout(this.callbacks.onWidgetAction?.(action, context), action.timeoutMs);
        return false;
      default:
        await this.callbacks.onClearEffects?.(action, context);
        return false;
    }
  }

  private async waitForActionDuration(action: TeachingAction, context: StageActionExecutionContext) {
    const durationMs = Number(action.durationMs ?? 0);
    if (durationMs > 0) await this.callbacks.wait?.(durationMs, context);
  }

  private async waitForOptionalDelay(action: TeachingAction, context: StageActionExecutionContext) {
    const delayMs = Number(action.delayMs ?? 0);
    if (delayMs > 0) await this.callbacks.wait?.(delayMs, context);
  }
}

export function isBlockingAction(type: TeachingActionType) {
  return type === 'speech' || type === 'play_video';
}

function actionToCue(action: TeachingAction): AnimationTimelineCue {
  const effect = readTimelineEffect(action.content ?? action.state?.effect) ?? 'spotlight';
  const targets = readTargets(action.state?.targets ?? action.elementId ?? action.target ?? action.widgetId);
  return {
    id: action.id,
    effect,
    targets,
    durationMs: action.durationMs,
    holdMs: action.holdMs,
    payload: { ...action.state, label: action.label, content: action.content },
  };
}

function readTimelineEffect(value: unknown): AnimationTimelineCue['effect'] | undefined {
  return typeof value === 'string' && value.length > 0 ? value as AnimationTimelineCue['effect'] : undefined;
}

function readTargets(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => (typeof item === 'string' ? item : '')).filter(Boolean);
  return typeof value === 'string' && value.length > 0 ? [value] : [];
}

async function withActionTimeout(task: Promise<void> | void | undefined, timeoutMs?: number) {
  if (!task) return;
  const timeout = Number(timeoutMs ?? 0);
  if (!timeout) {
    await task;
    return;
  }
  await Promise.race([
    task,
    new Promise<void>((resolve) => window.setTimeout(resolve, timeout)),
  ]);
}

function result(
  action: TeachingAction,
  blocking: boolean,
  ok: boolean,
  durationMs?: number,
  error?: string,
): StageActionExecutionResult {
  return {
    actionId: action.id,
    type: action.type,
    blocking,
    ok,
    ...(durationMs ? { durationMs } : {}),
    ...(error ? { error } : {}),
  };
}
