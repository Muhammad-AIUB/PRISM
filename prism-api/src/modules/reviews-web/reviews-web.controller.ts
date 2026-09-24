import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe';
import type { Response } from 'express';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { User } from '../../database/entities';
import { WebAuthGuard } from '../auth/web-auth.guard';
import { PdfReportService } from './pdf-report.service';
import { ReviewsWebService } from './reviews-web.service';

/** Port of the /reviews routes. */
@Controller('reviews')
@UseGuards(WebAuthGuard)
export class ReviewsWebController {
  constructor(
    private readonly reviews: ReviewsWebService,
    private readonly pdf: PdfReportService,
  ) {}

  @Get(':pullRequest')
  show(@CurrentUser() user: User, @Param('pullRequest', ParseIdPipe) id: number) {
    return this.reviews.showPullRequest(user, id);
  }

  @Post(':pullRequest/re-analyze')
  @HttpCode(HttpStatus.OK)
  reAnalyze(@CurrentUser() user: User, @Param('pullRequest', ParseIdPipe) id: number) {
    return this.reviews.reAnalyzePullRequest(user, id);
  }

  @Get(':pullRequest/risk')
  risk(@CurrentUser() user: User, @Param('pullRequest', ParseIdPipe) id: number) {
    return this.reviews.pullRequestRisk(user, id);
  }

  /**
   * Returns GitHub's raw diff as text/plain, passing its status through. The
   * point of proxying is that the browser never handles the GitHub token.
   */
  @Get(':pullRequest/diff')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  async diff(
    @CurrentUser() user: User,
    @Param('pullRequest', ParseIdPipe) id: number,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const result = await this.reviews.pullRequestDiff(user, id);

    response.status(result.status);

    return result.body;
  }

  /**
   * Written straight to the response rather than returned: a Buffer returned
   * from a handler goes through Nest's serialiser and arrives as
   * {"type":"Buffer","data":[...]} JSON, which is a corrupt download that
   * still reports 200 and application/pdf.
   */
  @Get(':pullRequest/export')
  async exportPdf(
    @CurrentUser() user: User,
    @Param('pullRequest', ParseIdPipe) id: number,
    @Res() response: Response,
  ): Promise<void> {
    const { pr, review } = await this.reviews.exportData(user, id);
    const buffer = await this.pdf.render(pr, review);

    response
      .status(HttpStatus.OK)
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${this.pdf.filenameFor(pr)}"`,
        'Content-Length': String(buffer.length),
      })
      .end(buffer);
  }
}
