import { type ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerLimitDetail } from '@nestjs/throttler';
import type { AuthenticatedRequest } from '../../auth/current-user.decorator';

/**
 * Reproduces Laravel's RateLimiter::for('api'):
 *   100 requests / minute, keyed by user id, falling back to IP for guests.
 *
 * The 429 body must stay "Too Many Attempts." - that string is what the MCP
 * server surfaces to the model when a user hits the ceiling.
 */
@Injectable()
export class LaravelThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const request = req as unknown as AuthenticatedRequest;

    return request.user?.id !== undefined
      ? `user:${request.user.id}`
      : `ip:${request.ip ?? 'unknown'}`;
  }

  protected override async throwThrottlingException(
    _context: ExecutionContext,
    _throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    throw new HttpException('Too Many Attempts.', HttpStatus.TOO_MANY_REQUESTS);
  }
}
