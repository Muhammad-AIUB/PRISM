import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { User } from '../../database/entities';
import { GithubOAuthService } from './github-oauth.service';
import { WebAuthGuard } from './web-auth.guard';
import { WebAuthService, type SessionUserDto } from './web-auth.service';

/**
 * Port of App\Http\Controllers\AuthController.
 *
 * Laravel put these behind `throttle:auth` — 10/min per IP, protecting the
 * OAuth handshake from brute force. Same ceiling here.
 *
 * Socialite carried its CSRF `state` in the Laravel session. With no session
 * table in play, it travels in a short-lived httpOnly cookie instead and is
 * compared in constant time on the way back. Dropping the check entirely would
 * open the callback to login-CSRF.
 */
const STATE_COOKIE = 'prism_oauth_state';
const STATE_TTL_MS = 10 * 60 * 1000;

@Controller('auth')
@Throttle({ api: { limit: 10, ttl: 60_000 } })
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly oauth: GithubOAuthService,
    private readonly webAuth: WebAuthService,
    private readonly configService: ConfigService,
  ) {}

  /** GET /auth/github — Socialite's redirect(). */
  @Get('github')
  redirectToGithub(@Res() response: Response): void {
    const state = randomBytes(32).toString('hex');

    response.cookie(STATE_COOKIE, state, {
      httpOnly: true,
      secure: this.secureCookies(),
      sameSite: 'lax',
      maxAge: STATE_TTL_MS,
      path: '/',
    });

    response.redirect(this.oauth.authorizeUrl(state));
  }

  /**
   * GET /auth/github/callback
   *
   * Laravel redirected to the dashboard on success and back to /login with an
   * error bag on failure. The same redirects are issued here, against the
   * frontend's base URL, so the browser flow is unchanged from the user's side.
   */
  @Get('github/callback')
  async handleGithubCallback(
    @Req() request: Request,
    @Res() response: Response,
    @Query('code') code?: string,
    @Query('state') state?: string,
  ): Promise<void> {
    this.logger.log(
      `[OAuth] Callback hit ${JSON.stringify({ has_code: Boolean(code), has_state: Boolean(state) })}`,
    );

    response.clearCookie(STATE_COOKIE, { path: '/' });

    try {
      const expected = (request.cookies as Record<string, string> | undefined)?.[STATE_COOKIE];

      if (!code || !this.stateMatches(expected, state)) {
        throw new Error('Invalid or expired OAuth state.');
      }

      const githubUser = await this.oauth.userFromCode(code);

      this.logger.log(
        `[OAuth] Got GitHub user ${JSON.stringify({
          id: githubUser.id,
          nickname: githubUser.nickname,
        })}`,
      );

      const { token } = await this.webAuth.loginWithGithub(githubUser);

      response.cookie(this.webAuth.cookieName(), token, {
        httpOnly: true,
        secure: this.secureCookies(),
        sameSite: 'lax',
        maxAge: this.webAuth.cookieMaxAgeMs(),
        path: '/',
      });

      this.logger.log('[OAuth] User logged in, redirecting to dashboard');

      response.redirect(this.frontendUrl('/dashboard'));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.error(`[OAuth] FAILED ${message}`);

      response.redirect(
        `${this.frontendUrl('/login')}?error=${encodeURIComponent(`GitHub sign-in failed: ${message}`)}`,
      );
    }
  }

  /** Replaces Breeze's POST /logout. Clearing the cookie is the whole job. */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Res({ passthrough: true }) response: Response): void {
    response.clearCookie(this.webAuth.cookieName(), { path: '/' });
  }

  /**
   * GET /auth/me — the JSON replacement for Inertia's shared `auth.user` prop,
   * which every page currently reads from HandleInertiaRequests.
   */
  @Get('me')
  @UseGuards(WebAuthGuard)
  me(@CurrentUser() user: User): { user: SessionUserDto } {
    return { user: this.webAuth.toSessionUser(user) };
  }

  private stateMatches(expected: string | undefined, received: string | undefined): boolean {
    if (typeof expected !== 'string' || typeof received !== 'string') {
      return false;
    }

    const a = Buffer.from(expected);
    const b = Buffer.from(received);

    return a.length === b.length && timingSafeEqual(a, b);
  }

  private secureCookies(): boolean {
    return (this.configService.get<string>('app.env') ?? 'development') === 'production';
  }

  private frontendUrl(path: string): string {
    const base =
      this.configService.get<string>('app.frontendUrl') ||
      this.configService.get<string>('app.url') ||
      '';

    return `${base.replace(/\/+$/, '')}${path}`;
  }
}
