import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserAiSettings } from '../database/entities';
import { UserAiSettingsService } from './user-ai-settings.service';
import { AiClientService } from './ai-client.service';
import { FixesService } from './fixes.service';
import { PromptBuilderService } from './prompt-builder.service';

/**
 * The AI helpers the two the original jobs duplicated verbatim. Behaviour is
 * unchanged; only the duplication is gone.
 */
@Module({
  imports: [TypeOrmModule.forFeature([UserAiSettings])],
  providers: [AiClientService, PromptBuilderService, FixesService, UserAiSettingsService],
  exports: [AiClientService, PromptBuilderService, FixesService, UserAiSettingsService],
})
export class AiModule {}
