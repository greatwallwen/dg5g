import type { GenerationModelOptions, LLMCall, LLMClient, ThinkingConfig } from './types.ts';

declare const process: { env?: Record<string, string | undefined> } | undefined;

export type ProviderKind = 'openai-compatible' | 'openai' | 'anthropic' | 'google';

export interface ModelInfo {
  id: string;
  label: string;
  capabilities?: {
    vision?: boolean;
    thinking?: boolean;
  };
}

export interface ProviderInfo {
  id: string;
  label: string;
  kind: ProviderKind;
  defaultModel: string;
  defaultBaseUrl?: string;
  apiKeyEnv?: string;
  models: ModelInfo[];
}

export const PROVIDERS: Record<string, ProviderInfo> = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    kind: 'openai-compatible',
    defaultModel: 'gpt-5.4-mini',
    defaultBaseUrl: 'https://api.openai.com/v1',
    apiKeyEnv: 'OPENAI_API_KEY',
    models: [
      { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', capabilities: { vision: true, thinking: true } },
      { id: 'gpt-5.4', label: 'GPT-5.4', capabilities: { vision: true, thinking: true } },
      { id: 'gpt-4.1', label: 'GPT-4.1', capabilities: { vision: true } },
    ],
  },
  dashscope: {
    id: 'dashscope',
    label: 'DashScope OpenAI Compatible',
    kind: 'openai-compatible',
    defaultModel: 'qwen-plus',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKeyEnv: 'DASHSCOPE_API_KEY',
    models: [
      { id: 'qwen-plus', label: 'Qwen Plus', capabilities: { vision: false } },
      { id: 'qwen-max', label: 'Qwen Max', capabilities: { vision: false } },
      { id: 'qwen-vl-plus', label: 'Qwen VL Plus', capabilities: { vision: true } },
    ],
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    kind: 'openai-compatible',
    defaultModel: 'openai/gpt-4.1',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    models: [{ id: 'openai/gpt-4.1', label: 'OpenAI GPT-4.1 via OpenRouter', capabilities: { vision: true } }],
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama',
    kind: 'openai-compatible',
    defaultModel: 'qwen2.5:14b',
    defaultBaseUrl: 'http://127.0.0.1:11434/v1',
    models: [{ id: 'qwen2.5:14b', label: 'Qwen 2.5 14B' }],
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    kind: 'anthropic',
    defaultModel: 'claude-sonnet-4-5',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    models: [{ id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', capabilities: { vision: true, thinking: true } }],
  },
};

export interface ResolvedModelConfig {
  provider: ProviderInfo;
  providerId: string;
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
  thinking?: ThinkingConfig;
}

export function listProviders(): ProviderInfo[] {
  return Object.values(PROVIDERS);
}

export function parseModelString(modelString?: string): { providerId: string; modelId: string } {
  const value = modelString || env('DEFAULT_MODEL') || 'openai/gpt-5.4-mini';
  const slash = value.indexOf('/');
  if (slash > 0) {
    const providerId = value.slice(0, slash);
    if (PROVIDERS[providerId]) return { providerId, modelId: value.slice(slash + 1) };
  }
  return { providerId: 'openai', modelId: value };
}

export function resolveModelConfig(options: GenerationModelOptions = {}): ResolvedModelConfig {
  const parsed = parseModelString(options.modelString);
  const provider = PROVIDERS[parsed.providerId] ?? PROVIDERS.openai;
  if (!provider) throw new Error('No DGBook generation provider registry is available.');
  const apiKey = options.apiKey || (provider.apiKeyEnv ? env(provider.apiKeyEnv) : undefined);
  const baseUrl = options.baseUrl || provider.defaultBaseUrl;
  return {
    provider,
    providerId: provider.id,
    modelId: parsed.modelId || provider.defaultModel,
    apiKey,
    baseUrl,
    thinking: options.thinking,
  };
}

export function createLLMClient(options: GenerationModelOptions = {}): LLMClient {
  const config = resolveModelConfig(options);
  return {
    async call(input: LLMCall): Promise<string> {
      return callLLM(config, input);
    },
  };
}

export function hasUsableModelCredentials(options: GenerationModelOptions = {}): boolean {
  const config = resolveModelConfig(options);
  return config.provider.id === 'ollama' || Boolean(config.apiKey);
}

export async function callLLM(config: ResolvedModelConfig, input: LLMCall): Promise<string> {
  if (config.provider.kind !== 'openai-compatible') {
    throw new Error(`Provider ${config.provider.id} is registered but this DGBook adapter currently executes OpenAI-compatible chat completions only.`);
  }
  if (!config.baseUrl) throw new Error(`Provider ${config.provider.id} has no baseUrl.`);
  if (config.provider.id !== 'ollama' && !config.apiKey) {
    throw new Error(`Provider ${config.provider.id} requires an API key.`);
  }

  const response = await fetch(`${config.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.modelId,
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.user },
      ],
      temperature: 0.35,
      ...(config.thinking?.enabled === false ? {} : reasoningPayload(config.thinking)),
    }),
  });
  if (!response.ok) throw new Error(`LLM ${input.source ?? 'generation'} failed: ${response.status} ${await response.text()}`);
  const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }>; output_text?: string };
  const content = json.choices?.[0]?.message?.content ?? json.output_text ?? '';
  if (!content.trim()) throw new Error(`LLM ${input.source ?? 'generation'} returned empty content.`);
  return content;
}

function reasoningPayload(thinking?: ThinkingConfig): Record<string, unknown> {
  if (!thinking || thinking.mode === 'disabled') return {};
  if (thinking.effort) return { reasoning_effort: thinking.effort === 'xhigh' ? 'high' : thinking.effort };
  return {};
}

function env(key: string): string | undefined {
  return typeof process === 'undefined' ? undefined : process.env?.[key];
}
