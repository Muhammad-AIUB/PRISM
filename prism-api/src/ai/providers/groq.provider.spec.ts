import { GroqProvider, GROQ_MODELS } from './groq.provider';

describe('GroqProvider', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sends the exact payload the pipeline has always sent', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: '{"a":1}' } }] }), { status: 200 }),
    );

    const result = await new GroqProvider().complete({
      model: GROQ_MODELS[0]!,
      system: 'SYS',
      user: 'USR',
      context: 'pr_review',
      apiKey: 'gsk_test',
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);

    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer gsk_test' });
    expect(body).toMatchObject({
      model: GROQ_MODELS[0],
      temperature: 0.2,
      response_format: { type: 'json_object' },
      max_completion_tokens: 8192,
      include_reasoning: false,
      messages: [
        { role: 'system', content: 'SYS' },
        { role: 'user', content: 'USR' },
      ],
    });
    expect(result).toMatchObject({ ok: true, status: 200, content: '{"a":1}' });
  });

  it('reports a transport failure as a non-ok result instead of throwing', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('socket hang up'));

    const result = await new GroqProvider().complete({
      model: 'm', system: 's', user: 'u', context: 'pr_review', apiKey: 'k',
    });

    expect(result).toMatchObject({ ok: false, status: 0, content: null });
  });
});
