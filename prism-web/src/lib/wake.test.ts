import { describe, expect, it, vi } from 'vitest';
import { apiOrigin, isHibernating, safeNext, wakeUrl } from './wake';

function response(status: number, headers: Record<string, string> = {}): Response {
  return new Response('x', { status, headers });
}

describe('isHibernating', () => {
  it("recognises Render's refusal for a sleeping service", () => {
    expect(isHibernating(response(429, { 'x-render-routing': 'hibernate-rate-limited' }))).toBe(
      true,
    );
    expect(isHibernating(response(503, { 'x-render-routing': 'hibernate-wake-error' }))).toBe(
      true,
    );
  });

  // The API's own throttle is also a 429. It means "slow down", not "asleep".
  it('does not mistake the API throttle, or anything else, for sleep', () => {
    expect(isHibernating(response(429, { 'retry-after-api': '30' }))).toBe(false);
    expect(isHibernating(response(503, { 'x-render-routing': 'no-server' }))).toBe(false);
    expect(isHibernating(response(200))).toBe(false);
  });
});

/**
 * `next` comes from the URL, so it is whatever a link author wanted it to be.
 * It may only ever send the visitor to a path on this site.
 */
describe('safeNext', () => {
  it.each(['/dashboard', '/repositories/3?kind=commits&page=2', '/login/github'])(
    'keeps %j',
    (path) => {
      expect(safeNext(path)).toBe(path);
    },
  );

  it.each([
    ['another site', 'https://evil.example/x'],
    ['a protocol-relative URL', '//evil.example/x'],
    ['a backslash, which browsers read as a slash', '/\\evil.example/x'],
    ['a relative path', 'dashboard'],
    ['a script URL', 'javascript:alert(1)'],
    ['the wake page itself', '/waking?next=/dashboard'],
    ['nothing', undefined],
    ['a repeated parameter', ['/a', '/b']],
  ])('falls back to the dashboard for %s', (_label, value) => {
    expect(safeNext(value)).toBe('/dashboard');
  });
});

describe('wakeUrl', () => {
  it('carries the page to return to', () => {
    expect(wakeUrl('/repositories/3?kind=commits')).toBe(
      '/waking?next=%2Frepositories%2F3%3Fkind%3Dcommits',
    );
  });

  it('carries nothing when the page is unknown or unsafe', () => {
    expect(wakeUrl(null)).toBe('/waking');
    expect(wakeUrl('//evil.example')).toBe('/waking');
  });
});

describe('apiOrigin', () => {
  it('is the origin alone, whatever path the setting carries', () => {
    vi.stubEnv('PRISM_API_ORIGIN', 'https://api.example.test/some/path/');

    expect(apiOrigin()).toBe('https://api.example.test');
  });

  it('defaults to the local API', () => {
    vi.stubEnv('PRISM_API_ORIGIN', undefined);

    expect(apiOrigin()).toBe('http://127.0.0.1:3999');
  });
});
