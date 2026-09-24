import { type CanActivate, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { AuthController } from './auth.controller';
import { GithubOAuthService } from './github-oauth.service';
import { WebAuthGuard } from './web-auth.guard';
import { WebAuthService } from './web-auth.service';

// @nestjs/jwt ships ESM that jest cannot load; WebAuthGuard is overridden below
// so the real JwtService is never constructed.
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }));

/**
 * prism-web calls GET /auth/me server-side on every authenticated page, and
 * again on every router.refresh() the dashboard and review pages poll with.
 * Those calls all arrive from prism-web's own address. Signed-in requests now
 * get a per-user bucket (RateLimitGuard verifies the session cookie itself),
 * but a visitor whose cookie is missing or expired still lands in the shared
 * per-IP bucket, which is why this endpoint keeps its own generous ceiling.
 *
 * When /auth/me sat under the OAuth handshake's 10/min ceiling, the 11th call
 * in a minute returned 429, getSessionUser() threw, and the dashboard rendered
 * the error boundary. The handshake keeps its ceiling; the session read does not.
 */
describe('AuthController throttling', () => {
  let app: INestApplication;
  let base: string;

  const allow: CanActivate = {
    canActivate: (context) => {
      context.switchToHttp().getRequest().user = { id: 1 };
      return true;
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({ throttlers: [{ name: 'api', ttl: 60_000, limit: 100 }] }),
      ],
      controllers: [AuthController],
      providers: [
        { provide: APP_GUARD, useClass: RateLimitGuard },
        { provide: GithubOAuthService, useValue: { authorizeUrl: () => 'https://github.com/login' } },
        { provide: WebAuthService, useValue: { toSessionUser: () => ({ id: 1 }), cookieName: () => 'prism_session' } },
        { provide: ConfigService, useValue: { get: () => undefined } },
      ],
    })
      .overrideGuard(WebAuthGuard)
      .useValue(allow)
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  const hit = async (path: string, times: number): Promise<number[]> => {
    const statuses: number[] = [];
    for (let i = 0; i < times; i += 1) {
      const response = await fetch(`${base}${path}`, { redirect: 'manual' });
      statuses.push(response.status);
    }
    return statuses;
  };

  it('does not put the session read under the OAuth ceiling', async () => {
    const statuses = await hit('/auth/me', 30);

    expect(statuses).not.toContain(429);
  });

  it('still caps the OAuth redirect at 10 a minute', async () => {
    const statuses = await hit('/auth/github', 11);

    expect(statuses.slice(0, 10)).not.toContain(429);
    expect(statuses[10]).toBe(429);
  });
});
