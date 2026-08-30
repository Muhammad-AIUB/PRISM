import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository as OrmRepository } from 'typeorm';
import type { AuthenticatedRequest } from '../../auth/current-user.decorator';
import { User } from '../../database/entities';
import type { JwtPayload } from './web-auth.service';

/**
 * Guards the browser-facing routes, the way Laravel's `auth` middleware did.
 *
 * Distinct from SanctumAuthGuard on purpose: that one authenticates the MCP
 * server's long-lived API tokens against `personal_access_tokens`, and it is
 * not going anywhere. This one authenticates a human's browser session.
 *
 * The token is read from an httpOnly cookie first — that is how the Next.js
 * frontend will carry it — with an Authorization header accepted as well so
 * the routes stay testable with curl.
 *
 * The 401 body stays "Unauthenticated." to match Laravel's.
 */
@Injectable()
export class WebAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    @InjectRepository(User)
    private readonly users: OrmRepository<User>,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Unauthenticated.');
    }

    let payload: JwtPayload;

    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Unauthenticated.');
    }

    // Load the row rather than trusting the claims: a deleted account or a
    // revoked GitHub token must stop working immediately, not at token expiry.
    const user = await this.users.findOne({ where: { id: payload.sub } });

    if (!user) {
      throw new UnauthorizedException('Unauthenticated.');
    }

    request.user = user;

    return true;
  }

  private extractToken(request: AuthenticatedRequest): string | null {
    const cookies = (request as unknown as { cookies?: Record<string, string> }).cookies;
    const cookieName = this.configService.get<string>('session.cookieName') ?? 'prism_session';
    const fromCookie = cookies?.[cookieName];

    if (fromCookie) {
      return fromCookie;
    }

    const header = request.header('authorization');
    const match = header ? /^Bearer\s+(.+)$/i.exec(header.trim()) : null;

    return match?.[1] ?? null;
  }
}
