import { Controller, Get, UseGuards } from '@nestjs/common';
import { WebAuthGuard } from '../auth/web-auth.guard';

/**
 * Port of HelpController. The Laravel page took no props at all — its content
 * is entirely in the component — but the route sat inside the auth group, so
 * the guard stays.
 */
@Controller('help')
@UseGuards(WebAuthGuard)
export class HelpController {
  @Get('how-to-use')
  howToUse(): Record<string, never> {
    return {};
  }
}
