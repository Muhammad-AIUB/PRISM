import { Logger } from '@nestjs/common';
import { AiClientService, GROQ_MODELS, RateLimitedError } from './ai-client.service';

/**
 * What happens when Groq says no.
 *
 * Every non-2xx response used to be treated exactly like unparseable model
 * output: warn, keep the HTTP body as `raw`, fall through to the next model.
 * When both models failed the runner then wrote that body into `reviews.summary`
 * and marked the review COMPLETED — so a rate-limited review looked finished
 * and showed the user Groq's error JSON as its summary.
 *
 * Those are two different failures and they need two different answers. A
 * model that answers badly is a completed review with a degraded summary, which
 * is a deliberate feature. A rate limit is a failed attempt, and BullMQ already
 * knows how to retry one on [60, 180, 600].
 */
const config = { get: () => 'test-key' } as never;

const response = (status: number, body: string) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    headers: new Map(),
  }) as never;

const completion = (content: string) => JSON.stringify({ choices: [{ message: { content } }] });

describe('AiClientService rate limiting', () => {
  let service: AiClientService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    service = new AiClientService(config, { resolve: async () => null } as never);
    fetchMock = jest.fn();
    global.fetch = fetchMock as never;
  });

  it('throws when every model is rate limited', async () => {
    fetchMock.mockResolvedValue(response(429, '{"error":{"message":"Rate limit reached"}}'));

    await expect(
      service.callWithFallback('system', 'user', 'pr_review'),
    ).rejects.toBeInstanceOf(RateLimitedError);

    expect(fetchMock).toHaveBeenCalledTimes(GROQ_MODELS.length);
  });

  it('falls through to the next model when only the first is rate limited', async () => {
    fetchMock
      .mockResolvedValueOnce(response(429, '{"error":{"message":"Rate limit reached"}}'))
      .mockResolvedValueOnce(response(200, completion('{"overall_score": 80}')));

    const result = await service.callWithFallback('system', 'user', 'pr_review');

    expect(result.parsed).toEqual({ overall_score: 80 });
    expect(result.model).toBe(`groq/${GROQ_MODELS[1]}`);
  });

  /**
   * REGRESSION GUARD. The documented graceful-degradation path says that when
   * every model returns unparseable JSON the review still completes, with the
   * raw text kept for the user. Making 429 throw must not make THIS throw.
   */
  it('still degrades gracefully when both models return unparseable JSON', async () => {
    fetchMock.mockResolvedValue(response(200, completion('I am not JSON, sorry.')));

    const result = await service.callWithFallback('system', 'user', 'pr_review');

    expect(result.parsed).toBeNull();
    expect(result.raw).toBe('I am not JSON, sorry.');
  });

  it('does not present an HTTP error body as if it were model output', async () => {
    fetchMock.mockResolvedValue(response(500, '{"error":{"message":"upstream exploded"}}'));

    const result = await service.callWithFallback('system', 'user', 'pr_review');

    expect(result.parsed).toBeNull();
    expect(result.raw).toBeNull();
  });

  it('reports a rate limit on the fixes pass without failing a persisted review', async () => {
    fetchMock.mockResolvedValue(response(429, '{"error":{"message":"Rate limit reached"}}'));

    // The second pass runs AFTER the review row is written. Throwing here would
    // fail a job whose first pass already succeeded and is correct on disk, so
    // this call reports the miss instead.
    await expect(service.call('groq/x', 'system', 'user', 'pr_review')).resolves.toBeNull();
  });
});

describe('AiClientService own model', () => {
  const own = { provider: 'openai' as const, model: 'gpt-4.1', apiKey: 'sk-test-1234' };
  let service: AiClientService;
  let fetchMock: jest.Mock;
  let userAi: { resolve: jest.Mock };

  const answer = (content: string, status = 200) =>
    fetchMock.mockResolvedValueOnce(
      response(status, status === 200 ? completion(content) : '{"error":"bad key"}'),
    );

  beforeEach(() => {
    userAi = { resolve: jest.fn() };
    service = new AiClientService(config, userAi as never);
    fetchMock = jest.fn();
    global.fetch = fetchMock as never;
  });

  it('uses the user model first and labels the result with it', async () => {
    userAi.resolve.mockResolvedValue(own);
    answer('{"overall_score": 90, "summary": "ok"}');

    const result = await service.callWithFallback('S', 'U', 'pr_review', undefined, { userId: 7 });

    expect(result.model).toBe('openai/gpt-4.1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toContain('api.openai.com');
  });

  it('falls back to Groq when the user key is rejected', async () => {
    userAi.resolve.mockResolvedValue(own);
    answer('', 401);
    answer('{"overall_score": 80}');

    const result = await service.callWithFallback('S', 'U', 'pr_review', undefined, { userId: 7 });

    expect(result.model).toBe(`groq/${GROQ_MODELS[0]}`);
  });

  it('falls back to Groq when the user model returns text that is not JSON', async () => {
    userAi.resolve.mockResolvedValue(own);
    answer('I am sorry, I cannot do that.');
    answer('{"overall_score": 80}');

    const result = await service.callWithFallback('S', 'U', 'pr_review', undefined, { userId: 7 });

    expect(result.model).toBe(`groq/${GROQ_MODELS[0]}`);
  });

  it('never puts the key in a log line', async () => {
    userAi.resolve.mockResolvedValue(own);
    answer('', 401);
    answer('{"overall_score": 80}');
    const logs: string[] = [];
    const sink = (message: unknown) => logs.push(String(message));
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(sink);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(sink);

    await service.callWithFallback('S', 'U', 'pr_review', undefined, { userId: 7 });

    expect(logs.join('\n')).not.toContain('sk-test-1234');
  });

  it('never consults user settings when no userId is given', async () => {
    answer('{"overall_score": 80}');

    await service.callWithFallback('S', 'U', 'pr_review');

    expect(userAi.resolve).not.toHaveBeenCalled();
  });

  it('routes the fixes pass by the model label, and only for the saved provider', async () => {
    userAi.resolve.mockResolvedValue(own);
    answer('{"fixes": []}');

    await service.call('openai/gpt-4.1', 'S', 'U', 'pr_review', undefined, { userId: 7 });

    expect(String(fetchMock.mock.calls[0]![0])).toContain('api.openai.com');
  });

  it('does not send a different provider label to the saved key', async () => {
    userAi.resolve.mockResolvedValue(own);

    expect(await service.call('anthropic/claude-x', 'S', 'U', 'pr_review', undefined, { userId: 7 })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the Groq path for a groq/ label even when a user model is saved', async () => {
    userAi.resolve.mockResolvedValue(own);
    answer('{"fixes": []}');

    await service.call(`groq/${GROQ_MODELS[0]}`, 'S', 'U', 'pr_review', undefined, { userId: 7 });

    expect(String(fetchMock.mock.calls[0]![0])).toContain('api.groq.com');
  });
});
