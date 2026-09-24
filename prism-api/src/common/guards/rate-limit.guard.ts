import {
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerGuard, type ThrottlerLimitDetail } from '@nestjs/throttler';
import type { AuthenticatedRequest } from '../../auth/current-user.decorator';

/**
 * Reproduces the previous API rate limit:
 *   100 requests / minute, keyed by user id, falling back to IP for guests.
 *
 * The 429 body must stay "Too Many Attempts." - that string is what the MCP
 * server surfaces to the model when a user hits the ceiling.
 *
 * Why it reads the session cookie itself: this runs as a global guard, before
 * WebAuthGuard has set request.user, so `request.user` is never there. That
 * used to mean every browser request fell back to the IP bucket - and every
 * browser request arrives from prism-web's server, one address. The whole
 * site shared a single 100/minute allowance, and one busy user could lock out
 * everyone else.
 *
 * The cookie's signature is verified before its subject is trusted. Keying on
 * an unverified claim would let anyone drain a chosen victim's bucket by
 * sending their id, and a forged or expired cookie falls back to the IP
 * bucket, so rotating junk cookies cannot escape the limit either.
 *
 * Bearer tokens are left on the IP bucket on purpose: MCP clients call from
 * each user's own machine, so their address already is per-user, and keying
 * on an unverified token would let a caller mint a fresh bucket per request.
 */
@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  // Property injection keeps ThrottlerGuard's own constructor untouched.
  // Optional so a module without JwtModule still gets working IP limiting.
  @Optional()
  @Inject(JwtService)
  private readonly jwt?: JwtService;

  @Optional()
  @Inject(ConfigService)
  private readonly config?: ConfigService;

  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const request = req as unknown as AuthenticatedRequest;

    if (request.user?.id !== undefined) {
      return `user:${request.user.id}`;
    }

    const sessionUserId = await this.sessionUserId(req);

    if (sessionUserId !== null) {
      return `user:${sessionUserId}`;
    }

    return `ip:${request.ip ?? 'unknown'}`;
  }

  protected override async throwThrottlingException(
    _context: ExecutionContext,
    _throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    throw new HttpException('Too Many Attempts.', HttpStatus.TOO_MANY_REQUESTS);
  }

  /** The verified subject of the session cookie, or null for anything less. */
  private async sessionUserId(req: Record<string, unknown>): Promise<number | null> {
    const cookies = req['cookies'] as Record<string, string> | undefined;
    const name = this.config?.get<string>('session.cookieName') ?? 'prism_session';
    const token = cookies?.[name];

    if (!token || !this.jwt) {
      return null;
    }

    try {
      const payload = await this.jwt.verifyAsync<{ sub?: unknown }>(token);

      return typeof payload.sub === 'number' ? payload.sub : null;
    } catch {
      return null;
    }
  }
}
