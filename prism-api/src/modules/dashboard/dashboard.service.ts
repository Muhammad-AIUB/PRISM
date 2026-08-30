import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository as OrmRepository } from 'typeorm';
import { toIso8601String } from '../../common/utils/iso8601';
import { CommitReview, PullRequest, Repository, Review } from '../../database/entities';
import type { User } from '../../database/entities';

/**
 * Port of App\Http\Controllers\DashboardController.
 *
 * Every figure is scoped to repositories the signed-in user owns. The prop
 * names and the two feed shapes are kept so the Dashboard page can be a direct
 * translation — including `kind`, which is how the page tells a PR row from a
 * commit row in the merged table.
 */
@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Repository)
    private readonly repositories: OrmRepository<Repository>,
    @InjectRepository(PullRequest)
    private readonly pullRequests: OrmRepository<PullRequest>,
    @InjectRepository(CommitReview)
    private readonly commitReviews: OrmRepository<CommitReview>,
    @InjectRepository(Review)
    private readonly reviews: OrmRepository<Review>,
  ) {}

  async index(user: User): Promise<Record<string, unknown>> {
    const repos = await this.repositories.find({
      where: { userId: user.id },
      select: { id: true },
    });
    const repoIds = repos.map((repo) => repo.id);

    // An empty IN () is invalid SQL, and TypeORM's In([]) builds one. A user
    // with no repositories has to short-circuit to zeroes.
    if (repoIds.length === 0) {
      return {
        total_repos: 0,
        total_prs: 0,
        total_commits: 0,
        avg_score: null,
        recent_prs: [],
        recent_commits: [],
        timeline: [],
      };
    }

    const [totalPrs, totalCommits, avgScore, recentPrs, recentCommits, timeline] =
      await Promise.all([
        this.pullRequests.count({ where: { repositoryId: In(repoIds) } }),
        this.commitReviews.count({ where: { repositoryId: In(repoIds) } }),
        this.averageScore(repoIds),
        this.recentPullRequests(repoIds),
        this.recentCommitReviews(repoIds),
        this.timeline(repoIds),
      ]);

    return {
      total_repos: repoIds.length,
      total_prs: totalPrs,
      total_commits: totalCommits,
      avg_score: avgScore,
      recent_prs: recentPrs,
      recent_commits: recentCommits,
      timeline,
    };
  }

  /** Laravel: round((float) $avg, 1), and null when there is nothing scored. */
  private async averageScore(repoIds: number[]): Promise<number | null> {
    const row = await this.reviews
      .createQueryBuilder('review')
      .innerJoin('review.pullRequest', 'pr')
      .where('pr.repository_id IN (:...repoIds)', { repoIds })
      .select('AVG(review.overall_score)', 'avg')
      .getRawOne<{ avg: string | null }>();

    if (!row?.avg) {
      return null;
    }

    return Math.round(Number(row.avg) * 10) / 10;
  }

  private async recentPullRequests(repoIds: number[]): Promise<Record<string, unknown>[]> {
    const rows = await this.pullRequests.find({
      where: { repositoryId: In(repoIds) },
      relations: { repository: true, review: true },
      // Laravel's latest() orders by created_at; id breaks ties so rows created
      // in the same second do not shuffle between requests.
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 10,
    });

    return rows.map((pr) => ({
      kind: 'pr',
      id: pr.id,
      title: pr.title,
      author: pr.author,
      status: pr.status,
      pr_number: pr.prNumber,
      created_at: toIso8601String(pr.createdAt),
      repository: {
        name: pr.repository?.name ?? null,
        full_name: pr.repository?.fullName ?? null,
      },
      score: pr.review?.overallScore ?? null,
      url: `/reviews/${pr.id}`,
    }));
  }

  private async recentCommitReviews(repoIds: number[]): Promise<Record<string, unknown>[]> {
    const rows = await this.commitReviews.find({
      where: { repositoryId: In(repoIds) },
      relations: { repository: true },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 10,
    });

    return rows.map((cr) => ({
      kind: 'commit',
      id: cr.id,
      // Only the first line of the commit message, as the table is one row tall.
      title: cr.commitMessage ? (cr.commitMessage.split('\n')[0] ?? '') : '(no commit message)',
      author: cr.author,
      status: cr.status,
      short_sha: cr.commitSha.slice(0, 7),
      branch: cr.branch,
      created_at: toIso8601String(cr.createdAt),
      repository: {
        name: cr.repository?.name ?? null,
        full_name: cr.repository?.fullName ?? null,
      },
      score: cr.overallScore,
      url: `/commits/${cr.id}`,
    }));
  }

  /** Scored PR reviews only, oldest first — it feeds a trend chart. */
  private async timeline(repoIds: number[]): Promise<Record<string, unknown>[]> {
    const rows = await this.reviews.find({
      where: {
        overallScore: Not(IsNull()),
        pullRequest: { repositoryId: In(repoIds) },
      },
      relations: { pullRequest: true },
      order: { createdAt: 'ASC' },
      take: 50,
    });

    return rows.map((review) => ({
      date: toIso8601String(review.createdAt),
      score: review.overallScore,
      pr: `#${review.pullRequest?.prNumber ?? '?'}`,
    }));
  }
}
