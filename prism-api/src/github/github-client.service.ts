import { Injectable, Logger } from '@nestjs/common';

/**
 * The GitHub calls both the original jobs make. Two diff fetches (different
 * endpoints for PRs and commits) and two comment posts (likewise).
 *
 * The diff fetches throw on a non-2xx so BullMQ retries the job, matching
 * the original's RuntimeException. The comment posts deliberately do NOT check the
 * response: The original fires them and moves on, so a repo where the token lost
 * write access still completes the review instead of failing it.
 */
const API_ROOT = 'https://api.github.com';
const DIFF_ACCEPT = 'application/vnd.github.v3.diff';

/** Exported: the BullMQ job budget is derived from it. See review.queue.ts. */
export const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Hard ceiling on how much of a diff is ever held in memory.
 *
 * Deliberately far above the review budget, so it only fires on diffs nobody
 * was going to review in full anyway. The point is not truncation — selection
 * already handles that — it is that the worker runs in 512MB alongside Nest,
 * TypeORM, pg, ioredis and BullMQ, and a monorepo diff read whole is the one
 * allocation in this pipeline with no upper bound at all.
 *
 * It has to be enforced while reading. Slicing the string afterwards frees
 * nothing, because by then the whole thing has already been allocated.
 */
export const MAX_DIFF_BYTES = 2_000_000;

@Injectable()
export class GithubClientService {
  private readonly logger = new Logger(GithubClientService.name);

  /** GET /repos/{full_name}/pulls/{pr_number} as a unified diff. */
  async fetchPullRequestDiff(
    token: string,
    fullName: string,
    prNumber: number,
    signal?: AbortSignal,
  ): Promise<string> {
    const response = await this.request(
      `${API_ROOT}/repos/${fullName}/pulls/${prNumber}`,
      token,
      DIFF_ACCEPT,
      signal,
      true,
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch diff: ${response.status}`);
    }

    return response.body;
  }

  /**
   * Reads at most MAX_DIFF_BYTES and abandons the rest of the stream.
   *
   * Cutting lands on a line boundary for two reasons: the diff parser walks
   * lines and must never be handed half of one, and a cut inside a multi-byte
   * character would otherwise leave a replacement character behind.
   */
  private async readBounded(body: ReadableStream<Uint8Array> | null): Promise<string> {
    if (!body) {
      return '';
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    let bytes = 0;

    try {
      for (;;) {
        const { done, value } = await reader.read();

        if (done) {
          return text + decoder.decode();
        }

        bytes += value.byteLength;

        if (bytes >= MAX_DIFF_BYTES) {
          text += decoder.decode(value, { stream: true }) + decoder.decode();

          // The chunk that crossed the line is appended whole, so cut back to
          // the ceiling and then to the last line break. "Ceiling" has to mean
          // ceiling, or the bound is really "cap plus whatever one chunk is".
          const capped = text.slice(0, MAX_DIFF_BYTES);
          const lastBreak = capped.lastIndexOf('\n');

          return lastBreak === -1 ? capped : capped.slice(0, lastBreak + 1);
        }

        text += decoder.decode(value, { stream: true });
      }
    } finally {
      // Releases the socket rather than letting the rest of a huge response
      // keep arriving into a buffer nobody will read.
      await reader.cancel().catch(() => undefined);
    }
  }

  /** GET /repos/{full_name}/commits/{sha} as a unified diff. */
  async fetchCommitDiff(
    token: string,
    fullName: string,
    sha: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const response = await this.request(
      `${API_ROOT}/repos/${fullName}/commits/${sha}`,
      token,
      DIFF_ACCEPT,
      signal,
      true,
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
    signal?: AbortSignal,
  ): Promise<void> {
    await this.postComment(
      `${API_ROOT}/repos/${fullName}/issues/${prNumber}/comments`,
      token,
      body,
      signal,
    );
  }

  /** Commits have their own comments endpoint. */
  async postCommitComment(
    token: string,
    fullName: string,
    sha: string,
    body: string,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.postComment(
      `${API_ROOT}/repos/${fullName}/commits/${sha}/comments`,
      token,
      body,
      signal,
    );
  }

  /**
   * GET /user/repos?per_page=100&sort=updated
   *
   * The original returns an empty list on any failure rather than surfacing an
   * error, so a revoked token shows an empty repository picker instead of a
   * 500. Same here.
   */
  /**
   * Keeps GitHub's status on failure. Returning [] for every error made a
   * revoked token look exactly like an account with no repositories.
   * status 0 means the request never got an HTTP answer.
   */
  async listUserRepos(
    token: string,
  ): Promise<{ ok: true; repos: unknown[] } | { ok: false; status: number }> {
    const url = `${API_ROOT}/user/repos?per_page=100&sort=updated`;

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'PRism',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        this.logger.warn(`GitHub GET ${url} returned ${response.status}`);

        return { ok: false, status: response.status };
      }

      const body: unknown = await response.json();

      return { ok: true, repos: Array.isArray(body) ? body : [] };
    } catch (error) {
      this.logger.warn(`GitHub GET ${url} failed: ${this.messageOf(error)}`);

      return { ok: false, status: 0 };
    }
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
   * connected. The caller needs to know whether this failed: The original deletes
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
   * step with review_mode. Failures are logged, not thrown: The original saves the
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

  private async postComment(
    url: string,
    token: string,
    body: string,
    signal?: AbortSignal,
  ): Promise<void> {
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
        signal: this.deadline(signal),
      });

      if (!response.ok) {
        this.logger.warn(`GitHub comment post returned ${response.status} for ${url}`);
      }
    } catch (error) {
      // Never fail the review over a comment we could not post — unless the
      // job budget is gone, in which case the retry will post this same
      // comment and swallowing here is how a PR ends up with two of them.
      signal?.throwIfAborted();

      this.logger.warn(
        `GitHub comment post failed for ${url}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async request(
    url: string,
    token: string,
    accept: string,
    signal?: AbortSignal,
    bounded = false,
  ): Promise<{ ok: boolean; status: number; body: string }> {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: accept,
        'User-Agent': 'PRism',
      },
      signal: this.deadline(signal),
    });

    return {
      ok: response.ok,
      status: response.status,
      // Diffs are read with a hard ceiling. Everything else on this path is
      // small and known — comment posts and JSON metadata — and is read whole.
      body: bounded ? await this.readBounded(response.body) : await response.text(),
    };
  }

  /** This request's own ceiling, or the caller's budget — whichever is sooner. */
  private deadline(signal?: AbortSignal): AbortSignal {
    const own = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

    return signal ? AbortSignal.any([signal, own]) : own;
  }
}
