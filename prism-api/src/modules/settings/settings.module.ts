import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../../audit/audit.module';
import { PersonalAccessTokenService } from '../../auth/personal-access-token.service';
import { PersonalAccessToken, User } from '../../database/entities';
import { AuthWebModule } from '../auth/auth-web.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, PersonalAccessToken]),
    AuthWebModule,
    AuditModule,
  ],
  controllers: [SettingsController],
  providers: [SettingsService, PersonalAccessTokenService],
  exports: [PersonalAccessTokenService],
})
export class SettingsModule {}
