import { createHash } from 'node:crypto';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PersonalAccessTokenService } from '../../auth/personal-access-token.service';
import type { PersonalAccessToken, User } from '../../database/entities';
import { TestSlackDto, UpdateSettingsDto } from './dto/settings.dto';
import { SettingsService } from './settings.service';

const user = { id: 7, name: 'Ada', email: 'ada@example.com' } as User;

function build() {
  const rows: PersonalAccessToken[] = [];
  const tokenRepo = {
    create: (row: Partial<PersonalAccessToken>) => row,
    save: jest.fn((row: PersonalAccessToken) => {
      const saved = { ...row, id: rows.length + 101 };
      rows.push(saved);
      return Promise.resolve(saved);
    }),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    find: jest.fn().mockResolvedValue([]),
  };
  const users = { update: jest.fn().mockResolvedValue(undefined) };
  const auditLog = { record: jest.fn().mockResolvedValue(undefined) };
  const tokens = new PersonalAccessTokenService(tokenRepo as never);
  const service = new SettingsService(users as never, tokens, auditLog as never);

  return { service, rows, tokenRepo, users, auditLog };
}

describe('SettingsService: API tokens', () => {
  // Deployed MCP servers hold tokens in this exact shape; see CLAUDE.md.
  it('returns "{id}|{plaintext}" once and stores only sha256(plaintext)', async () => {
    const { service, rows } = build();

    const result = await service.createApiToken(user, 'laptop');
    const [id, plaintext] = result.new_api_token.split('|');
    const row = rows[0] as PersonalAccessToken;

    expect(Number(id)).toBe(row.id);
    expect(plaintext).toMatch(/^[A-Za-z0-9]{40}$/);
    expect(row.token).toBe(createHash('sha256').update(plaintext as string).digest('hex'));
    expect(JSON.stringify(row)).not.toContain(plaintext);
    expect(row).toMatchObject({ tokenableType: 'App\\Models\\User', tokenableId: 7, abilities: '["*"]' });
    expect(result.token).not.toHaveProperty('token');
  });

  it('mints a different secret every time', async () => {
    const { service } = build();

    const a = await service.createApiToken(user, 'a');
    const b = await service.createApiToken(user, 'b');

    expect(a.new_api_token.split('|')[1]).not.toBe(b.new_api_token.split('|')[1]);
  });

  it("revokes only among the caller's own tokens", async () => {
    const { service, tokenRepo, auditLog } = build();

    await service.revokeApiToken(user, 55);

    // Deleting by id alone would let any signed-in user delete anyone's token.
    expect(tokenRepo.delete).toHaveBeenCalledWith({
      id: 55,
      tokenableType: 'App\\Models\\User',
      tokenableId: 7,
    });
    expect(auditLog.record).toHaveBeenCalledWith(7, 'api_token_revoked', expect.any(String), {
      token_id: 55,
    });
  });

  it('lists tokens without their hashes', async () => {
    const { service, tokenRepo } = build();

    tokenRepo.find.mockResolvedValue([
      { id: 1, name: 'cli', token: 'deadbeef', lastUsedAt: null, createdAt: new Date(0) },
    ]);

    const { api_tokens } = await service.index(user);

    expect(api_tokens).toEqual([
      { id: 1, name: 'cli', last_used_at: null, created_at: '1970-01-01T00:00:00+00:00' },
    ]);
  });
});

describe('SettingsService.update', () => {
  it('writes the webhook when it is sent', async () => {
    const { service, users } = build();

    await service.update(user, { slack_webhook_url: 'https://hooks.slack.com/services/x' });

    expect(users.update).toHaveBeenCalledWith(7, {
      slackWebhookUrl: 'https://hooks.slack.com/services/x',
      updatedAt: expect.any(Date) as Date,
    });
  });

  it('clears the webhook on an explicit null', async () => {
    const { service, users } = build();

    await service.update(user, { slack_webhook_url: null });

    expect(users.update).toHaveBeenCalledWith(7, expect.objectContaining({ slackWebhookUrl: null }));
  });

  it('leaves the row alone when the key is absent', async () => {
    const { service, users } = build();

    await service.update(user, {});

    expect(users.update).not.toHaveBeenCalled();
  });
});

describe('SettingsService.testSlack', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reports success', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('ok', { status: 200 }));

    await expect(build().service.testSlack('https://hooks.slack.com/x')).resolves.toEqual({
      ok: true,
      message: 'Test message sent to Slack!',
    });
  });

  it("passes Slack's refusal through", async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('invalid_token', { status: 403 }));

    await expect(build().service.testSlack('https://hooks.slack.com/x')).resolves.toEqual({
      ok: false,
      message: 'Slack returned: invalid_token',
    });
  });

  it('turns a network failure into a message, not a 500', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));

    await expect(build().service.testSlack('https://hooks.slack.com/x')).resolves.toEqual({
      ok: false,
      message: 'Failed: getaddrinfo ENOTFOUND',
    });
  });
});

/**
 * The prefix check is what stops the Slack test endpoint being a request
 * forwarder to any URL, internal ones included.
 */
describe('Slack webhook validation', () => {
  const errorsFor = async (cls: typeof TestSlackDto | typeof UpdateSettingsDto, url: unknown) =>
    (await validate(plainToInstance(cls, { slack_webhook_url: url }))).length;

  it.each([
    'http://169.254.169.254/latest/meta-data/',
    'http://hooks.slack.com/services/x',
    'https://hooks.slack.com.evil.example/x',
    'https://evil.example/?https://hooks.slack.com/',
    'https://localhost:6379/',
  ])('refuses %s', async (url) => {
    expect(await errorsFor(TestSlackDto, url)).toBeGreaterThan(0);
    expect(await errorsFor(UpdateSettingsDto, url)).toBeGreaterThan(0);
  });

  it('accepts a Slack webhook', async () => {
    expect(await errorsFor(TestSlackDto, 'https://hooks.slack.com/services/T/B/x')).toBe(0);
  });

  it('accepts null on update, which is how the webhook is cleared', async () => {
    expect(await errorsFor(UpdateSettingsDto, null)).toBe(0);
  });
});
