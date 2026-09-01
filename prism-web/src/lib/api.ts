import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

/**
 * Server-side calls into prism-api.
 *
 * The session lives in an httpOnly cookie that prism-api set. In production a
 * reverse proxy puts both services on one hostname, so the browser sends that
 * cookie here too; this forwards it onward. Locally the rewrites in
 * next.config.mjs stand in for the proxy.
 *
 * Everything is fetched server-side, which means the API origin, the session
 * cookie and the user's GitHub token never reach the browser.
 */
const API_ORIGIN = process.env.PRISM_API_ORIGIN ?? 'http://127.0.0.1:3999';
const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME ?? 'prism_session';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly errors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiRequest {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Pages read live data; nothing here should be cached between users. */
  cache?: RequestCache;
}

async function request(path: string, init: ApiRequest = {}): Promise<Response> {
  const store = await cookies();
  const session = store.get(SESSION_COOKIE)?.value;

  return fetch(`${API_ORIGIN}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(session ? { Cookie: `${SESSION_COOKIE}=${session}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    // Every response is user-specific. Caching one would serve it to the next
    // visitor, so this must stay 'no-store'.
    cache: init.cache ?? 'no-store',
  });
}

async function parse<T>(response: Response): Promise<T> {
  if (response.ok) {
    return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
  }

  const body = (await response.json().catch(() => ({}))) as {
    message?: string;
    errors?: Record<string, string[]>;
  };

  throw new ApiError(
    response.status,
    body.message ?? `Request failed with ${response.status}`,
    body.errors,
  );
}

export async function apiGet<T>(path: string): Promise<T> {
  return parse<T>(await request(path));
}

export async function apiSend<T>(
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<T> {
  return parse<T>(await request(path, { method, body }));
}

/**
 * For pages behind auth. A 401 means the session expired or was never there,
 * and the honest response is to send the visitor to sign in rather than render
 * an empty shell.
 */
export async function apiGetAuthed<T>(path: string): Promise<T> {
  const response = await request(path);

  if (response.status === 401) {
    redirect('/login');
  }

  /**
   * A missing row, and one belonging to someone else, both render the
   * not-found page. Letting these fall through to parse() threw an ApiError
   * and produced a 500 for what is really "there is nothing here for you".
   *
   * 403 is folded in on purpose: a distinct "forbidden" screen would confirm
   * that a given review id exists, which is a small leak with no upside for
   * the person seeing it.
   */
  if (response.status === 404 || response.status === 403) {
    notFound();
  }

  return parse<T>(response);
}

/** Raw passthrough, for the diff and PDF endpoints. */
export async function apiRaw(path: string): Promise<Response> {
  return request(path);
}
