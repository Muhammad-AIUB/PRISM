import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { User } from '../../database/entities';
import { WebAuthGuard } from '../auth/web-auth.guard';
import { CreateApiTokenDto, TestSlackDto, UpdateSettingsDto } from './dto/settings.dto';
import { SettingsService } from './settings.service';

/**
 * Port of the /settings routes.
 *
 * Laravel redirected back with flash messages; these return the same message
 * strings as JSON so the Next.js pages can show them unchanged.
 */
@Controller('settings')
@UseGuards(WebAuthGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  index(@CurrentUser() user: User) {
    return this.settings.index(user);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  update(@CurrentUser() user: User, @Body() dto: UpdateSettingsDto) {
    return this.settings.update(user, dto);
  }

  /**
   * The response carries the plaintext token. It is the only time it exists in
   * readable form — only its sha256 is stored — so a client that drops this
   * response cannot recover it.
   */
  @Post('api-tokens')
  @HttpCode(HttpStatus.OK)
  createApiToken(@CurrentUser() user: User, @Body() dto: CreateApiTokenDto) {
    return this.settings.createApiToken(user, dto.name);
  }

  @Delete('api-tokens/:tokenId')
  @HttpCode(HttpStatus.OK)
  revokeApiToken(
    @CurrentUser() user: User,
    @Param('tokenId', ParseIntPipe) tokenId: number,
  ) {
    return this.settings.revokeApiToken(user, tokenId);
  }

  /**
   * Laravel reported a Slack rejection as a flash 'error' on a 302, not as an
   * HTTP error, so this stays 200 with an `ok` flag rather than throwing — the
   * request itself succeeded, Slack just did not like the URL.
   */
  @Post('test-slack')
  @HttpCode(HttpStatus.OK)
  testSlack(@Body() dto: TestSlackDto) {
    return this.settings.testSlack(dto.slack_webhook_url);
  }
}
