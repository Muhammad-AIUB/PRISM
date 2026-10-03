// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`redirect:${url}`);
  }
}

vi.mock('@/lib/api', () => ({ apiRaw: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new RedirectSignal(url);
  }),
}));

const { apiRaw } = await import('@/lib/api');
const { GET } = await import('./route');

/**
 * /auth/github is proxied straight to prism-api, so when the API is asleep the
 * visitor got Render's bare "Too Many Requests". Sign-in starts here instead:
 * a call through src/lib/api.ts first, which is where a sleeping API is
 * noticed and the visitor is sent to the wake page.
 */
describe('GET /login/github', () => {
  beforeEach(() => {
    vi.mocked(apiRaw).mockReset();
  });

  it('hands over to the OAuth redirect once the API has answered', async () => {
    vi.mocked(apiRaw).mockResolvedValue(new Response('{}', { status: 200 }));

    await expect(GET()).rejects.toMatchObject({ url: '/auth/github' });
    expect(apiRaw).toHaveBeenCalledWith('/health');
  });

  // An unhealthy API is still an awake one; its own sign-in route can say so.
  it('hands over even when the API reports itself unhealthy', async () => {
    vi.mocked(apiRaw).mockResolvedValue(new Response('{}', { status: 503 }));

    await expect(GET()).rejects.toMatchObject({ url: '/auth/github' });
  });

  it('does not start sign-in when the call ends in the wake redirect', async () => {
    vi.mocked(apiRaw).mockRejectedValue(new RedirectSignal('/waking?next=%2Flogin%2Fgithub'));

    await expect(GET()).rejects.toMatchObject({ url: '/waking?next=%2Flogin%2Fgithub' });
  });
});
