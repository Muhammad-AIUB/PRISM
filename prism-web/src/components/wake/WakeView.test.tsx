import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WakeView from './WakeView';

const API = 'https://api.example.test';

const asleep = () =>
  new Response('Too Many Requests', {
    status: 429,
    headers: { 'x-render-routing': 'hibernate-rate-limited' },
  });
const awake = () => new Response('"Unauthenticated."', { status: 401 });

/**
 * Render will not start a sleeping prism-api for a request that prism-web
 * proxies, only for one that reaches the API directly. So this page has the
 * visitor's browser make that direct request, and watches the proxied path to
 * learn when the API is answering again.
 */
describe('WakeView', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const onAwake = vi.fn();

  /** Answers for the proxied status check; the direct ping never settles. */
  let status: () => Response;

  const calls = (prefix: string) =>
    fetchMock.mock.calls.filter(([url]) => String(url).startsWith(prefix));

  beforeEach(() => {
    vi.useFakeTimers();
    onAwake.mockReset();
    status = asleep;
    fetchMock.mockReset().mockImplementation((url) =>
      String(url).startsWith(API) ? new Promise<Response>(() => {}) : Promise.resolve(status()),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("pings the API directly from the visitor's browser", async () => {
    render(<WakeView apiOrigin={API} next="/dashboard" onAwake={onAwake} />);
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(calls(API)).toHaveLength(1);
    expect(calls(API)[0]).toEqual([
      `${API}/health`,
      expect.objectContaining({ mode: 'no-cors', cache: 'no-store' }),
    ]);
  });

  it('stays put while the API is asleep', async () => {
    render(<WakeView apiOrigin={API} next="/dashboard" onAwake={onAwake} />);
    await act(() => vi.advanceTimersByTimeAsync(30_000));

    expect(calls('/auth/me').length).toBeGreaterThan(5);
    expect(onAwake).not.toHaveBeenCalled();
    expect(screen.getByText('Starting the server')).toBeInTheDocument();
  });

  it('continues to the page as soon as the API answers', async () => {
    render(<WakeView apiOrigin={API} next="/repositories/3" onAwake={onAwake} />);
    await act(() => vi.advanceTimersByTimeAsync(9_000));
    expect(onAwake).not.toHaveBeenCalled();

    status = awake;
    await act(() => vi.advanceTimersByTimeAsync(3_000));

    expect(onAwake).toHaveBeenCalledTimes(1);
    expect(onAwake).toHaveBeenCalledWith('/repositories/3');

    // And then it stops: no more checks, no more pings.
    const total = fetchMock.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(fetchMock.mock.calls.length).toBe(total);
    expect(onAwake).toHaveBeenCalledTimes(1);
  });

  it('leaves at once when the API was already awake', async () => {
    status = awake;

    render(<WakeView apiOrigin={API} next="/dashboard" onAwake={onAwake} />);
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(onAwake).toHaveBeenCalledWith('/dashboard');
  });

  it('pings again if the first attempt did not take', async () => {
    render(<WakeView apiOrigin={API} next="/dashboard" onAwake={onAwake} />);
    await act(() => vi.advanceTimersByTimeAsync(25_000));

    expect(calls(API).length).toBeGreaterThanOrEqual(2);
  });

  it('keeps waiting through a failed check', async () => {
    fetchMock.mockImplementation((url) =>
      String(url).startsWith(API)
        ? new Promise<Response>(() => {})
        : Promise.reject(new TypeError('network')),
    );

    render(<WakeView apiOrigin={API} next="/dashboard" onAwake={onAwake} />);
    await act(() => vi.advanceTimersByTimeAsync(10_000));

    expect(onAwake).not.toHaveBeenCalled();
    expect(screen.getByText('Starting the server')).toBeInTheDocument();
  });

  it('says so, and offers a retry, when it is taking too long', async () => {
    render(<WakeView apiOrigin={API} next="/repositories/3" onAwake={onAwake} />);

    expect(screen.queryByRole('link', { name: 'Try again' })).not.toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(120_000));

    expect(screen.getByRole('link', { name: 'Try again' })).toHaveAttribute(
      'href',
      '/repositories/3',
    );
  });
});
