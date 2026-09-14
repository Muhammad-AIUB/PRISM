import { GithubClientService, MAX_DIFF_BYTES } from './github-client.service';

/**
 * The only unbounded allocation in the review pipeline.
 *
 * `request()` ended with `body: await response.text()`, so the entire diff
 * became a materialized UTF-16 string before any caller could look at it. A
 * 40MB monorepo diff is roughly 80MB of heap, on a Render instance with 512MB
 * shared by Nest, TypeORM, pg, ioredis and BullMQ at concurrency 1 — and the
 * whole thing was then written into Redis for an hour.
 *
 * Capping it at the caller frees nothing: by then the allocation has happened.
 * An engineering review nearly shipped exactly that. The bound has to be on the
 * read itself.
 */
const chunk = (text: string) => new TextEncoder().encode(text);

const streamOf = (parts: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(chunk(part));
      }

      controller.close();
    },
  });

const respond = (parts: string[], status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    body: streamOf(parts),
    text: async () => parts.join(''),
  }) as never;

describe('GithubClientService diff size bound', () => {
  let service: GithubClientService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    service = new GithubClientService();
    fetchMock = jest.fn();
    global.fetch = fetchMock as never;
  });

  it('returns a small diff untouched', async () => {
    const diff = 'diff --git a/a.ts b/a.ts\n@@ -1 +1 @@\n+x\n';
    fetchMock.mockResolvedValue(respond([diff]));

    expect(await service.fetchPullRequestDiff('t', 'o/r', 1)).toBe(diff);
  });

  it('stops reading once the cap is reached instead of buffering the rest', async () => {
    const line = `${'+'.padEnd(200, 'x')}\n`;
    const parts = Array.from({ length: Math.ceil((MAX_DIFF_BYTES * 2) / line.length) }, () => line);
    fetchMock.mockResolvedValue(respond(parts));

    const diff = await service.fetchPullRequestDiff('t', 'o/r', 1);

    expect(diff.length).toBeLessThanOrEqual(MAX_DIFF_BYTES);
    expect(diff.length).toBeGreaterThan(MAX_DIFF_BYTES / 2);
  });

  it('cuts on a line boundary, so the parser never sees half a line', async () => {
    const line = `${'+'.padEnd(200, 'x')}\n`;
    const parts = Array.from({ length: Math.ceil((MAX_DIFF_BYTES * 2) / line.length) }, () => line);
    fetchMock.mockResolvedValue(respond(parts));

    const diff = await service.fetchPullRequestDiff('t', 'o/r', 1);

    expect(diff.endsWith('\n')).toBe(true);
  });

  it('applies the same bound to a commit diff', async () => {
    const line = `${'+'.padEnd(200, 'y')}\n`;
    const parts = Array.from({ length: Math.ceil((MAX_DIFF_BYTES * 2) / line.length) }, () => line);
    fetchMock.mockResolvedValue(respond(parts));

    const diff = await service.fetchCommitDiff('t', 'o/r', 'abc123');

    expect(diff.length).toBeLessThanOrEqual(MAX_DIFF_BYTES);
  });

  it('still throws on a non-2xx rather than returning a partial body', async () => {
    fetchMock.mockResolvedValue(respond(['not found'], 404));

    await expect(service.fetchPullRequestDiff('t', 'o/r', 1)).rejects.toThrow('404');
  });
});
