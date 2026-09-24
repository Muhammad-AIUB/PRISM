import { GithubClientService } from './github-client.service';

/**
 * listUserRepos() used to return [] for every GitHub failure, so a revoked or
 * missing token rendered as "No repositories found" — indistinguishable from
 * an account that really has none. The caller needs the status to say which.
 */
describe('GithubClientService.listUserRepos', () => {
  let service: GithubClientService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    service = new GithubClientService();
    fetchMock = jest.fn();
    global.fetch = fetchMock as never;
  });

  it('returns the repositories on success', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => [{ id: 1 }] });

    await expect(service.listUserRepos('t')).resolves.toEqual({ ok: true, repos: [{ id: 1 }] });
  });

  it('reports the status when GitHub rejects the token', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });

    await expect(service.listUserRepos('t')).resolves.toEqual({ ok: false, status: 401 });
  });

  it('reports a network failure as status 0', async () => {
    fetchMock.mockRejectedValue(new Error('socket hang up'));

    await expect(service.listUserRepos('t')).resolves.toEqual({ ok: false, status: 0 });
  });
});
