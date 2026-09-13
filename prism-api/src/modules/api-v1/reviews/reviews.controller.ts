import {
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
import { CurrentUser } from '../../../auth/current-user.decorator';
import { ApiTokenAuthGuard } from '../../../auth/api-token-auth.guard';
import type { User } from '../../../database/entities';
import { ListReviewsQuery } from './dto/list-reviews.query';
import type {
  LatestReviewResponseDto,
  ListReviewsResponseDto,
  MeResponseDto,
  ShowReviewResponseDto,
} from './dto/review-response.dto';
import { ReviewsService } from './reviews.service';

/**
 * Token-authenticated REST API (v1) consumed by the PRism MCP server.
 *
 * Paths, verbs and payloads are frozen: mcp-server/index.js is already
 * deployed on users' machines and calls these exact URLs.
 *
 * The two POST /re-analyze endpoints enqueue the same jobs the webhook does.
 * Their session-authenticated twins live in modules/reviews-web and behave
 * differently on purpose — see the note on ReviewsService.reAnalyzeCommit
 * before assuming either pair should be collapsed into the other.
 */
@Controller('api/v1')
@UseGuards(ApiTokenAuthGuard)
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get('me')
  me(@CurrentUser() user: User): Promise<MeResponseDto> {
    return this.reviewsService.me(user);
  }

  @Get('reviews')
  list(
    @CurrentUser() user: User,
    @Query() query: ListReviewsQuery,
  ): Promise<ListReviewsResponseDto> {
    return this.reviewsService.list(user, query);
  }

  @Get('reviews/latest')
  latest(@CurrentUser() user: User): Promise<LatestReviewResponseDto> {
    return this.reviewsService.latest(user);
  }

  @Get('commits/:id')
  showCommit(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ShowReviewResponseDto> {
    return this.reviewsService.showCommit(user, id);
  }

  @Get('pull-requests/:id')
  showPullRequest(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ShowReviewResponseDto> {
    return this.reviewsService.showPullRequest(user, id);
  }

  /**
   * The previous handler defaulted to 200; Nest defaults POST to 201.
   * The MCP server does not check the code, but the contract is 200 — pin it.
   */
  @Post('commits/:id/re-analyze')
  @HttpCode(HttpStatus.OK)
  reAnalyzeCommit(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ message: string; id: number }> {
    return this.reviewsService.reAnalyzeCommit(user, id);
  }

  @Post('pull-requests/:id/re-analyze')
  @HttpCode(HttpStatus.OK)
  reAnalyzePullRequest(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ message: string; id: number }> {
    return this.reviewsService.reAnalyzePullRequest(user, id);
  }
}
