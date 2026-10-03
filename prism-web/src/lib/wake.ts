/**
 * Waking a sleeping prism-api.
 *
 * On Render's free tier a web service sleeps after 15 idle minutes. While
 * prism-api sleeps, Render's edge answers for it with a 429 and
 * `x-render-routing: hibernate-rate-limited` - and it does so for every
 * request this server makes, without ever starting the service. Measured:
 * 25 proxied requests over four minutes left it asleep; one request made
 * straight to the API from outside Render woke it in 42 seconds.
 *
 * So this server cannot wake the API, and the visitor's browser can. A page
 * load that finds the API asleep is sent to /waking, which makes that direct
 * request and then returns the visitor to where they were going.
 *
 * No Next imports here: the middleware, the server and the browser all use it.
 */
export const WAKE_PATH = '/waking';

const FALLBACK = '/dashboard';

/** Render answered in place of a service it has put to sleep. */
export function isHibernating(response: Response): boolean {
  return response.headers.get('x-render-routing')?.startsWith('hibernate') ?? false;
}

/**
 * The page to return to, or the dashboard if `next` is anything but a path on
 * this site. It arrives in a URL, so it is only ever as trustworthy as
 * whoever wrote the link.
 */
export function safeNext(next: string | string[] | null | undefined): string {
  if (typeof next !== 'string' || !/^\/(?![/\\])/.test(next)) {
    return FALLBACK;
  }

  // Returning to the wake page would wait for a second wake that never ends.
  if (next === WAKE_PATH || next.startsWith(`${WAKE_PATH}?`)) {
    return FALLBACK;
  }

  return next;
}

/** Where to send a page load that found the API asleep. */
export function wakeUrl(path: string | null): string {
  const next = safeNext(path);

  return path !== null && next === path
    ? `${WAKE_PATH}?next=${encodeURIComponent(next)}`
    : WAKE_PATH;
}

/**
 * prism-api's public origin. The wake page is the one place it reaches the
 * browser: nothing else can start a sleeping API. It is not a secret - the
 * API has to be reachable by GitHub's webhooks - but everything else still
 * goes through this server.
 */
export function apiOrigin(): string {
  return new URL(process.env.PRISM_API_ORIGIN ?? 'http://127.0.0.1:3999').origin;
}
