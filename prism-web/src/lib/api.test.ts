// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * src/lib/api.ts is server-only: it reads the session cookie and the request
 * id through next/headers and ends a render through next/navigation. Both are
 * replaced here, and fetch is stubbed, so each test controls exactly what the
 * API "answered".
 */
const nav = vi.hoisted(() => {
  class NotFoundSignal extends Error {}
  class RedirectSignal extends Error {
    constructor(readonly url: string) {
      super(`redirect:${url}`);
    }
  }

  return { NotFoundSignal, RedirectSignal };
});

const request = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  headers: new Map<string, string>(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => {
      const value = request.cookies.get(name);

      return value === undefined ? undefined : { name, value };
    },
  })),
  headers: vi.fn(async () => new Headers(Object.fromEntries(request.headers))),
}));

// The real functions throw to unwind the render; so do these.
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new nav.NotFoundSignal('notFound');
  }),
  redirect: vi.fn((url: string) => {
    throw new nav.RedirectSignal(url);
  }),
}));

const { ApiError, apiGet, apiGetAuthed, apiSend } = await import('./api');
const { notFound, redirect } = await import('next/navigation');

const fetchMock = vi.fn<typeof fetch>();

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/** The headers of the n-th fetch call, as a plain lower-cased object. */
function sentHeaders(call = 0): Record<string, string> {
  const init = fetchMock.mock.calls[call]?.[1];

  return Object.fromEntries(new Headers(init?.headers).entries());
}

beforeEach(() => {
  request.cookies.clear();
  request.headers.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('apiGetAuthed', () => {
  it.each([400, 403, 404])('folds %i into notFound()', async (status) => {
    fetchMock.mockResolvedValue(json(status, { message: 'nope' }));

    await expect(apiGetAuthed('/reviews/1')).rejects.toBeInstanceOf(nav.NotFoundSignal);
    expect(notFound).toHaveBeenCalledTimes(1);
    expect(redirect).not.toHaveBeenCalled();
  });

  it('sends a 401 to the sign-in page instead of rendering', async () => {
    fetchMock.mockResolvedValue(json(401, 'Unauthenticated.'));

    const result = apiGetAuthed('/dashboard');

    await expect(result).rejects.toBeInstanceOf(nav.RedirectSignal);
    await expect(result).rejects.toMatchObject({ url: '/login' });
    expect(notFound).not.toHaveBeenCalled();
  });

  it('passes other failures through as an ApiError with the API message', async () => {
    fetchMock.mockResolvedValue(
      json(500, { message: 'Server Error', errors: { id: ['bad'] } }),
    );

    const error = await apiGetAuthed('/reviews/1').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 500, message: 'Server Error', errors: { id: ['bad'] } });
    expect(notFound).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('returns the parsed body on success', async () => {
    fetchMock.mockResolvedValue(json(200, { id: 7 }));

    await expect(apiGetAuthed<{ id: number }>('/reviews/7')).resolves.toEqual({ id: 7 });
  });
});

describe('send()', () => {
  it('forwards the session cookie and the X-Request-Id set by the middleware', async () => {
    request.cookies.set('prism_session', 'jwt-value');
    request.headers.set('x-request-id', 'req-123');
    fetchMock.mockResolvedValue(json(200, {}));

    await apiGet('/auth/me');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3999/auth/me',
      expect.objectContaining({ method: 'GET', cache: 'no-store' }),
    );
    expect(sentHeaders()).toMatchObject({
      cookie: 'prism_session=jwt-value',
      'x-request-id': 'req-123',
      accept: 'application/json',
    });
  });

  it('never sets a Cookie header when there is no session', async () => {
    request.cookies.set('some_other_cookie', 'x');
    fetchMock.mockResolvedValue(json(200, {}));

    await apiGet('/auth/me');

    expect(sentHeaders()).not.toHaveProperty('cookie');
    expect(sentHeaders()).not.toHaveProperty('x-request-id');
  });

  it('sends a JSON body and Content-Type only when there is a body', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(apiSend('/tokens', 'POST', { name: 'mcp' })).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe('{"name":"mcp"}');
    expect(sentHeaders()).toMatchObject({ 'content-type': 'application/json' });

    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await apiSend('/tokens/1', 'DELETE');
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBeUndefined();
    expect(sentHeaders(1)).not.toHaveProperty('content-type');
  });
});

describe('errors and retries', () => {
  it('falls back to a generic message when the error body is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Bad Gateway</html>', { status: 502 }));

    await expect(apiGet('/x')).rejects.toMatchObject({
      name: 'ApiError',
      status: 502,
      message: 'Request failed with 502',
    });
  });

  it('retries a GET once when the 429 resets soon', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(json(429, 'Too Many Attempts.', { 'retry-after-api': '2' }))
      .mockResolvedValueOnce(json(200, { ok: true }));

    const result = apiGet('/dashboard');

    await vi.advanceTimersByTimeAsync(2_000);
    await expect(result).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not wait out a long 429', async () => {
    fetchMock.mockResolvedValue(json(429, 'Too Many Attempts.', { 'retry-after': '60' }));

    await expect(apiGet('/dashboard')).rejects.toMatchObject({ status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never retries a write', async () => {
    fetchMock.mockResolvedValue(json(429, 'Too Many Attempts.', { 'retry-after': '1' }));

    await expect(apiSend('/reviews/1/re-analyze', 'POST')).rejects.toMatchObject({ status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
