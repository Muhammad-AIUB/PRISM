import type { User } from '../../database/entities';
import { AiSettingsService } from './ai-settings.service';

const provider = { listModels: jest.fn() };

jest.mock('../../ai/providers/registry', () => ({
  providerFor: () => provider,
  SELECTABLE_PROVIDERS: [
    { id: 'openai', label: 'OpenAI' },
    { id: 'google', label: 'Google Gemini' },
    { id: 'openrouter', label: 'OpenRouter' },
    { id: 'anthropic', label: 'Anthropic Claude' },
  ],
}));

const user = { id: 7 } as User;

describe('AiSettingsService', () => {
  let userAi: { resolve: jest.Mock; describe: jest.Mock; save: jest.Mock; clear: jest.Mock };
  let audit: { record: jest.Mock };
  let service: AiSettingsService;

  beforeEach(() => {
    provider.listModels.mockReset();
    userAi = {
      resolve: jest.fn().mockResolvedValue(null),
      describe: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new AiSettingsService(userAi as never, audit as never);
  });

  it('lists models using the typed key', async () => {
    provider.listModels.mockResolvedValue(['gpt-4.1']);

    expect(await service.models(user, { provider: 'openai', api_key: 'sk-new' })).toEqual({
      models: ['gpt-4.1'],
    });
    expect(provider.listModels).toHaveBeenCalledWith('sk-new', expect.anything());
  });

  it('lists models with the saved key when none is typed and the provider matches', async () => {
    userAi.resolve.mockResolvedValue({ provider: 'openai', model: 'a', apiKey: 'sk-saved' });
    provider.listModels.mockResolvedValue(['gpt-4.1']);

    await service.models(user, { provider: 'openai' });

    expect(provider.listModels).toHaveBeenCalledWith('sk-saved', expect.anything());
  });

  it('asks for a key when none is typed and the saved one is another provider', async () => {
    userAi.resolve.mockResolvedValue({ provider: 'anthropic', model: 'a', apiKey: 'sk-saved' });

    const error = await service.models(user, { provider: 'openai' }).catch((e) => e);

    expect(error.getStatus()).toBe(422);
    expect(error.getResponse()).toMatchObject({ errors: { api_key: ['Enter your API key.'] } });
    expect(provider.listModels).not.toHaveBeenCalled();
  });

  it('answers a rejected key with a 422 {message, errors}, never echoing the key', async () => {
    provider.listModels.mockRejectedValue(Object.assign(new Error('x'), { status: 401 }));

    const error = await service
      .models(user, { provider: 'openai', api_key: 'sk-secret-9999' })
      .catch((e) => e);

    expect(error.getStatus()).toBe(422);
    expect(error.getResponse()).toMatchObject({
      errors: { api_key: [expect.stringContaining('rejected')] },
    });
    expect(JSON.stringify(error.getResponse())).not.toContain('sk-secret-9999');
  });

  it('says the provider could not be reached on other failures', async () => {
    provider.listModels.mockRejectedValue(new Error('boom'));

    const error = await service.models(user, { provider: 'openai', api_key: 'sk-x' }).catch((e) => e);

    expect(error.getResponse()).toMatchObject({
      errors: { api_key: [expect.stringContaining('Could not reach')] },
    });
  });

  it('refuses to save a model the provider does not list', async () => {
    provider.listModels.mockResolvedValue(['gpt-4.1']);

    await expect(
      service.save(user, { provider: 'openai', model: 'made-up', api_key: 'sk-x' }),
    ).rejects.toMatchObject({ response: { errors: { model: expect.any(Array) } } });
    expect(userAi.save).not.toHaveBeenCalled();
  });

  it('saves, then audits without the key', async () => {
    provider.listModels.mockResolvedValue(['gpt-4.1']);
    userAi.describe.mockResolvedValue({ provider: 'openai', model: 'gpt-4.1', key_hint: '9999', updated_at: null });

    await service.save(user, { provider: 'openai', model: 'gpt-4.1', api_key: 'sk-secret-9999' });

    expect(userAi.save).toHaveBeenCalledWith(user.id, {
      provider: 'openai',
      model: 'gpt-4.1',
      apiKey: 'sk-secret-9999',
    });
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain('sk-secret-9999');
  });

  it('clear removes the setting and audits it', async () => {
    await service.clear(user);

    expect(userAi.clear).toHaveBeenCalledWith(7);
    expect(audit.record).toHaveBeenCalledWith(7, 'ai_settings_cleared', expect.any(String));
  });

  it('index never returns a key', async () => {
    userAi.describe.mockResolvedValue({ provider: 'openai', model: 'm', key_hint: '9999', updated_at: null });

    expect(JSON.stringify(await service.index(user))).not.toMatch(/sk-/);
  });
});
