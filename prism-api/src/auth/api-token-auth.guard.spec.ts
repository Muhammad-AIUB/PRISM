import { createHash } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { ApiTokenAuthGuard } from './api-token-auth.guard';

/**
 * The bearer format is frozen: "{id}|{plaintext}" with sha256(plaintext)
 * stored, plus the legacy no-"|" form hashed whole. Deployed MCP servers hold
 * tokens in exactly these shapes, so every branch here is a contract.
 */
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const PLAIN = 'x'.repeat(40);

function build(rows: Record<string, unknown>[], users: Record<string, unknown>[] = [{ id: 7 }]) {
  const tokens = {
    findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
      rows.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) ?? null,
    ),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const userRepo = { findOne: jest.fn(async ({ where }: { where: { id: number } }) => users.find((u) => u.id === where.id) ?? null) };
  const guard = new ApiTokenAuthGuard(tokens as never, userRepo as never);
  const request: Record<string, unknown> = {};
  const context = (authorization?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () =>
          Object.assign(request, { header: (n: string) => (n === 'authorization' ? authorization : undefined) }),
      }),
    }) as never;

  return { guard, tokens, request, context };
}

const row = (over: Record<string, unknown> = {}) => ({
  id: 3,
  token: sha(PLAIN),
  tokenableId: 7,
  abilities: '["*"]',
  expiresAt: null,
  ...over,
});

describe('ApiTokenAuthGuard', () => {
  it('accepts "{id}|{plaintext}" and attaches the user and abilities', async () => {
    const { guard, request, context, tokens } = build([row()]);

    await expect(guard.canActivate(context(`Bearer 3|${PLAIN}`))).resolves.toBe(true);
    expect(request.user).toEqual({ id: 7 });
    expect(request.tokenAbilities).toEqual(['*']);
    expect(tokens.update).toHaveBeenCalledWith(3, { lastUsedAt: expect.any(Date) });
  });

  it('accepts the legacy form with no "|" by hashing the whole bearer', async () => {
    const { guard, context } = build([row({ token: sha('legacytoken') })]);

    await expect(guard.canActivate(context('Bearer legacytoken'))).resolves.toBe(true);
  });

  it.each([
    ['no header', undefined],
    ['not a bearer', `Basic 3|${PLAIN}`],
    ['wrong plaintext for a real id', 'Bearer 3|wrong'],
    ['unknown id', `Bearer 99|${PLAIN}`],
    ['non-numeric id', `Bearer abc|${PLAIN}`],
    ['zero id', `Bearer 0|${PLAIN}`],
    // Parsed to 1e20 and overflowed Postgres: a 500 for a request with no
    // valid credentials. Must be the same 401 as any other bad token.
    ['id too large to exist', `Bearer 99999999999999999999|${PLAIN}`],
  ])('refuses %s with the exact 401 body', async (_case, header) => {
    const { guard, context, tokens } = build([row()]);

    const attempt = guard.canActivate(context(header));

    await expect(attempt).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(attempt).rejects.toThrow('Unauthenticated.');
    // The oversized id never reaches the database at all.
    if (header?.includes('99999999999999999999')) expect(tokens.findOne).not.toHaveBeenCalled();
  });

  it('refuses an expired token', async () => {
    const { guard, context } = build([row({ expiresAt: new Date(Date.now() - 1000) })]);

    await expect(guard.canActivate(context(`Bearer 3|${PLAIN}`))).rejects.toThrow('Unauthenticated.');
  });

  it('refuses a valid token whose user no longer exists', async () => {
    const { guard, context } = build([row()], []);

    await expect(guard.canActivate(context(`Bearer 3|${PLAIN}`))).rejects.toThrow('Unauthenticated.');
  });

  it('does not fail the request when recording last_used_at fails', async () => {
    const { guard, context, tokens } = build([row()]);

    tokens.update.mockRejectedValue(new Error('db down'));

    await expect(guard.canActivate(context(`Bearer 3|${PLAIN}`))).resolves.toBe(true);
  });
});
