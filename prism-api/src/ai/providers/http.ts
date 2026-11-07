import { Logger } from '@nestjs/common';
import type { AiCallContext, ProviderId } from './ai-provider';

/**
 * Exported because the BullMQ job timeout is derived from it. Those two numbers
 * drifting apart is not a theoretical risk: a job budget smaller than the calls
 * it wraps silently made the graceful-degradation path unreachable.
 */
export const AI_TIMEOUT_MS = 60_000;

export interface HttpResult {
  ok: boolean;
  status: number;
  body: string | null;
  json: unknown;
}

/**
 * One HTTP round trip plus the `ai_call` structured log line. A network
 * error or timeout is reported as a non-ok result rather than thrown, so the
 * caller falls through to the next model instead of failing the whole job.
 *
 * `redirect: 'error'` so a key is never forwarded by a redirect.
 */
export async function sendJson(args: {
  provider: ProviderId;
  context: AiCallContext;
  model: string;
  url: string;
  headers: Record<string, string>;
  payload: unknown;
  signal?: AbortSignal;
  logger: Logger;
  usage: (json: unknown) => { prompt: number | null; completion: number | null };
}): Promise<HttpResult> {
  const { provider, context, model, url, headers, payload, signal, logger, usage } = args;
  const start = Date.now();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      redirect: 'error',
      // Whichever fires first wins: this call's own ceiling, or the job
      // running out of budget. Without the caller's signal the request keeps
      // a socket and a response buffer alive long after anyone cares.
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(AI_TIMEOUT_MS)])
        : AbortSignal.timeout(AI_TIMEOUT_MS),
    });

    const body = await response.text();
    let json: unknown = {};

    if (response.ok) {
      try {
        json = JSON.parse(body);
      } catch {
        json = {};
      }
    }

    const tokens = usage(json);

    logger.log(
      `ai_call ${JSON.stringify({
        context,
        provider,
        model,
        status: response.status,
        duration_ms: Date.now() - start,
        prompt_tokens: tokens.prompt,
        completion_tokens: tokens.completion,
      })}`,
    );

    return { ok: response.ok, status: response.status, body, json };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    logger.log(
      `ai_call ${JSON.stringify({
        context,
        provider,
        model,
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
