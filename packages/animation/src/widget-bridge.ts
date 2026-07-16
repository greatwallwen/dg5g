export type WidgetMessageResult = {
  acknowledged: boolean;
  timedOut?: boolean;
  widgetId?: string;
  type?: string;
};

export type WidgetActionDetail = {
  requestId: string;
  widgetId?: string;
  type: string;
  payload: Record<string, unknown>;
};

type WidgetActionHandler = (detail: WidgetActionDetail) => void | Promise<void>;

type PendingWidgetAction = {
  detail: WidgetActionDetail;
  resolve: (result: WidgetMessageResult) => void;
  timeoutId: number;
};

type WidgetBridgeState = {
  handlers: Map<string, Set<WidgetActionHandler>>;
  pending: Map<string, PendingWidgetAction[]>;
};

const DEFAULT_WIDGET_TIMEOUT_MS = 650;

export const WIDGET_ACTION_RUN_CUE = 'RUN_CUE';
export const WIDGET_ACTION_SET_TIMELINE_TIME = 'SET_TIMELINE_TIME';
export const WIDGET_ACTION_RESET_STAGE = 'RESET_STAGE';
export const WIDGET_ACTION_PAUSE_TIMELINE = 'PAUSE_TIMELINE';
export const WIDGET_ACTION_RESUME_TIMELINE = 'RESUME_TIMELINE';
export const WIDGET_ACTION_CLEAR_EFFECTS = 'CLEAR_EFFECTS';

export function registerWidgetActionHandler(widgetId: string, handler: WidgetActionHandler): () => void {
  const state = getWidgetBridgeState();
  const handlers = state.handlers.get(widgetId) ?? new Set<WidgetActionHandler>();
  handlers.add(handler);
  state.handlers.set(widgetId, handlers);
  flushPendingWidgetActions(widgetId);
  return () => {
    handlers.delete(handler);
    if (handlers.size === 0) state.handlers.delete(widgetId);
  };
}

export function sendWidgetAction(
  widgetId: string | undefined,
  type: string,
  payload: Record<string, unknown> = {},
  options: { timeoutMs?: number } = {},
): Promise<WidgetMessageResult> {
  if (typeof window === 'undefined') return Promise.resolve({ acknowledged: false, widgetId, type });
  if (!widgetId) return Promise.resolve({ acknowledged: false, timedOut: true, widgetId, type });

  const detail: WidgetActionDetail = {
    requestId: `widget-action-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    widgetId,
    type,
    payload,
  };
  const handlers = collectWidgetHandlers(widgetId);
  if (handlers.length > 0) return dispatchToWidgetHandlers(detail, handlers, options.timeoutMs ?? DEFAULT_WIDGET_TIMEOUT_MS);

  return new Promise((resolve) => {
    const timeoutId = window.setTimeout(() => {
      const state = getWidgetBridgeState();
      state.pending.set(widgetId, (state.pending.get(widgetId) ?? []).filter((item) => item.detail.requestId !== detail.requestId));
      resolve({ acknowledged: false, timedOut: true, widgetId, type });
    }, options.timeoutMs ?? DEFAULT_WIDGET_TIMEOUT_MS);
    const state = getWidgetBridgeState();
    const pending = state.pending.get(widgetId) ?? [];
    pending.push({ detail, resolve, timeoutId });
    state.pending.set(widgetId, pending);
  });
}

function flushPendingWidgetActions(widgetId: string): void {
  const state = getWidgetBridgeState();
  const pending = state.pending.get(widgetId) ?? [];
  if (pending.length === 0) return;
  state.pending.delete(widgetId);
  const handlers = collectWidgetHandlers(widgetId);
  for (const item of pending) {
    window.clearTimeout(item.timeoutId);
    void dispatchToWidgetHandlers(item.detail, handlers, DEFAULT_WIDGET_TIMEOUT_MS).then(item.resolve);
  }
}

async function dispatchToWidgetHandlers(
  detail: WidgetActionDetail,
  handlers: WidgetActionHandler[],
  timeoutMs: number,
): Promise<WidgetMessageResult> {
  let timedOut = false;
  await Promise.race([
    Promise.all(handlers.map((handler) => Promise.resolve(handler(detail)))),
    new Promise<void>((resolve) => {
      window.setTimeout(() => {
        timedOut = true;
        resolve();
      }, timeoutMs);
    }),
  ]);
  return { acknowledged: !timedOut, timedOut, widgetId: detail.widgetId, type: detail.type };
}

function collectWidgetHandlers(widgetId: string | undefined): WidgetActionHandler[] {
  const state = getWidgetBridgeState();
  if (!widgetId) return [...state.handlers.values()].flatMap((handlers) => [...handlers]);
  return [...(state.handlers.get(widgetId) ?? [])];
}

function getWidgetBridgeState(): WidgetBridgeState {
  const globalObject = globalThis as typeof globalThis & { __dgbookWidgetBridge?: WidgetBridgeState };
  if (!globalObject.__dgbookWidgetBridge) {
    globalObject.__dgbookWidgetBridge = { handlers: new Map(), pending: new Map() };
  }
  return globalObject.__dgbookWidgetBridge;
}
