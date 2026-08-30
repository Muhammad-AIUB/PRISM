import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { extractJson, type ExtractedJson } from './json-extractor';

/**
 * Port of the AI call helpers duplicated across both Laravel jobs.
 *
 * The chain is Groq first (native JSON mode, near-zero parse failures), then
 * the OpenRouter free models as a last resort. Model ids, ordering,
 * temperature and timeouts are all part of the observable behaviour — commit
 * 'f24ed15' introduced this chain precisely because the free models fail JSON
 * parsing at different rates, so a chain lands a parseable result ~95% of the
 * time. Do not reorder or "modernise" the list without re-measuring that.
 */
export type AiCallContext = 'commit_review' | 'pr_review';

export interface RawAiResult {
  parsed: ExtractedJson | null;
  raw: string | null;
}

export interface FallbackAiResult extends RawAiResult {
  /** Groq results are labelled "groq/<model>" so callAi can route back. */
  model: string | null;
}

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

const GROQ_TIMEOUT_MS = 60_000;
const OPENROUTER_TIMEOUT_MS = 120_000;

/** Groq models (primary), in order. */
const GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];

/** OpenRouter free models (fallback), in order. */
const OPENROUTER_MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'deepseek/deepseek-v4-flash:free',
  'qwen/qwen-2.5-72b-instruct:free',
];

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

@Injectable()
export class AiClientService {
  private readonly logger = new Logger(AiClientService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Port of callAiWithFallback(). Returns the first parseable result, or the
   * last model's raw text when every model failed — the caller uses that raw
   * text for the graceful-degradation summary rather than failing the job.
   */
  async callWithFallback(
    system: string,
    user: string,
    context: AiCallContext,
  ): Promise<FallbackAiResult> {
    const strongSystem =
      'Respond with ONLY raw JSON. NO prose. NO markdown code fences. NO explanations before or after.\n\n' +
      system;

    let lastModel: string | null = null;
    let lastRaw: string | null = null;

    // 1) Groq chain. Skipped entirely when no key is configured, exactly as
    //    the PHP does — an absent key silently degrades to OpenRouter.
    if (this.groqKey()) {
      for (const model of GROQ_MODELS) {
        const result = await this.callGroqRaw(model, strongSystem, user, context);
        lastModel = `groq/${model}`;
        lastRaw = result.raw;

        if (result.parsed) {
          return { model: lastModel, parsed: result.parsed, raw: result.raw };
        }

        this.logger.warn(
          `Groq model returned unparseable output, trying next: ${model} — ${(result.raw ?? '').slice(0, 200)}`,
        );
      }
    }

    // 2) OpenRouter chain.
    for (const model of OPENROUTER_MODELS) {
      const result = await this.callOpenRouterRaw(model, strongSystem, user, context);
      lastModel = model;
      lastRaw = result.raw;

      if (result.parsed) {
        return { model, parsed: result.parsed, raw: result.raw };
      }

      this.logger.warn(
        `AI model returned unparseable output, trying next: ${model} — ${(result.raw ?? '').slice(0, 200)}`,
      );
    }

    return { model: lastModel, parsed: null, raw: lastRaw };
  }

  /**
   * Port of callAi(). Used for the second (fixes) pass, which reuses whichever
   * model succeeded on the first pass.
   *
   * The OpenRouter branch deliberately sends NO temperature — the first-pass
   * helpers send 0.2 and this one does not. That asymmetry is in the Laravel
   * source and is preserved.
   */
  async call(
    model: string,
    system: string,
    user: string,
    context: AiCallContext,
  ): Promise<ExtractedJson | null> {
    if (model.startsWith('groq/')) {
      const result = await this.callGroqRaw(model.slice(5), system, user, context);

      return result.parsed;
    }

    const response = await this.post(
      OPENROUTER_ENDPOINT,
      this.openRouterKey(),
      {
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      },
      OPENROUTER_TIMEOUT_MS,
      { context, model, provider: 'openrouter' },
    );

    if (!response.ok) {
      this.logger.warn(
        `OpenRouter (${context}) failed: ${response.status} ${(response.body ?? '').slice(0, 500)}`,
      );

      return null;
    }

    return extractJson(this.contentOf(response.json));
  }

  /** Port of callGroqRaw(). Native JSON mode via response_format. */
  private async callGroqRaw(
    model: string,
    system: string,
    user: string,
    context: AiCallContext,
  ): Promise<RawAiResult> {
    const response = await this.post(
      GROQ_ENDPOINT,
      this.groqKey(),
      {
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      },
      GROQ_TIMEOUT_MS,
      { context, model, provider: 'groq' },
    );

    if (!response.ok) {
      this.logger.warn(
        `Groq call failed: ${response.status} ${(response.body ?? '').slice(0, 500)}`,
      );

      // Laravel returns the raw HTTP body here, not the message content.
      return { parsed: null, raw: response.body };
    }

    const content = this.contentOf(response.json);

    return { parsed: extractJson(content), raw: content };
  }

  /** Port of callAiRaw(). OpenRouter, temperature 0.2. */
  private async callOpenRouterRaw(
    model: string,
    system: string,
    user: string,
    context: AiCallContext,
  ): Promise<RawAiResult> {
    const response = await this.post(
      OPENROUTER_ENDPOINT,
      this.openRouterKey(),
      {
        model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      },
      OPENROUTER_TIMEOUT_MS,
      { context, model, provider: 'openrouter' },
    );

    if (!response.ok) {
      return { parsed: null, raw: response.body };
    }

    const content = this.contentOf(response.json);

    return { parsed: extractJson(content), raw: content };
  }

  /**
   * One HTTP round trip plus the `ai_call` structured log line the Laravel jobs
   * emit. A network error or timeout is reported as a non-ok result rather than
   * thrown, so the caller falls through to the next model instead of failing
   * the whole job — matching Laravel's HTTP client behaviour here.
   */
  private async post(
    endpoint: string,
    apiKey: string,
    payload: Record<string, unknown>,
    timeoutMs: number,
    meta: { context: AiCallContext; model: string; provider: string },
  ): Promise<{ ok: boolean; status: number; body: string | null; json: ChatCompletionResponse }> {
    const start = Date.now();

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });

      const body = await response.text();
      let json: ChatCompletionResponse = {};

      if (response.ok) {
        try {
          json = JSON.parse(body) as ChatCompletionResponse;
        } catch {
          json = {};
        }
      }

      this.logger.log(
        `ai_call ${JSON.stringify({
          context: meta.context,
          provider: meta.provider,
          model: meta.model,
          status: response.status,
          duration_ms: Date.now() - start,
          prompt_tokens: json.usage?.prompt_tokens ?? null,
          completion_tokens: json.usage?.completion_tokens ?? null,
        })}`,
      );

      return { ok: response.ok, status: response.status, body, json };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.log(
        `ai_call ${JSON.stringify({
          context: meta.context,
          provider: meta.provider,
          model: meta.model,
          status: 0,
          duration_ms: Date.now() - start,
          error: message,
        })}`,
      );

      return { ok: false, status: 0, body: null, json: {} };
    }
  }

  private contentOf(json: ChatCompletionResponse): string {
    return json.choices?.[0]?.message?.content ?? '';
  }

  private groqKey(): string {
    return this.configService.get<string>('ai.groqKey') ?? '';
  }

  private openRouterKey(): string {
    return this.configService.get<string>('ai.openRouterKey') ?? '';
  }
}
