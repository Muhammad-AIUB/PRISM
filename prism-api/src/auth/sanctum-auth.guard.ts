import { createHash, timingSafeEqual } from 'node:crypto';
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository as OrmRepository } from 'typeorm';
import { PersonalAccessToken, User } from '../database/entities';
import type { AuthenticatedRequest } from './current-user.decorator';

/**
 * Validates Laravel Sanctum bearer tokens against the SAME
 * `personal_access_tokens` rows the Laravel app writes.
 *
 * This is what makes parallel running possible: a token a user generated in
 * Settings → API Tokens authenticates identically whether the request lands on
 * Laravel or on this service. No re-issuing, no dual token stores.
 *
 * Sanctum's format is "{id}|{plaintext}"; the column stores
 * sha256(plaintext). Legacy tokens with no "|" are matched by hashing the
 * whole string, exactly as Sanctum's findToken() does.
 */
@Injectable()
export class SanctumAuthGuard implements CanActivate {
  constructor(
    @InjectRepository(PersonalAccessToken)
    private readonly tokens: OrmRepository<PersonalAccessToken>,
    @InjectRepository(User)
    private readonly users: OrmRepository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const bearer = this.extractBearer(request.header('authorization'));

    if (!bearer) {
      throw new UnauthorizedException('Unauthenticated.');
    }

    const token = await this.findToken(bearer);

    if (!token || this.isExpired(token)) {
      throw new UnauthorizedException('Unauthenticated.');
    }

    const user = await this.users.findOne({ where: { id: token.tokenableId } });

    if (!user) {
      throw new UnauthorizedException('Unauthenticated.');
    }

    // Sanctum touches last_used_at on every authenticated request. Fire and
    // forget — a write failure here must not fail the request.
    void this.tokens.update(token.id, { lastUsedAt: new Date() }).catch(() => undefined);

    request.user = user;
    request.tokenAbilities = this.parseAbilities(token.abilities);

    return true;
  }

  private extractBearer(header: string | undefined): string | null {
    if (!header) {
      return null;
    }

    const match = /^Bearer\s+(.+)$/i.exec(header.trim());

    return match?.[1] ?? null;
  }

  private async findToken(bearer: string): Promise<PersonalAccessToken | null> {
    const separator = bearer.indexOf('|');

    if (separator === -1) {
      return this.tokens.findOne({ where: { token: this.sha256(bearer) } });
    }

    const id = Number(bearer.slice(0, separator));
    const plaintext = bearer.slice(separator + 1);

    if (!Number.isInteger(id) || id <= 0) {
      return null;
    }

    const token = await this.tokens.findOne({ where: { id } });

    if (!token) {
      return null;
    }

    return this.hashesMatch(token.token, this.sha256(plaintext)) ? token : null;
  }

  private isExpired(token: PersonalAccessToken): boolean {
    return token.expiresAt !== null && token.expiresAt.getTime() <= Date.now();
  }

  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private hashesMatch(stored: string, computed: string): boolean {
    const a = Buffer.from(stored);
    const b = Buffer.from(computed);

    return a.length === b.length && timingSafeEqual(a, b);
  }

  private parseAbilities(abilities: string | null): string[] {
    if (!abilities) {
      return [];
    }

    try {
      const parsed: unknown = JSON.parse(abilities);

      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
}
