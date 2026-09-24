import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { User } from '../../database/entities';
import { WebAuthGuard } from '../auth/web-auth.guard';
import { ReviewsWebService } from './reviews-web.service';

/** Port of the /commits routes. */
@Controller('commits')
@UseGuards(WebAuthGuard)
export class CommitReviewsController {
  constructor(private readonly reviews: ReviewsWebService) {}

  @Get(':commitReview')
  show(@CurrentUser() user: User, @Param('commitReview', ParseIdPipe) id: number) {
    return this.reviews.showCommit(user, id);
  }

  @Get(':commitReview/risk')
  risk(@CurrentUser() user: User, @Param('commitReview', ParseIdPipe) id: number) {
    return this.reviews.commitRisk(user, id);
  }

  @Post(':commitReview/re-analyze')
  @HttpCode(HttpStatus.OK)
  reAnalyze(@CurrentUser() user: User, @Param('commitReview', ParseIdPipe) id: number) {
    return this.reviews.reAnalyzeCommit(user, id);
  }
}
