import { Logger } from '@nestjs/common';
import type { AiProvider, CompletionRequest, CompletionResult } from './ai-provider';
import { AI_TIMEOUT_MS, sendJson } from './http';
import { MAX_OUTPUT_TOKENS, providerRejected } from './openai-compatible.provider';

const BASE = 'https://api.anthropic.com/v1';
const VERSION = '2023-06-01';

interface MessagesResponse {
  content?: { type?: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

/**
 * Anthropic Messages API. There is no JSON mode here; `extractJson` in the
 * caller already strips fences and prose.
 */
export class AnthropicProvider implements AiProvider {
  readonly id = 'anthropic' as const;
  private readonly logger = new Logger('AiClientService');

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const response = await sendJson({
      provider: 'anthropic',
      context: request.context,
      model: request.model,
      url: `${BASE}/messages`,
      headers: {
        'x-api-key': request.apiKey,
        'anthropic-version': VERSION,
        'content-type': 'application/json',
      },
      payload: {
        model: request.model,
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: 0.2,
        system: request.system,
        messages: [{ role: 'user', content: request.user }],
      },
      signal: request.signal,
      logger: this.logger,
      usage: (json) => {
        const usage = (json as MessagesResponse).usage;

        return { prompt: usage?.input_tokens ?? null, completion: usage?.output_tokens ?? null };
      },
    });

    const text = ((response.json as MessagesResponse).content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('');

    return {
      ok: response.ok,
      status: response.status,
      content: response.ok ? text : null,
      errorBody: response.ok ? null : response.body,
    };
  }

  async listModels(apiKey: string, signal?: AbortSignal): Promise<string[]> {
    const response = await fetch(`${BASE}/models?limit=100`, {
      method: 'GET',
      headers: { 'x-api-key': apiKey, 'anthropic-version': VERSION },
      redirect: 'error',
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(AI_TIMEOUT_MS)])
        : AbortSignal.timeout(AI_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw providerRejected(response.status);
    }

    const body = (await response.json()) as { data?: { id?: string }[] };

    return (body.data ?? [])
      .map((model) => model.id ?? '')
      .filter((id) => id !== '')
      .sort();
  }
}
