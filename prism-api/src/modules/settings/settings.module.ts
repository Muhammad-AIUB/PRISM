import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from '../../ai/ai.module';
import { AuditModule } from '../../audit/audit.module';
import { PersonalAccessTokenService } from '../../auth/personal-access-token.service';
import { PersonalAccessToken, User } from '../../database/entities';
import { AuthWebModule } from '../auth/auth-web.module';
import { AiSettingsController } from './ai-settings.controller';
import { AiSettingsService } from './ai-settings.service';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, PersonalAccessToken]),
    AuthWebModule,
    AuditModule,
    AiModule,
  ],
  controllers: [SettingsController, AiSettingsController],
  providers: [SettingsService, PersonalAccessTokenService, AiSettingsService],
  exports: [PersonalAccessTokenService],
})
export class SettingsModule {}
