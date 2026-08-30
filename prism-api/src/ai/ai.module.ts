import { Module } from '@nestjs/common';
import { AiClientService } from './ai-client.service';
import { FixesService } from './fixes.service';
import { PromptBuilderService } from './prompt-builder.service';

/**
 * The AI helpers the two Laravel jobs duplicated verbatim. Behaviour is
 * unchanged; only the duplication is gone.
 */
@Module({
  providers: [AiClientService, PromptBuilderService, FixesService],
  exports: [AiClientService, PromptBuilderService, FixesService],
})
export class AiModule {}
