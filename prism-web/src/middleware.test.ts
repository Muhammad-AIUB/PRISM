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
