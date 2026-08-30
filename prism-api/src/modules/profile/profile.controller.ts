import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { User } from '../../database/entities';
import { WebAuthGuard } from '../auth/web-auth.guard';
import { WebAuthService } from '../auth/web-auth.service';
import { DeleteAccountDto, UpdateProfileDto } from './dto/profile.dto';
import { ProfileService } from './profile.service';

/** Port of the /profile routes. */
@Controller('profile')
@UseGuards(WebAuthGuard)
export class ProfileController {
  constructor(
    private readonly profile: ProfileService,
    private readonly webAuth: WebAuthService,
  ) {}

  @Get()
  edit() {
    return this.profile.edit();
  }

  @Patch()
  update(@CurrentUser() user: User, @Body() dto: UpdateProfileDto) {
    return this.profile.update(user, dto);
  }

  /**
   * Laravel logged the user out and invalidated the session before deleting.
   * The equivalent is clearing the session cookie — and it has to happen after
   * the delete succeeds, or a wrong password would still sign the user out.
   */
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async destroy(
    @CurrentUser() user: User,
    @Body() dto: DeleteAccountDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.profile.destroy(user, dto.password);

    response.clearCookie(this.webAuth.cookieName(), { path: '/' });
  }
}
