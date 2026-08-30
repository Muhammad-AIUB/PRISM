import { Controller, Get, NotFoundException, Param, ParseIntPipe } from '@nestjs/common';
import {
  DEMO_REPOSITORIES,
  DEMO_REVIEWS,
  DEMO_STATS,
  type DemoReview,
} from './demo.data';

/**
 * Port of DemoController. Public and stateless: no auth, no database, no AI,
 * no GitHub. `isDemo` is what the shared page components branch on to hide
 * the actions that would need a real account.
 */
@Controller('demo')
export class DemoController {
  @Get()
  index(): Record<string, unknown> {
    return {
      isDemo: true,
      stats: DEMO_STATS,
      repositories: DEMO_REPOSITORIES,
      recent_reviews: DEMO_REVIEWS,
    };
  }

  /** Laravel constrained this to ->whereNumber('id'); ParseIntPipe does the same. */
  @Get('review/:id')
  review(@Param('id', ParseIntPipe) id: number): { isDemo: true; review: DemoReview } {
    const review = DEMO_REVIEWS.find((entry) => entry.id === id);

    if (!review) {
      throw new NotFoundException();
    }

    return { isDemo: true, review };
  }
}
