import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { User } from '../../database/entities';
import { WebAuthGuard } from '../auth/web-auth.guard';
import {
  BranchesQueryDto,
  ConnectRepositoryDto,
  UpdateRepositorySettingsDto,
} from './dto/repository.dto';
import { RepositoriesService } from './repositories.service';

/**
 * Port of the /repositories routes.
 *
 * Laravel had these behind `auth` + `throttle:api`; WebAuthGuard is the
 * session equivalent and the global throttler supplies the 100/min.
 *
 * Route order matters: /repositories/branches is declared before
 * /repositories/:id/settings so the literal path is not swallowed by the
 * parameterised one.
 */
@Controller('repositories')
@UseGuards(WebAuthGuard)
export class RepositoriesController {
  constructor(private readonly repositories: RepositoriesService) {}

  @Get()
  index(@CurrentUser() user: User) {
    return this.repositories.index(user);
  }

  @Get('branches')
  branches(@CurrentUser() user: User, @Query() query: BranchesQueryDto) {
    return this.repositories.branches(user, query.full_name);
  }

  /**
   * Laravel redirected with a flash message on both paths. As JSON, a failed
   * webhook install has to be a real error status — the row was rolled back,
   * so reporting 200 would leave the UI showing a repository that no longer
   * exists.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async connect(@CurrentUser() user: User, @Body() dto: ConnectRepositoryDto) {
    const result = await this.repositories.connect(user, dto);

    if (!result.ok) {
      throw new BadRequestException(result.message);
    }

    return { message: result.message, repository: result.repository };
  }

  @Get(':repository/settings')
  settings(@CurrentUser() user: User, @Param('repository', ParseIntPipe) id: number) {
    return this.repositories.settings(user, id);
  }

  @Post(':repository/settings')
  @HttpCode(HttpStatus.OK)
  updateSettings(
    @CurrentUser() user: User,
    @Param('repository', ParseIntPipe) id: number,
    @Body() dto: UpdateRepositorySettingsDto,
  ) {
    return this.repositories.updateSettings(user, id, dto);
  }
}
