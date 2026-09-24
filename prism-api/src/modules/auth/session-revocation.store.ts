import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.constants';

/**
 * Server-side logout for stateless session tokens.
 *
 * A session is a signed JWT valid for SESSION_TTL_DAYS. Logout used to clear
 * the cookie and nothing else, so a token copied before logout (a shared
 * machine, a leaked log, malware) kept working for up to 30 days and there was
 * no way to end it. Logout now records the token here until it would have
 * expired anyway, and WebAuthGuard refuses anything on the list.
 *
 * Only a hash of the token is stored, never the token. Entries expire with the
 * token, so the list cannot grow without bound.
 *
 * Reads fail open, deliberately. Failing closed would sign every user out
 * whenever Redis blips; failing open narrows exposure to one case - a token
 * that was both logged out and stolen, used during a Redis outage - and is
 * logged when it happens.
 */
@Injectable()
export class SessionRevocationStore {
  private readonly logger = new Logger(SessionRevocationStore.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly jwt: JwtService,
  ) {}

  /** Revokes a token until its own expiry. A token that does not verify is ignored. */
  async revoke(token: string): Promise<void> {
    let exp: number | undefined;

    try {
      ({ exp } = await this.jwt.verifyAsync<{ exp?: number }>(token));
    } catch {
      return; // Forged or already expired: there is nothing to revoke.
    }

    const remaining = exp === undefined ? 0 : Math.ceil(exp - Date.now() / 1000);

    if (remaining > 0) {
      await this.redis.set(this.key(token), '1', 'EX', remaining);
    }
  }

  async isRevoked(token: string): Promise<boolean> {
    try {
      return (await this.redis.exists(this.key(token))) === 1;
    } catch (error) {
      this.logger.warn(
        `Session revocation check unavailable, allowing: ${error instanceof Error ? error.message : String(error)}`,
      );

      return false;
    }
  }

  private key(token: string): string {
    return `session:revoked:${createHash('sha256').update(token).digest('hex')}`;
  }
}
