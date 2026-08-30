import { Body, Controller, Delete, Get, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { IsIn, IsString } from 'class-validator';
import { CurrentUser, OptionalCurrentUser } from '../../auth/current-user.decorator';
import type { User } from '../../database/entities';
import { OptionalWebAuthGuard } from '../auth/optional-web-auth.guard';
import { WebAuthGuard } from '../auth/web-auth.guard';
import { SecurityService } from './security.service';

/** Laravel: 'confirm' => 'required|in:DELETE' — typed by hand, deliberately. */
export class DeleteMyDataDto {
  @IsString()
  @IsIn(['DELETE'])
  confirm!: string;
}

/**
 * Port of SecurityController, AuditController and DataController.
 *
 * GET /security is intentionally outside the auth requirement: visitors read
 * the trust content before signing in, which is exactly when they need it.
 * Everything under it is authenticated.
 */
@Controller('security')
export class SecurityController {
  constructor(private readonly security: SecurityService) {}

  @Get()
  @UseGuards(OptionalWebAuthGuard)
  index(@OptionalCurrentUser() user: User | undefined) {
    return this.security.index(user);
  }

  @Get('audit-log')
  @UseGuards(WebAuthGuard)
  auditLog(@CurrentUser() user: User) {
    return this.security.auditLogIndex(user);
  }

  @Get('my-data')
  @UseGuards(WebAuthGuard)
  myData(@CurrentUser() user: User) {
    return this.security.myData(user);
  }

  /**
   * Irreversible, and gated on the user typing DELETE. The session cookie is
   * not cleared here because there is no longer an account to be signed in to
   * — the next request fails the guard on its own.
   */
  @Delete('my-data')
  @UseGuards(WebAuthGuard)
  @HttpCode(HttpStatus.OK)
  deleteMyData(@CurrentUser() user: User, @Body() _dto: DeleteMyDataDto) {
    return this.security.deleteEverything(user);
  }
}
