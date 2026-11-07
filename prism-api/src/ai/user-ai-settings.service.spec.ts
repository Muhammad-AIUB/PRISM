import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import { CryptService } from '../common/utils/crypt.service';
import type { UserAiSettings } from '../database/entities';
import { UserAiSettingsService } from './user-ai-settings.service';

const APP_KEY = `base64:${Buffer.alloc(32, 7).toString('base64')}`;

describe('UserAiSettingsService', () => {
  let rows: Map<number, UserAiSettings>;
  let service: UserAiSettingsService;

  beforeEach(() => {
    rows = new Map();
    const repository = {
      findOne: async ({ where }: { where: { userId: number } }) => rows.get(where.userId) ?? null,
      save: async (row: UserAiSettings) => {
        rows.set(row.userId, { ...row });

        return row;
      },
      delete: async ({ userId }: { userId: number }) => {
        rows.delete(userId);
      },
    } as unknown as Repository<UserAiSettings>;
    const crypt = new CryptService({
      get: (key: string) => (key === 'app.key' ? APP_KEY : undefined),
    } as unknown as ConfigService);

    service = new UserAiSettingsService(repository, crypt);
  });

  it('stores the key encrypted and describes it by its last four characters only', async () => {
    await service.save(7, { provider: 'openai', model: 'gpt-4.1', apiKey: 'sk-abcdef123456' });

    expect(rows.get(7)!.apiKey).not.toContain('sk-abcdef123456');
    expect(await service.describe(7)).toMatchObject({
      provider: 'openai',
      model: 'gpt-4.1',
      key_hint: '3456',
    });
    expect(JSON.stringify(await service.describe(7))).not.toContain('sk-abcdef');
  });

  it('resolves the plaintext key for the pipeline', async () => {
    await service.save(7, { provider: 'anthropic', model: 'm', apiKey: 'sk-ant-xyz9876' });

    expect(await service.resolve(7)).toEqual({
      provider: 'anthropic',
      model: 'm',
      apiKey: 'sk-ant-xyz9876',
    });
  });

  it('keeps the existing key when the same provider is saved without one', async () => {
    await service.save(7, { provider: 'openai', model: 'a', apiKey: 'sk-aaaa1111' });
    await service.save(7, { provider: 'openai', model: 'b' });

    expect(await service.resolve(7)).toMatchObject({ model: 'b', apiKey: 'sk-aaaa1111' });
  });

  it('refuses a provider change without a new key', async () => {
    await service.save(7, { provider: 'openai', model: 'a', apiKey: 'sk-aaaa1111' });

    await expect(service.save(7, { provider: 'google', model: 'g' })).rejects.toThrow('API key');
  });

  it('treats an unreadable key (rotated APP_KEY) as no key instead of throwing', async () => {
    await service.save(7, { provider: 'openai', model: 'a', apiKey: 'sk-aaaa1111' });
    rows.get(7)!.apiKey = 'not-decryptable';

    expect(await service.resolve(7)).toBeNull();
  });

  it('clear removes the row', async () => {
    await service.save(7, { provider: 'openai', model: 'a', apiKey: 'sk-aaaa1111' });
    await service.clear(7);

    expect(await service.resolve(7)).toBeNull();
  });
});
