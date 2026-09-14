import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { extractJson, type ExtractedJson } from './json-extractor';

/**
 * The AI calls both review pipelines make.
 *
 * Groq only. The original had an OpenRouter fallback chain behind it, removed
 * on request — so the chain is now the two Groq models below, tried in order.
 * The larger one answers first; the smaller is there for when it is rate
 * limited or errors.
 *
 * That makes Groq's native JSON mode load-bearing rather than merely nice:
 * with `response_format: json_object` these models rarely emit unparseable
 * output, which is what the removed fallback used to cover. When both models
 * do fail to return parseable JSON, the caller degrades gracefully rather
 * than failing the job — see the runners.
 *
 * Model ids, ordering, temperature and timeouts are observable behaviour.
 * Do not reorder or "modernise" the list without re-measuring parse rates.
 */
export type AiCallContext = 'commit_review' | 'pr_review';

export interface RawAiResult {
  parsed: ExtractedJson | null;
  raw: string | null;
  /** 429 specifically, which is a failed attempt rather than a bad answer. */
  rateLimited?: boolean;
}

export interface FallbackAiResult extends RawAiResult {
  /** Labelled "groq/<model>" — the format stored in ai_model_used. */
  model: string | null;
}

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Every model was rate limited, which is a failed attempt rather than a review.
 *
 * Thrown so it reaches BullMQ, whose REVIEW_JOB_BACKOFF_SECONDS is already
 * [60, 180, 600] — a schedule that fits a per-minute token limit well. Handling
 * it here instead, by sleeping on `retry-after`, would spend the derived job
 * budget waiting and would stall every other review behind it, because the
 * worker runs at concurrency 1.
 *
 * This is deliberately NOT how unparseable output is treated: a model that
 * answers badly still produces a completed review with the raw text, which is a
 * documented feature and is covered by its own regression test.
 */
export class RateLimitedError extends Error {
  constructor(model: string) {
    super(`Groq rate limited every model (last: ${model})`);
    this.name = 'RateLimitedError';
  }
}

/**
 * Exported because the BullMQ job timeout is derived from it. Those two numbers
 * drifting apart is not a theoretical risk: a job budget smaller than the calls
 * it wraps silently made the graceful-degradation path below unreachable.
 */
export const GROQ_TIMEOUT_MS = 60_000;

/** Tried in order. */
export const GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];

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
   * Returns the first parseable result, or the last model's raw text when
   * every model failed — the caller uses that raw text for the
   * graceful-degradation summary rather than failing the job outright.
   */
  async callWithFallback(
    system: string,
    user: string,
    context: AiCallContext,
    signal?: AbortSignal,
  ): Promise<FallbackAiResult> {
    const strongSystem =
      'Respond with ONLY raw JSON. NO prose. NO markdown code fences. NO explanations before or after.\n\n' +
      system;

    let lastModel: string | null = null;
    let lastRaw: string | null = null;
    let rateLimited = 0;

    for (const model of GROQ_MODELS) {
      // The job budget is spent. Falling through to the next model here would
      // be work nobody will read, on a job that is already being retried.
      signal?.throwIfAborted();

      const result = await this.callGroqRaw(model, strongSystem, user, context, signal);
      lastModel = `groq/${model}`;
      lastRaw = result.raw;

      if (result.parsed) {
        return { model: lastModel, parsed: result.parsed, raw: result.raw };
      }

      if (result.rateLimited) {
        rateLimited += 1;
        this.logger.warn(`Groq rate limited, trying next model: ${model}`);
        continue;
      }

      this.logger.warn(
        `Groq model returned unparseable output, trying next: ${model} — ${(result.raw ?? '').slice(0, 200)}`,
      );
    }

    // Nothing was wrong with the review; the provider simply would not talk to
    // us. Fail the attempt so the existing backoff retries it, rather than
    // completing a review that contains no review.
    if (rateLimited === GROQ_MODELS.length) {
      throw new RateLimitedError(lastModel ?? 'unknown');
    }

    return { model: lastModel, parsed: null, raw: lastRaw };
  }

  /**
   * Used for the second (fixes) pass, which reuses whichever model succeeded
   * on the first. The "groq/" prefix is stripped because that label is the
   * stored form, not the API's model id.
   */
  async call(
    model: string,
    system: string,
    user: string,
    context: AiCallContext,
    signal?: AbortSignal,
  ): Promise<ExtractedJson | null> {
    const result = await this.callGroqRaw(
      model.startsWith('groq/') ? model.slice(5) : model,
      system,
      user,
      context,
      signal,
    );

    return result.parsed;
  }

  /** Single call with Groq's native JSON mode. */
  private async callGroqRaw(
    model: string,
    system: string,
    user: string,
    context: AiCallContext,
    signal?: AbortSignal,
  ): Promise<RawAiResult> {
    const response = await this.post(
      {
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      },
      { context, model },
      signal,
    );

    if (!response.ok) {
      this.logger.warn(
        `Groq call failed: ${response.status} ${(response.body ?? '').slice(0, 500)}`,
      );

      // `raw` is what the graceful-degradation path shows the user as the model's
      // own words. An HTTP error body is not that, and returning it here is how
      // a rate-limited review ended up displaying Groq's error JSON as its
      // summary. The status is logged above; the user is not shown a transport
      // failure dressed up as a review.
      return { parsed: null, raw: null, rateLimited: response.status === 429 };
    }

    const content = this.contentOf(response.json);

    return { parsed: extractJson(content), raw: content };
  }

  /**
   * One HTTP round trip plus the `ai_call` structured log line. A network
   * error or timeout is reported as a non-ok result rather than thrown, so the
   * caller falls through to the next model instead of failing the whole job.
   */
  private async post(
    payload: Record<string, unknown>,
    meta: { context: AiCallContext; model: string },
    signal?: AbortSignal,
  ): Promise<{ ok: boolean; status: number; body: string | null; json: ChatCompletionResponse }> {
    const start = Date.now();

    try {
      const response = await fetch(GROQ_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.groqKey()}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        // Whichever fires first wins: this call's own ceiling, or the job
        // running out of budget. Without the caller's signal the request keeps
        // a socket and a response buffer alive long after anyone cares.
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(GROQ_TIMEOUT_MS)])
          : AbortSignal.timeout(GROQ_TIMEOUT_MS),
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
          provider: 'groq',
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
          provider: 'groq',
          model: meta.model,
          status: 0,
          duration_ms: Date.now() - start,
          error: message,
          aborted: signal?.aborted ?? false,
        })}`,
      );

      // A per-call timeout is a soft failure: report it and let the caller try
      // the next model. The job budget expiring is not — swallowing it here
      // would turn a dead job into a "no model answered" review.
      signal?.throwIfAborted();

      return { ok: false, status: 0, body: null, json: {} };
    }
  }

  private contentOf(json: ChatCompletionResponse): string {
    return json.choices?.[0]?.message?.content ?? '';
  }

  private groqKey(): string {
    return this.configService.get<string>('ai.groqKey') ?? '';
  }
}
