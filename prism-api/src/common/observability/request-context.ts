import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * What every log line should say about the work that produced it.
 *
 * Carried by AsyncLocalStorage rather than passed around, so a line logged
 * deep inside a service - a Groq retry, a GitHub 502 - still names the HTTP
 * request or queue job it belongs to without any of those signatures changing.
 */
export interface RequestContext {
  /** The X-Request-Id of the HTTP request being served. */
  requestId?: string;
  /** The BullMQ job being processed; reviews run outside any request. */
  jobId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function currentContext(): RequestContext {
  return storage.getStore() ?? {};
}
