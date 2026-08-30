import { Injectable, Logger } from '@nestjs/common';

/**
 * The GitHub calls both Laravel jobs make. Two diff fetches (different
 * endpoints for PRs and commits) and two comment posts (likewise).
 *
 * The diff fetches throw on a non-2xx so BullMQ retries the job, matching
 * Laravel's RuntimeException. The comment posts deliberately do NOT check the
 * response: Laravel fires them and moves on, so a repo where the token lost
 * write access still completes the review instead of failing it.
 */
const API_ROOT = 'https://api.github.com';
const DIFF_ACCEPT = 'application/vnd.github.v3.diff';
const REQUEST_TIMEOUT_MS = 30_000;

@Injectable()
export class GithubClientService {
  private readonly logger = new Logger(GithubClientService.name);

  /** GET /repos/{full_name}/pulls/{pr_number} as a unified diff. */
  async fetchPullRequestDiff(token: string, fullName: string, prNumber: number): Promise<string> {
    const response = await this.request(
      `${API_ROOT}/repos/${fullName}/pulls/${prNumber}`,
      token,
      DIFF_ACCEPT,
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch diff: ${response.status}`);
    }

    return response.body;
  }

  /** GET /repos/{full_name}/commits/{sha} as a unified diff. */
  async fetchCommitDiff(token: string, fullName: string, sha: string): Promise<string> {
    const response = await this.request(
      `${API_ROOT}/repos/${fullName}/commits/${sha}`,
      token,
      DIFF_ACCEPT,
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch commit diff: ${response.status}`);
    }

    return response.body;
  }

  /** PR summaries go on the issue timeline, not the review API. */
  async postPullRequestComment(
    token: string,
    fullName: string,
    prNumber: number,
    body: string,
  ): Promise<void> {
    await this.postComment(
      `${API_ROOT}/repos/${fullName}/issues/${prNumber}/comments`,
      token,
      body,
    );
  }

  /** Commits have their own comments endpoint. */
  async postCommitComment(
    token: string,
    fullName: string,
    sha: string,
    body: string,
  ): Promise<void> {
    await this.postComment(
      `${API_ROOT}/repos/${fullName}/commits/${sha}/comments`,
      token,
      body,
    );
  }

  /**
   * GET /user/repos?per_page=100&sort=updated
   *
   * Laravel returns an empty list on any failure rather than surfacing an
   * error, so a revoked token shows an empty repository picker instead of a
   * 500. Same here.
   */
  async listUserRepos(token: string): Promise<unknown[]> {
    const response = await this.requestJson<unknown[]>(
      `${API_ROOT}/user/repos?per_page=100&sort=updated`,
      token,
    );

    return Array.isArray(response) ? response : [];
  }

  /** GET /repos/{full_name} — used for `default_branch`. */
  async getRepo(token: string, fullName: string): Promise<{ default_branch?: string } | null> {
    return this.requestJson<{ default_branch?: string }>(
      `${API_ROOT}/repos/${fullName}`,
      token,
      10_000,
    );
  }

  /** GET /repos/{full_name}/branches?per_page=100 */
  async listBranches(token: string, fullName: string): Promise<{ name: string }[] | null> {
    return this.requestJson<{ name: string }[]>(
      `${API_ROOT}/repos/${fullName}/branches?per_page=100`,
      token,
      10_000,
    );
  }

  /**
   * POST /repos/{full_name}/hooks — installs the webhook when a repository is
   * connected. The caller needs to know whether this failed: Laravel deletes
   * the freshly created row and reports the error when it does, so a
   * half-connected repository never exists.
   */
  async createWebhook(
    token: string,
    fullName: string,
    input: { url: string; secret: string; events: string[] },
  ): Promise<{ ok: boolean; id: number | null; message: string | null }> {
    const response = await this.send(`${API_ROOT}/repos/${fullName}/hooks`, token, 'POST', {
      name: 'web',
      active: true,
      events: input.events,
      config: { url: input.url, content_type: 'json', secret: input.secret },
    });

    const body = this.parseJson<{ id?: number; message?: string }>(response.body);

    return {
      ok: response.ok,
      id: typeof body?.id === 'number' ? body.id : null,
      message: body?.message ?? null,
    };
  }

  /**
   * PATCH /repos/{full_name}/hooks/{id} — keeps the event subscriptions in
   * step with review_mode. Failures are logged, not thrown: Laravel saves the
   * local settings either way, so the row must not roll back over this.
   */
  async updateWebhookEvents(
    token: string,
    fullName: string,
    webhookId: number,
    events: string[],
  ): Promise<void> {
    try {
      const response = await this.send(
        `${API_ROOT}/repos/${fullName}/hooks/${webhookId}`,
        token,
        'PATCH',
        { events, active: true },
      );

      if (!response.ok) {
        this.logger.warn(
          `GitHub webhook patch failed ${JSON.stringify({
            repo: fullName,
            status: response.status,
            body: response.body.slice(0, 300),
          })}`,
        );
      }
    } catch (error) {
      this.logger.warn(`GitHub webhook patch threw: ${this.messageOf(error)}`);
    }
  }

  /**
   * DELETE /repos/{full_name}/hooks/{id} — run before wiping a user's data so
   * GitHub stops delivering to a repository we will no longer recognise.
   *
   * Never throws: this runs inside an account deletion the user has already
   * confirmed, and a GitHub outage must not leave that half-done.
   */
  async deleteWebhook(token: string, fullName: string, webhookId: number): Promise<void> {
    try {
      const response = await fetch(`${API_ROOT}/repos/${fullName}/hooks/${webhookId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'PRism',
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        this.logger.warn(
          `Failed to uninstall webhook on data deletion ${JSON.stringify({
            repo: fullName,
            status: response.status,
          })}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Failed to uninstall webhook on data deletion ${JSON.stringify({
          repo: fullName,
          error: this.messageOf(error),
        })}`,
      );
    }
  }

  private async requestJson<T>(url: string, token: string, timeoutMs?: number): Promise<T | null> {
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'PRism',
        },
        signal: AbortSignal.timeout(timeoutMs ?? REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        return null;
      }

      return (await response.json()) as T;
    } catch (error) {
      this.logger.warn(`GitHub GET ${url} failed: ${this.messageOf(error)}`);

      return null;
    }
  }

  private async send(
    url: string,
    token: string,
    method: 'POST' | 'PATCH',
    payload: unknown,
  ): Promise<{ ok: boolean; status: number; body: string }> {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'PRism',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    return { ok: response.ok, status: response.status, body: await response.text() };
  }

  private parseJson<T>(body: string): T | null {
    try {
      return JSON.parse(body) as T;
    } catch {
      return null;
    }
  }

  private messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private async postComment(url: string, token: string, body: string): Promise<void> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'PRism',
        },
        body: JSON.stringify({ body }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        this.logger.warn(`GitHub comment post returned ${response.status} for ${url}`);
      }
    } catch (error) {
      // Never fail the review over a comment we could not post.
      this.logger.warn(
        `GitHub comment post failed for ${url}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async request(
    url: string,
    token: string,
    accept: string,
  ): Promise<{ ok: boolean; status: number; body: string }> {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: accept,
        'User-Agent': 'PRism',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    return { ok: response.ok, status: response.status, body: await response.text() };
  }
}
