import { UnauthorizedException } from '@nestjs/common';
import { SessionRevocationStore } from './session-revocation.store';
import { WebAuthGuard } from './web-auth.guard';

// @nestjs/jwt ships ESM that jest cannot load; each test supplies verifyAsync.
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }));

const verify = async (token: string) => {
  if (token === 'alice') return { sub: 1 };
  if (token === 'ghost') return { sub: 99 };
  throw new Error('invalid signature');
};

function build(revoked: string[] = []) {
  const request: Record<string, unknown> = {};
  const guard = new WebAuthGuard(
    { verifyAsync: verify } as never,
    { findOne: jest.fn(async ({ where }: { where: { id: number } }) => (where.id === 1 ? { id: 1 } : null)) } as never,
    { get: () => 'prism_session' } as never,
    { isRevoked: jest.fn(async (t: string) => revoked.includes(t)) } as never,
  );
  const context = (cookie?: string, authorization?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () =>
          Object.assign(request, {
            cookies: cookie ? { prism_session: cookie } : {},
            header: (n: string) => (n === 'authorization' ? authorization : undefined),
          }),
      }),
    }) as never;

  return { guard, request, context };
}

describe('WebAuthGuard', () => {
  it('accepts a valid session cookie and loads the user row', async () => {
    const { guard, request, context } = build();

    await expect(guard.canActivate(context('alice'))).resolves.toBe(true);
    expect(request.user).toEqual({ id: 1 });
  });

  it('accepts the same token as a bearer header when there is no cookie', async () => {
    const { guard, context } = build();

    await expect(guard.canActivate(context(undefined, 'Bearer alice'))).resolves.toBe(true);
  });

  it.each([
    ['no token at all', undefined],
    ['a forged or expired token', 'forged'],
    ['a valid token for a deleted account', 'ghost'],
  ])('refuses %s with the exact 401 body', async (_case, cookie) => {
    const { guard, context } = build();

    await expect(guard.canActivate(context(cookie))).rejects.toThrow(
      new UnauthorizedException('Unauthenticated.'),
    );
  });

  it('refuses a correctly signed token that was logged out', async () => {
    const { guard, context } = build(['alice']);

    await expect(guard.canActivate(context('alice'))).rejects.toThrow('Unauthenticated.');
  });
});

describe('SessionRevocationStore', () => {
  function store(verifyAsync: (t: string) => Promise<unknown>) {
    const data = new Map<string, { v: string; ttl: number }>();
    const redis = {
      set: jest.fn(async (k: string, v: string, _ex: string, ttl: number) => data.set(k, { v, ttl })),
      exists: jest.fn(async (k: string) => (data.has(k) ? 1 : 0)),
    };

    return { store: new SessionRevocationStore(redis as never, { verifyAsync } as never), redis, data };
  }

  it('revokes a token until it would have expired anyway, storing only a hash', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const { store: s, data } = store(async () => ({ exp }));

    await s.revoke('the-token');

    await expect(s.isRevoked('the-token')).resolves.toBe(true);
    await expect(s.isRevoked('another-token')).resolves.toBe(false);
    const [key, entry] = [...data.entries()][0] ?? ['', { ttl: 0 }];
    expect(key).not.toContain('the-token');
    expect(entry.ttl).toBeGreaterThan(3590);
    expect(entry.ttl).toBeLessThanOrEqual(3600);
  });

  it('ignores a token that does not verify: there is nothing to revoke', async () => {
    const { store: s, redis } = store(async () => {
      throw new Error('bad');
    });

    await s.revoke('forged');

    expect(redis.set).not.toHaveBeenCalled();
  });

  it('fails open when Redis cannot be read, so an outage does not sign everyone out', async () => {
    const { store: s, redis } = store(async () => ({}));

    redis.exists.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(s.isRevoked('t')).resolves.toBe(false);
  });
});
