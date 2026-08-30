import { Module } from '@nestjs/common';
import { AuthWebModule } from '../auth/auth-web.module';
import { DemoController } from './demo.controller';
import { HelpController } from './help.controller';

/**
 * The two brochure-ish surfaces: the public demo and the help page.
 * AuthWebModule is imported for HelpController's guard; /demo stays public.
 */
@Module({
  imports: [AuthWebModule],
  controllers: [DemoController, HelpController],
})
export class DemoModule {}
