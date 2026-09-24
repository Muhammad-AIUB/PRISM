import { EventEmitter } from 'node:events';
import type { NextFunction, Request, Response } from 'express';
import { AppLogger } from './app-logger';
import { currentContext, runWithContext } from './request-context';
import { requestIdMiddleware } from './request-id.middleware';

function fakeExchange(incoming?: string) {
  const headers: Record<string, string> = {};
  const response = Object.assign(new EventEmitter(), {
    statusCode: 200,
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
  });
  const request = {
    method: 'GET',
    path: '/api/v1/user',
    header: (name: string) => (name === 'X-Request-Id' ? incoming : undefined),
  };

  return { request: request as unknown as Request, response: response as unknown as Response, headers };
}

function run(incoming?: string) {
  const exchange = fakeExchange(incoming);
  let seen: string | undefined;
  const next: NextFunction = () => {
    seen = currentContext().requestId;
  };

  requestIdMiddleware(exchange.request, exchange.response, next);

  return { ...exchange, seen };
}

describe('requestIdMiddleware', () => {
  it('generates an id, returns it, and makes it current for the rest of the request', () => {
    const { headers, seen } = run();

    expect(headers['X-Request-Id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(seen).toBe(headers['X-Request-Id']);
  });

  it("keeps a caller's id so one id follows a request across services", () => {
    const { headers, seen } = run('web-1f2e.3:a_b');

    expect(headers['X-Request-Id']).toBe('web-1f2e.3:a_b');
    expect(seen).toBe('web-1f2e.3:a_b');
  });

  it.each([
    ['a newline, which would forge a log line', 'abc\nERROR fake'],
    ['spaces', 'a b'],
    ['an oversized id', 'x'.repeat(129)],
    ['an empty id', ''],
  ])('replaces an incoming id containing %s', (_why, incoming) => {
    const { headers } = run(incoming);

    expect(headers['X-Request-Id']).not.toBe(incoming);
    expect(headers['X-Request-Id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('gives concurrent requests their own ids', () => {
    expect(run().seen).not.toBe(run().seen);
  });
});

describe('AppLogger', () => {
  let written: string[];

  beforeEach(() => {
    written = [];
    jest.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      written.push(String(chunk));

      return true;
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('writes JSON lines carrying the request id in production mode', () => {
    const logger = new AppLogger({ json: true });

    runWithContext({ requestId: 'req-1' }, () => logger.log('hello', 'Test'));

    const line = JSON.parse(written.join('')) as Record<string, unknown>;

    expect(line).toMatchObject({ level: 'log', context: 'Test', message: 'hello', requestId: 'req-1' });
    expect(line).not.toHaveProperty('jobId');
  });

  it('carries the job id for queue work', () => {
    const logger = new AppLogger({ json: true });

    runWithContext({ jobId: '42' }, () => logger.log('reviewing', 'ReviewProcessor'));

    expect(JSON.parse(written.join(''))).toMatchObject({ jobId: '42' });
  });

  it('adds nothing outside any request or job', () => {
    const logger = new AppLogger({ json: true });

    logger.log('booting', 'Bootstrap');

    const line = JSON.parse(written.join('')) as Record<string, unknown>;

    expect(line).not.toHaveProperty('requestId');
    expect(line).not.toHaveProperty('jobId');
  });

  it('tags text lines in development mode', () => {
    const logger = new AppLogger({ colors: false });

    runWithContext({ jobId: '7' }, () => logger.log('reviewing', 'ReviewProcessor'));

    expect(written.join('')).toContain('[ReviewProcessor] [job 7]');
  });
});
