import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Replaces Socialite's GitHub driver.
 *
 * Scopes stay ['repo', 'read:user'] — 'repo' is what lets the app install
 * webhooks and read private diffs, so narrowing it would break repository
 * connection for private repos.
 *
 * Socialite gets the display name from GitHub's `name` and the nickname from
 * `login`, and falls back to the nickname when `name` is null. It also fetches
 * the primary verified email from /user/emails when the profile hides it —
 * reproduced here, because users.email is NOT NULL and unique.
 */
export interface GithubOAuthUser {
  id: string;
  nickname: string | null;
  name: string | null;
  email: string | null;
  avatar: string | null;
  token: string;
}

interface GithubUserResponse {
  id?: number | string;
  login?: string;
  name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
}

interface GithubEmailResponse {
  email?: string;
  primary?: boolean;
  verified?: boolean;
}

const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const USER_URL = 'https://api.github.com/user';
const EMAILS_URL = 'https://api.github.com/user/emails';
const SCOPES = ['repo', 'read:user'];
const TIMEOUT_MS = 15_000;

@Injectable()
export class GithubOAuthService {
  private readonly logger = new Logger(GithubOAuthService.name);

  constructor(private readonly configService: ConfigService) {}

  /** The URL Socialite's redirect() would have sent the browser to. */
  authorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.configService.get<string>('github.clientId') ?? '',
      redirect_uri: this.configService.get<string>('github.redirect') ?? '',
      scope: SCOPES.join(' '),
      state,
      response_type: 'code',
    });

    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  /** Socialite's user(): exchange the code, then load the profile. */
  async userFromCode(code: string): Promise<GithubOAuthUser> {
    const token = await this.exchangeCode(code);
    const profile = await this.fetchJson<GithubUserResponse>(USER_URL, token);

    if (profile.id === undefined || profile.id === null) {
      throw new Error('GitHub returned a profile with no id.');
    }

    const nickname = profile.login ?? null;

    return {
      id: String(profile.id),
      nickname,
      // Socialite's getName() is the raw `name`; the caller applies the
      // `?? nickname` fallback, matching AuthController.
      name: profile.name ?? null,
      email: profile.email ?? (await this.primaryEmail(token)),
      avatar: profile.avatar_url ?? null,
      token,
    };
  }

  private async exchangeCode(code: string): Promise<string> {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.configService.get<string>('github.clientId') ?? '',
        client_secret: this.configService.get<string>('github.clientSecret') ?? '',
        redirect_uri: this.configService.get<string>('github.redirect') ?? '',
        code,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`GitHub token exchange failed: ${response.status}`);
    }

    const body = (await response.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };

    if (!body.access_token) {
      // GitHub answers 200 with an error body for a reused or expired code.
      throw new Error(
        `GitHub token exchange returned no access_token: ${body.error_description ?? body.error ?? 'unknown error'}`,
      );
    }

    return body.access_token;
  }

  /**
   * Users with a private email have `email: null` on the profile. Socialite
   * falls back to the primary verified address; without this they cannot sign
   * in at all, because users.email is NOT NULL.
   */
  private async primaryEmail(token: string): Promise<string | null> {
    try {
      const emails = await this.fetchJson<GithubEmailResponse[]>(EMAILS_URL, token);

      if (!Array.isArray(emails)) {
        return null;
      }

      const primary = emails.find((entry) => entry.primary && entry.verified);

      return primary?.email ?? emails.find((entry) => entry.verified)?.email ?? null;
    } catch (error) {
      this.logger.warn(
        `Could not read GitHub emails: ${error instanceof Error ? error.message : String(error)}`,
      );

      return null;
    }
  }

  private async fetchJson<T>(url: string, token: string): Promise<T> {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'PRism',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`GitHub ${url} returned ${response.status}`);
    }

    return (await response.json()) as T;
  }
}
