import { Module } from '@nestjs/common';
import { AiModule } from '../../ai/ai.module';
import { AuditModule } from '../../audit/audit.module';
import { AuthModule } from '../../auth/auth.module';
import { AuthWebModule } from '../auth/auth-web.module';
import { DesignApiController, DesignController } from './design.controller';
import { DesignService } from './design.service';
import { DesignStore } from './design.store';

@Module({
  imports: [AiModule, AuditModule, AuthModule, AuthWebModule],
  controllers: [DesignController, DesignApiController],
  providers: [DesignService, DesignStore],
  // Exported for account erasure and the data export.
  exports: [DesignStore],
})
export class DesignModule {}
