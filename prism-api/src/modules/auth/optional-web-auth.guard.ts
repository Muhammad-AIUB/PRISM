import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository as OrmRepository } from 'typeorm';
import type { AuthenticatedRequest } from '../../auth/current-user.decorator';
import { User } from '../../database/entities';
import type { JwtPayload } from './web-auth.service';

/**
 * Never rejects — it just attaches the user when a valid session is present.
 *
 * /security is public by design: visitors read the trust content BEFORE
 * signing in, which is exactly when they need it. The page still renders
 * differently for a signed-in user, so the handler needs to know which it is.
 */
@Injectable()
export class OptionalWebAuthGuard implements CanActivate {
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
      return true;
    }

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      const user = await this.users.findOne({ where: { id: payload.sub } });

      if (user) {
        request.user = user;
      }
    } catch {
      // An expired or forged cookie simply means "not signed in" here.
    }

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
