import { Logger } from '@nestjs/common';
import type { AiProvider, CompletionRequest, CompletionResult, ProviderId } from './ai-provider';
import { AI_TIMEOUT_MS, sendJson } from './http';

export const MAX_OUTPUT_TOKENS = 8192;

export interface CompatConfig {
  id: Exclude<ProviderId, 'groq' | 'anthropic'>;
  baseUrl: string; // https only, a constant, never user input
  jsonMode: boolean;
  sendTemperature: boolean;
  maxTokensField: 'max_tokens' | 'max_completion_tokens';
  keepModel: (id: string) => boolean;
  normaliseModel: (id: string) => string;
}

export const OPENAI: CompatConfig = {
  id: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  jsonMode: true,
  sendTemperature: false,
  maxTokensField: 'max_completion_tokens',
  keepModel: (id) =>
    /^(gpt-|o\d|chatgpt-)/.test(id) &&
    !/(audio|realtime|transcribe|tts|image|embedding|moderation|search)/.test(id),
  normaliseModel: (id) => id,
};

export const GOOGLE: CompatConfig = {
  id: 'google',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
  jsonMode: true,
  sendTemperature: true,
  maxTokensField: 'max_tokens',
  keepModel: (id) => /^gemini/.test(id),
  normaliseModel: (id) => id.replace(/^models\//, ''),
};

export const OPENROUTER: CompatConfig = {
  id: 'openrouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  jsonMode: false,
  sendTemperature: true,
  maxTokensField: 'max_tokens',
  keepModel: () => true,
  normaliseModel: (id) => id,
};

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** Provider error for listModels: the status only, never the key or the response body. */
export function providerRejected(status: number): Error & { status: number } {
  return Object.assign(new Error('provider rejected the request'), { status });
}

export class OpenAiCompatibleProvider implements AiProvider {
  private readonly logger = new Logger('AiClientService');

  constructor(private readonly config: CompatConfig) {}

  get id(): ProviderId {
    return this.config.id;
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const { config } = this;
    const response = await sendJson({
      provider: config.id,
      context: request.context,
      model: request.model,
      url: `${config.baseUrl}/chat/completions`,
      headers: {
        Authorization: `Bearer ${request.apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      payload: {
        model: request.model,
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.user },
        ],
        [config.maxTokensField]: MAX_OUTPUT_TOKENS,
        ...(config.sendTemperature ? { temperature: 0.2 } : {}),
        ...(config.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      },
      signal: request.signal,
      logger: this.logger,
      usage: (json) => {
        const usage = (json as ChatResponse).usage;

        return { prompt: usage?.prompt_tokens ?? null, completion: usage?.completion_tokens ?? null };
      },
    });

    return {
      ok: response.ok,
      status: response.status,
      content: response.ok ? ((response.json as ChatResponse).choices?.[0]?.message?.content ?? '') : null,
      errorBody: response.ok ? null : response.body,
    };
  }

  async listModels(apiKey: string, signal?: AbortSignal): Promise<string[]> {
    const { config } = this;
    const response = await fetch(`${config.baseUrl}/models`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      redirect: 'error',
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(AI_TIMEOUT_MS)])
        : AbortSignal.timeout(AI_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw providerRejected(response.status);
    }

    const body = (await response.json()) as { data?: { id?: string }[] };
    const ids = (body.data ?? [])
      .map((model) => config.normaliseModel(model.id ?? ''))
      .filter((id) => id !== '' && config.keepModel(id));

    return [...new Set(ids)].sort();
  }
}
