import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { User } from '../../database/entities';
import { WebAuthGuard } from '../auth/web-auth.guard';
import { DashboardService } from './dashboard.service';

/** Port of GET /dashboard. */
@Controller('dashboard')
@UseGuards(WebAuthGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  index(@CurrentUser() user: User) {
    return this.dashboard.index(user);
  }
}
