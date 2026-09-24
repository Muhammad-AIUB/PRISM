import { RateLimitGuard } from './rate-limit.guard';

// @nestjs/jwt ships ESM that jest cannot load; the guard only ever calls
// verifyAsync, which each test supplies.
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }));

/**
 * Every browser request reaches the API from prism-web's server, one address.
 * Keyed by IP, the whole site shared one allowance; these pin that each signed
 * -in user gets their own, and that nothing short of a valid signature does.
 */
function guard(verify?: (token: string) => Promise<unknown>) {
  const instance = new RateLimitGuard({ throttlers: [] } as never, {} as never, {} as never);

  Object.assign(instance, {
    jwt: verify ? { verifyAsync: verify } : undefined,
    config: { get: () => 'prism_session' },
  });

  return (req: Record<string, unknown>) =>
    (instance as unknown as { getTracker(r: Record<string, unknown>): Promise<string> }).getTracker(req);
}

const fromNextServer = (cookies: Record<string, string> = {}) => ({ ip: '10.0.0.5', cookies });

describe('RateLimitGuard tracker', () => {
  const verify = async (token: string) => {
    if (token === 'alice') return { sub: 1 };
    if (token === 'bob') return { sub: 2 };
    throw new Error('invalid signature');
  };

  it('gives two signed-in users on the same server address separate buckets', async () => {
    const track = guard(verify);

    await expect(track(fromNextServer({ prism_session: 'alice' }))).resolves.toBe('user:1');
    await expect(track(fromNextServer({ prism_session: 'bob' }))).resolves.toBe('user:2');
  });

  it('falls back to the IP bucket for a forged or expired cookie, so junk cannot mint buckets', async () => {
    await expect(guard(verify)(fromNextServer({ prism_session: 'forged' }))).resolves.toBe('ip:10.0.0.5');
  });

  it('ignores a verified token whose subject is not a user id', async () => {
    await expect(guard(async () => ({ sub: 'admin' }))(fromNextServer({ prism_session: 'x' }))).resolves.toBe(
      'ip:10.0.0.5',
    );
  });

  it('keys guests and bearer-token callers by IP, as before', async () => {
    const track = guard(verify);

    await expect(track(fromNextServer())).resolves.toBe('ip:10.0.0.5');
    await expect(track({ ip: '203.0.113.9', headers: { authorization: 'Bearer 1|abc' } })).resolves.toBe(
      'ip:203.0.113.9',
    );
  });

  it('still prefers request.user when a guard upstream has set it', async () => {
    await expect(guard(verify)({ ip: '10.0.0.5', user: { id: 7 } })).resolves.toBe('user:7');
  });

  it('works without JwtService at all, falling back to IP', async () => {
    await expect(guard()(fromNextServer({ prism_session: 'alice' }))).resolves.toBe('ip:10.0.0.5');
  });
});
