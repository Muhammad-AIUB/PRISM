// @vitest-environment node
import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { middleware } from './middleware';

function run(headers: Record<string, string> = {}) {
  return middleware(new NextRequest('http://localhost:3001/dashboard', { headers }));
}

/** NextResponse.next({ request }) carries the rewritten request headers like this. */
function forwarded(response: Response, name: string): string | null {
  return response.headers.get(`x-middleware-request-${name}`);
}

function scriptSrc(policy: string): string {
  return policy.split('; ').find((directive) => directive.startsWith('script-src')) ?? '';
}

describe('middleware: Content-Security-Policy', () => {
  it('uses a nonce that matches the x-nonce header the layout reads', () => {
    const response = run();
    const policy = response.headers.get('Content-Security-Policy') ?? '';
    const nonce = forwarded(response, 'x-nonce');

    expect(nonce).toBeTruthy();
    expect(scriptSrc(policy)).toContain(`'nonce-${nonce}'`);
    // Next reads the nonce from the request's CSP, so it must be the same policy.
    expect(forwarded(response, 'content-security-policy')).toBe(policy);
  });

  it('issues a fresh nonce per request', () => {
    expect(forwarded(run(), 'x-nonce')).not.toBe(forwarded(run(), 'x-nonce'));
  });

  it("never allows 'unsafe-eval' in production", () => {
    vi.stubEnv('NODE_ENV', 'production');

    const policy = run().headers.get('Content-Security-Policy') ?? '';

    expect(policy).not.toContain('unsafe-eval');
    expect(policy).not.toContain('ws:');
    expect(scriptSrc(policy)).toContain("'strict-dynamic'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
  });

  it("allows 'unsafe-eval' only for development tooling", () => {
    vi.stubEnv('NODE_ENV', 'development');

    expect(scriptSrc(run().headers.get('Content-Security-Policy') ?? '')).toContain(
      "'unsafe-eval'",
    );
  });
});

describe('middleware: request id', () => {
  it('keeps a safe incoming x-request-id and returns it', () => {
    const response = run({ 'x-request-id': 'abc-123.def:456_Z' });

    expect(forwarded(response, 'x-request-id')).toBe('abc-123.def:456_Z');
    expect(response.headers.get('X-Request-Id')).toBe('abc-123.def:456_Z');
  });

  it.each([
    ['a newline (log injection)', 'abc\nFAKE LOG LINE'],
    ['more than 128 characters', 'a'.repeat(129)],
    ['a space', 'abc def'],
  ])('replaces an id containing %s', (_label, unsafe) => {
    // Headers reject a raw newline, so hand the middleware a request whose
    // header lookup returns it anyway, as a lenient upstream might.
    const request = new NextRequest('http://localhost:3001/dashboard');
    const original = request.headers.get.bind(request.headers);
    vi.spyOn(request.headers, 'get').mockImplementation((name) =>
      name.toLowerCase() === 'x-request-id' ? unsafe : original(name),
    );

    const response = middleware(request);
    const id = response.headers.get('X-Request-Id');

    expect(id).not.toBe(unsafe);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(forwarded(response, 'x-request-id')).toBe(id);
  });

  it('generates an id when none was sent', () => {
    const response = run();

    expect(response.headers.get('X-Request-Id')).toMatch(/^[0-9a-f-]{36}$/);
    expect(forwarded(response, 'x-request-id')).toBe(response.headers.get('X-Request-Id'));
  });
});

/**
 * src/lib/api.ts sends a page load to /waking when prism-api is asleep, and
 * needs to know which page to come back to. A server component cannot see its
 * own URL, so the middleware passes it along.
 */
describe('middleware: the page being rendered', () => {
  it('forwards the path and query for the wake page to return to', () => {
    const response = middleware(
      new NextRequest('http://localhost:3001/repositories/3?kind=commits&page=2'),
    );

    expect(forwarded(response, 'x-prism-path')).toBe('/repositories/3?kind=commits&page=2');
  });

  it('overwrites a value the client sent', () => {
    expect(forwarded(run({ 'x-prism-path': 'https://evil.example' }), 'x-prism-path')).toBe(
      '/dashboard',
    );
  });
});

/**
 * The wake page has the browser call prism-api directly, which is the one
 * thing connect-src 'self' forbids. It is allowed there and nowhere else.
 */
describe('middleware: the wake page', () => {
  const connectSrc = (url: string) =>
    (middleware(new NextRequest(url)).headers.get('Content-Security-Policy') ?? '')
      .split('; ')
      .find((directive) => directive.startsWith('connect-src')) ?? '';

  it('may connect to the API origin', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PRISM_API_ORIGIN', 'https://api.example.test');

    expect(connectSrc('http://localhost:3001/waking?next=/dashboard')).toBe(
      "connect-src 'self' https://api.example.test",
    );
  });

  it('is the only page that may', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PRISM_API_ORIGIN', 'https://api.example.test');

    expect(connectSrc('http://localhost:3001/dashboard')).toBe("connect-src 'self'");
    expect(connectSrc('http://localhost:3001/waking/else')).toBe("connect-src 'self'");
  });
});
