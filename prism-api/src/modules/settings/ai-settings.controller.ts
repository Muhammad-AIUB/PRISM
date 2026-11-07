import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { User } from '../../database/entities';
import { WebAuthGuard } from '../auth/web-auth.guard';
import { AiSettingsService } from './ai-settings.service';
import { ListAiModelsDto, SaveAiSettingsDto } from './dto/ai-settings.dto';

/** A user's own AI provider key and model (ADR 0012). Never returns the key. */
@Controller('settings/ai')
@UseGuards(WebAuthGuard)
export class AiSettingsController {
  constructor(private readonly aiSettings: AiSettingsService) {}

  @Get()
  index(@CurrentUser() user: User) {
    return this.aiSettings.index(user);
  }

  @Post('models')
  @HttpCode(HttpStatus.OK)
  models(@CurrentUser() user: User, @Body() dto: ListAiModelsDto) {
    return this.aiSettings.models(user, dto);
  }

  @Put()
  save(@CurrentUser() user: User, @Body() dto: SaveAiSettingsDto) {
    return this.aiSettings.save(user, dto);
  }

  @Delete()
  clear(@CurrentUser() user: User) {
    return this.aiSettings.clear(user);
  }
}
