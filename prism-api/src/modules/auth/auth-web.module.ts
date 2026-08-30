import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../../audit/audit.module';
import { User } from '../../database/entities';
import { AuthController } from './auth.controller';
import { GithubOAuthService } from './github-oauth.service';
import { WebAuthGuard } from './web-auth.guard';
import { WebAuthService } from './web-auth.service';

/**
 * Browser-facing auth. Deliberately separate from AuthModule, which owns the
 * Sanctum guard for the MCP server's API tokens — the two authenticate
 * different clients against different stores and must not be merged.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    AuditModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('session.jwtSecret'),
        signOptions: {
          expiresIn: `${configService.get<number>('session.ttlDays') ?? 30}d`,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [GithubOAuthService, WebAuthService, WebAuthGuard],
  exports: [WebAuthGuard, WebAuthService, JwtModule, TypeOrmModule],
})
export class AuthWebModule {}
