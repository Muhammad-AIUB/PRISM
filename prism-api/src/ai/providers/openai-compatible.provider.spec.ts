import { OpenAiCompatibleProvider, OPENAI, GOOGLE, OPENROUTER } from './openai-compatible.provider';

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const req = { model: 'm', system: 'S', user: 'U', context: 'pr_review' as const, apiKey: 'k-123456' };

afterEach(() => jest.restoreAllMocks());

it('calls the fixed OpenAI URL with a bearer key, and no temperature (newer models reject it)', async () => {
  const f = jest.spyOn(global, 'fetch').mockResolvedValue(ok({ choices: [{ message: { content: '{}' } }] }));

  await new OpenAiCompatibleProvider(OPENAI).complete(req);

  const [url, init] = f.mock.calls[0]!;
  const body = JSON.parse((init as RequestInit).body as string);
  expect(url).toBe('https://api.openai.com/v1/chat/completions');
  expect((init as RequestInit).redirect).toBe('error');
  expect(body.temperature).toBeUndefined();
  expect(body.max_completion_tokens).toBe(8192);
  expect(body.response_format).toEqual({ type: 'json_object' });
});

it('uses max_tokens and temperature 0.2 for OpenRouter, without JSON mode', async () => {
  const f = jest.spyOn(global, 'fetch').mockResolvedValue(ok({ choices: [{ message: { content: '{}' } }] }));

  await new OpenAiCompatibleProvider(OPENROUTER).complete(req);

  const body = JSON.parse((f.mock.calls[0]![1] as RequestInit).body as string);
  expect(f.mock.calls[0]![0]).toBe('https://openrouter.ai/api/v1/chat/completions');
  expect(body.max_tokens).toBe(8192);
  expect(body.temperature).toBe(0.2);
  expect(body.response_format).toBeUndefined();
});

it('lists OpenAI chat models only, sorted', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue(
    ok({
      data: [
        { id: 'text-embedding-3-small' },
        { id: 'gpt-4.1' },
        { id: 'whisper-1' },
        { id: 'o3-mini' },
        { id: 'gpt-4o-audio-preview' },
      ],
    }),
  );

  expect(await new OpenAiCompatibleProvider(OPENAI).listModels('k')).toEqual(['gpt-4.1', 'o3-mini']);
});

it('strips the models/ prefix Gemini adds and keeps gemini ids', async () => {
  jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(ok({ data: [{ id: 'models/gemini-2.5-flash' }, { id: 'models/embedding-001' }] }));

  expect(await new OpenAiCompatibleProvider(GOOGLE).listModels('k')).toEqual(['gemini-2.5-flash']);
});

it('rejects with a clear error when the provider refuses the key', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{"error":"bad key"}', { status: 401 }));

  await expect(new OpenAiCompatibleProvider(OPENAI).listModels('k')).rejects.toMatchObject({ status: 401 });
});
