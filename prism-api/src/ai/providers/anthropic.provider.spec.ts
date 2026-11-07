import { AnthropicProvider } from './anthropic.provider';

afterEach(() => jest.restoreAllMocks());

it('posts to the Messages API with x-api-key and a version header', async () => {
  const f = jest.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ content: [{ type: 'text', text: '{"a":1}' }] }), { status: 200 }),
  );

  const result = await new AnthropicProvider().complete({
    model: 'claude-x',
    system: 'S',
    user: 'U',
    context: 'pr_review',
    apiKey: 'sk-ant-1234',
  });

  const [url, init] = f.mock.calls[0]!;
  const body = JSON.parse((init as RequestInit).body as string);
  expect(url).toBe('https://api.anthropic.com/v1/messages');
  expect((init as RequestInit).headers).toMatchObject({
    'x-api-key': 'sk-ant-1234',
    'anthropic-version': '2023-06-01',
  });
  expect(body).toMatchObject({
    model: 'claude-x',
    system: 'S',
    max_tokens: 8192,
    messages: [{ role: 'user', content: 'U' }],
  });
  expect(result.content).toBe('{"a":1}');
});

it('lists models sorted and rejects without echoing the body', async () => {
  const f = jest
    .spyOn(global, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'b' }, { id: 'a' }] }), { status: 200 }));

  expect(await new AnthropicProvider().listModels('k')).toEqual(['a', 'b']);

  f.mockResolvedValueOnce(new Response('secret body', { status: 403 }));
  const error = await new AnthropicProvider().listModels('k').catch((e: Error) => e);
  expect(error).toMatchObject({ status: 403 });
  expect((error as Error).message).not.toContain('secret');
});
