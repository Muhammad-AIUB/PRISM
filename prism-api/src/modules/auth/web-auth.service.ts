import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository as OrmRepository } from 'typeorm';
import { AuditLogService } from '../../audit/audit-log.service';
import { CryptService } from '../../common/utils/crypt.service';
import { User } from '../../database/entities';
import type { GithubOAuthUser } from './github-oauth.service';

/**
 * Port of AuthController::handleGithubCallback's persistence and login.
 *
 * Two things carried over exactly:
 *   - the row is upserted on github_id, not email, so a user who changes their
 *     GitHub email keeps their repositories
 *   - name falls back to the nickname when GitHub's `name` is null
 *
 * One thing deliberately different: The original called Auth::login() and wrote a
 * PHP-serialised session row. This issues a JWT instead. The original sessions
 * cannot be read from Node without coupling to PHP serialisation, and the
 * Next.js frontend needs something it can carry itself. The `sessions` table
 * stays untouched and the original's own login keeps working during the migration.
 */
export interface SessionUserDto {
  id: number;
  name: string;
  email: string;
  github_username: string | null;
  github_avatar: string | null;
}

export interface JwtPayload {
  sub: number;
  username: string | null;
}

@Injectable()
export class WebAuthService {
  private readonly logger = new Logger(WebAuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly users: OrmRepository<User>,
    private readonly jwt: JwtService,
    private readonly crypt: CryptService,
    private readonly auditLog: AuditLogService,
    private readonly configService: ConfigService,
  ) {}

  async loginWithGithub(githubUser: GithubOAuthUser): Promise<{ user: User; token: string }> {
    const existing = await this.users.findOne({ where: { githubId: githubUser.id } });

    const values = {
      name: githubUser.name ?? githubUser.nickname ?? '',
      email: githubUser.email ?? '',
      // Encrypted at rest, in the format the existing rows use. See CryptService.
      githubToken: this.crypt.encrypt(githubUser.token),
      githubAvatar: githubUser.avatar,
      githubUsername: githubUser.nickname,
    };

    let user: User;

    if (existing) {
      await this.users.update(existing.id, { ...values, updatedAt: new Date() });
      user = { ...existing, ...values };
    } else {
      const now = new Date();

      user = await this.users.save(
        this.users.create({
          ...values,
          githubId: githubUser.id,
          createdAt: now,
          updatedAt: now,
        }),
      );
    }

    this.logger.log(`[OAuth] User upserted (user_id=${user.id})`);

    await this.auditLog.record(user.id, 'login', 'Signed in via GitHub OAuth');

    return { user, token: await this.issueToken(user) };
  }

  async issueToken(user: User): Promise<string> {
    const payload: JwtPayload = { sub: user.id, username: user.githubUsername };

    return this.jwt.signAsync(payload);
  }

  /** Shape shared with the frontend; mirrors the previous frontend's `auth.user` prop. */
  toSessionUser(user: User): SessionUserDto {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      github_username: user.githubUsername,
      github_avatar: user.githubAvatar,
    };
  }

  cookieName(): string {
    return this.configService.get<string>('session.cookieName') ?? 'prism_session';
  }

  /**
   * The original's Auth::login($user, true) set a two-year remember cookie; the JWT
   * TTL is the equivalent knob here.
   */
  cookieMaxAgeMs(): number {
    return (this.configService.get<number>('session.ttlDays') ?? 30) * 24 * 60 * 60 * 1000;
  }
}
