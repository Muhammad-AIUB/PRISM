import { Logger } from '@nestjs/common';
import type { AiProvider, CompletionRequest, CompletionResult } from './ai-provider';
import { sendJson } from './http';

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Tried in order. Groq shut down llama-3.3-70b-versatile and llama-3.1-8b-instant
 * on 2026-08-16 (https://console.groq.com/docs/deprecations); these are its named
 * successors, in the same large-then-small order. Not re-measured: see ADR 0007.
 */
export const GROQ_MODELS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'];

/**
 * gpt-oss models spend completion tokens on reasoning before the answer, and
 * Groq's default of 1024 can run out first and leave `content` empty, which the
 * pipeline reads as "no usable review". A generous ceiling avoids that.
 */
const GROQ_MAX_COMPLETION_TOKENS = 8192;

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** Single call with Groq's native JSON mode. */
export class GroqProvider implements AiProvider {
  readonly id = 'groq' as const;
  private readonly logger = new Logger('AiClientService');

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const response = await sendJson({
      provider: 'groq',
      context: request.context,
      model: request.model,
      url: GROQ_ENDPOINT,
      headers: {
        Authorization: `Bearer ${request.apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      payload: {
        model: request.model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        max_completion_tokens: GROQ_MAX_COMPLETION_TOKENS,
        // The reasoning text is not used, only the JSON answer.
        include_reasoning: false,
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.user },
        ],
      },
      signal: request.signal,
      logger: this.logger,
      usage: (json) => {
        const usage = (json as ChatCompletionResponse).usage;

        return {
          prompt: usage?.prompt_tokens ?? null,
          completion: usage?.completion_tokens ?? null,
        };
      },
    });

    return {
      ok: response.ok,
      status: response.status,
      content: response.ok
        ? ((response.json as ChatCompletionResponse).choices?.[0]?.message?.content ?? '')
        : null,
      errorBody: response.ok ? null : response.body,
    };
  }

  listModels(): Promise<string[]> {
    return Promise.resolve([...GROQ_MODELS]);
  }
}
