# Repository Reviews Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking a connected repository card opens `/repositories/{id}`, a page listing every pull request and commit review for that repository.

**Architecture:** One new read endpoint on the existing `RepositoriesController`, returning the same row shape as the dashboard feed through a mapper both services share. One new server page that renders the dashboard's table, extracted into a shared component. The card gets a stretched link.

**Tech Stack:** NestJS 11 + TypeORM (jest), Next.js 15 App Router + React 19 (vitest, Testing Library).

Spec: `docs/superpowers/specs/2026-10-04-repository-reviews-page-design.md`

## Global Constraints

- `synchronize: false`. No schema change, no migration. This feature only reads.
- Ids serialise as JSON numbers; timestamps go through `toIso8601String`, never `Date#toISOString()`.
- The dashboard's JSON must not change: same keys, same order, same values.
- Error envelopes are fixed: validation failures are 422 `{message, errors}` via the global pipe. Do not hand-roll one.
- `esModuleInterop` is off in `prism-api`.
- Every web API call is server-side through `src/lib/api.ts`. No `NEXT_PUBLIC_` origin, no client fetch.
- `apiGetAuthed()` folds 400, 403 and 404 into the not-found page. Keep relying on it.
- Page size is 25. Order is `created_at DESC, id DESC`.
- Gates before every commit: `npm run typecheck && npm run lint && npm test` in the package touched.
- `TODOS.md` shows as deleted in the working tree. It is not part of this work: stage files by path, never `git add -A`.

## File Structure

| File | Responsibility |
|---|---|
| `prism-api/src/database/review-feed.mapper.ts` (new) | Entity → feed row, for PRs and commits |
| `prism-api/src/database/review-feed.mapper.spec.ts` (new) | Pins the row shape |
| `prism-api/src/modules/dashboard/dashboard.service.ts` | Uses the mapper |
| `prism-api/src/modules/repositories/dto/repository.dto.ts` | `RepositoryReviewsQueryDto` |
| `prism-api/src/modules/repositories/dto/repository-reviews.dto.spec.ts` (new) | Query validation |
| `prism-api/src/modules/repositories/repositories.service.ts` | `reviews()` |
| `prism-api/src/modules/repositories/repositories.service.spec.ts` | `reviews()` tests |
| `prism-api/src/modules/repositories/repositories.controller.ts` | The route |
| `prism-api/src/modules/repositories/repositories.module.ts` | Registers two more entities |
| `prism-web/src/components/review/ReviewFeedTable.tsx` (new) | The review rows, shared |
| `prism-web/src/components/dashboard/DashboardView.tsx` | Uses the shared table |
| `prism-web/src/lib/repository-reviews.ts` (new) | Builds the API query from URL params |
| `prism-web/src/lib/types.ts` | `RepositoryReviewsData` |
| `prism-web/src/components/repositories/ModeBadge.tsx` (new) | Moved out of `RepositoriesView` |
| `prism-web/src/components/repositories/RepositoryReviewsView.tsx` (new) | Tabs, rows, pagination, polling |
| `prism-web/src/app/repositories/[repository]/page.tsx` (new) | Server page and header |
| `prism-web/src/components/repositories/RepoCard.tsx` (new) | Moved out of `RepositoriesView`, plus the link |

---

### Task 1: Shared feed mapper

**Files:**
- Create: `prism-api/src/database/review-feed.mapper.ts`
- Test: `prism-api/src/database/review-feed.mapper.spec.ts`
- Modify: `prism-api/src/modules/dashboard/dashboard.service.ts:87-139`

**Interfaces:**
- Produces: `ReviewFeedItem`, `pullRequestFeedItem(pr: PullRequest): ReviewFeedItem`, `commitReviewFeedItem(cr: CommitReview): ReviewFeedItem`

- [ ] **Step 1: Write the failing test**

```ts
// prism-api/src/database/review-feed.mapper.spec.ts
import { commitReviewFeedItem, pullRequestFeedItem } from './review-feed.mapper';

/**
 * These rows are what the dashboard has always returned. The mapper was
 * extracted so a repository's own review list returns the same thing, and
 * the key order is asserted because the dashboard's JSON must not change.
 */
describe('review feed mapper', () => {
  const repository = { name: 'BSLCTR', fullName: 'Muhammad-AIUB/BSLCTR' };
  const createdAt = new Date('2026-06-12T11:28:00.000Z');

  it('maps a pull request to the dashboard row', () => {
    const row = pullRequestFeedItem({
      id: 5,
      title: 'Add login',
      author: 'octocat',
      status: 'completed',
      prNumber: 12,
      createdAt,
      repository,
      review: { overallScore: 81 },
    } as never);

    expect(row).toEqual({
      kind: 'pr',
      id: 5,
      title: 'Add login',
      author: 'octocat',
      status: 'completed',
      pr_number: 12,
      created_at: '2026-06-12T11:28:00+00:00',
      repository: { name: 'BSLCTR', full_name: 'Muhammad-AIUB/BSLCTR' },
      score: 81,
      url: '/reviews/5',
    });
    expect(Object.keys(row)).toEqual([
      'kind', 'id', 'title', 'author', 'status', 'pr_number',
      'created_at', 'repository', 'score', 'url',
    ]);
  });

  it('gives a pull request with no review yet a null score', () => {
    const row = pullRequestFeedItem({ id: 5, createdAt, repository, review: null } as never);

    expect(row.score).toBeNull();
  });

  it('maps a commit review, keeping only the first line of the message', () => {
    const row = commitReviewFeedItem({
      id: 9,
      commitMessage: 'Fix the parser\n\nLong body',
      author: 'octocat',
      status: 'analyzing',
      commitSha: '0123456789abcdef',
      branch: 'main',
      createdAt,
      repository,
      overallScore: null,
    } as never);

    expect(row).toEqual({
      kind: 'commit',
      id: 9,
      title: 'Fix the parser',
      author: 'octocat',
      status: 'analyzing',
      short_sha: '0123456',
      branch: 'main',
      created_at: '2026-06-12T11:28:00+00:00',
      repository: { name: 'BSLCTR', full_name: 'Muhammad-AIUB/BSLCTR' },
      score: null,
      url: '/commits/9',
    });
  });

  it('labels a commit that has no message', () => {
    const row = commitReviewFeedItem({
      id: 9, commitMessage: null, commitSha: 'abcdef0123', createdAt, repository,
    } as never);

    expect(row.title).toBe('(no commit message)');
  });

  it('survives a row whose repository relation was not loaded', () => {
    const row = pullRequestFeedItem({ id: 5, createdAt } as never);

    expect(row.repository).toEqual({ name: null, full_name: null });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd prism-api && npm test -- review-feed.mapper`
Expected: FAIL, `Cannot find module './review-feed.mapper'`.

- [ ] **Step 3: Write the mapper**

```ts
// prism-api/src/database/review-feed.mapper.ts
import { toIso8601String } from '../common/utils/iso8601';
import type { CommitReview, PullRequest } from './entities';

/**
 * One row of a review list: the dashboard feed, and a repository's own list.
 *
 * `kind` is how the page tells a PR row from a commit row. Both lists go
 * through these two functions so they cannot drift apart.
 */
export interface ReviewFeedItem {
  kind: 'pr' | 'commit';
  id: number;
  title: string;
  author: string | null;
  status: string;
  pr_number?: number;
  short_sha?: string;
  branch?: string;
  created_at: string | null;
  repository: { name: string | null; full_name: string | null };
  score: number | null;
  url: string;
}

export function pullRequestFeedItem(pr: PullRequest): ReviewFeedItem {
  return {
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
  };
}

export function commitReviewFeedItem(cr: CommitReview): ReviewFeedItem {
  return {
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
  };
}
```

- [ ] **Step 4: Make the dashboard use it**

In `dashboard.service.ts`, replace the two inline `rows.map(...)` bodies:

```ts
  private async recentPullRequests(repoIds: number[]): Promise<ReviewFeedItem[]> {
    const rows = await this.pullRequests.find({
      where: { repositoryId: In(repoIds) },
      relations: { repository: true, review: true },
      // The original's latest() orders by created_at; id breaks ties so rows created
      // in the same second do not shuffle between requests.
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 10,
    });

    return rows.map((pr) => pullRequestFeedItem(pr));
  }

  private async recentCommitReviews(repoIds: number[]): Promise<ReviewFeedItem[]> {
    const rows = await this.commitReviews.find({
      where: { repositoryId: In(repoIds) },
      relations: { repository: true },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 10,
    });

    return rows.map((cr) => commitReviewFeedItem(cr));
  }
```

Add the import, and keep `toIso8601String` imported (the timeline still uses it):

```ts
import {
  commitReviewFeedItem,
  pullRequestFeedItem,
  type ReviewFeedItem,
} from '../../database/review-feed.mapper';
```

- [ ] **Step 5: Run the gates**

Run: `cd prism-api && npm run typecheck && npm run lint && npm test`
Expected: all pass, including the 5 new mapper tests.

- [ ] **Step 6: Commit**

```bash
git add prism-api/src/database/review-feed.mapper.ts prism-api/src/database/review-feed.mapper.spec.ts prism-api/src/modules/dashboard/dashboard.service.ts
git commit -m "Build review list rows in one place"
```

---

### Task 2: `GET /repositories/:repository/reviews`

**Files:**
- Modify: `prism-api/src/modules/repositories/dto/repository.dto.ts`
- Create: `prism-api/src/modules/repositories/dto/repository-reviews.dto.spec.ts`
- Modify: `prism-api/src/modules/repositories/repositories.service.ts`
- Modify: `prism-api/src/modules/repositories/repositories.service.spec.ts`
- Modify: `prism-api/src/modules/repositories/repositories.controller.ts`
- Modify: `prism-api/src/modules/repositories/repositories.module.ts`

**Interfaces:**
- Consumes: `pullRequestFeedItem`, `commitReviewFeedItem`, `ReviewFeedItem` from Task 1.
- Produces: `GET /repositories/:repository/reviews?kind=prs|commits&page=N` returning
  `{ repository: {id, name, full_name, review_mode}, kind, total_prs, total_commits, page, per_page, items }`.

- [ ] **Step 1: Write the failing DTO test**

```ts
// prism-api/src/modules/repositories/dto/repository-reviews.dto.spec.ts
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RepositoryReviewsQueryDto } from './repository.dto';

/** Query strings arrive as text; these are the shapes a URL can carry. */
describe('RepositoryReviewsQueryDto', () => {
  const errorsFor = async (query: Record<string, string>) =>
    validate(plainToInstance(RepositoryReviewsQueryDto, query));

  it('accepts an empty query', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('accepts both kinds and turns the page into a number', async () => {
    const dto = plainToInstance(RepositoryReviewsQueryDto, { kind: 'commits', page: '3' });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.page).toBe(3);
  });

  it.each(['pr', 'all', ''])('refuses kind %p', async (kind) => {
    expect(await errorsFor({ kind })).not.toHaveLength(0);
  });

  // 1e20 parses as an integer and then overflows the OFFSET, which is a 500.
  it.each(['0', '-1', '1.5', 'abc', '99999999999999999999'])('refuses page %p', async (page) => {
    expect(await errorsFor({ page })).not.toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd prism-api && npm test -- repository-reviews.dto`
Expected: FAIL, `RepositoryReviewsQueryDto` is not exported.

- [ ] **Step 3: Add the DTO**

Append to `repository.dto.ts`, and add `Max` and `Min` to the `class-validator` import:

```ts
export const REVIEW_KINDS = ['prs', 'commits'] as const;
export type ReviewKind = (typeof REVIEW_KINDS)[number];

export class RepositoryReviewsQueryDto {
  @IsOptional()
  @IsIn(REVIEW_KINDS)
  kind?: ReviewKind;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  // A page number that cannot exist. Without a ceiling, a huge one overflows
  // the OFFSET and Postgres answers with an error instead of an empty page.
  @Max(1_000_000)
  page?: number;
}
```

Run: `npm test -- repository-reviews.dto`. Expected: PASS.

- [ ] **Step 4: Write the failing service tests**

Replace the `build` helper's constructor call in `repositories.service.spec.ts` so it passes eight arguments (two more `{} as never` at the end), then append:

```ts
describe('RepositoriesService.reviews', () => {
  const user = { id: 7 } as never;
  const owned = { id: 3, userId: 7, name: 'BSLCTR', fullName: 'Muhammad-AIUB/BSLCTR', reviewMode: 'both' };

  const build = (options: { repository?: unknown; prs?: number; commits?: number } = {}) => {
    const repositories = {
      findOne: jest.fn().mockResolvedValue('repository' in options ? options.repository : owned),
    };
    const pullRequests = {
      count: jest.fn().mockResolvedValue(options.prs ?? 0),
      find: jest.fn().mockResolvedValue([]),
    };
    const commitReviews = {
      count: jest.fn().mockResolvedValue(options.commits ?? 0),
      find: jest.fn().mockResolvedValue([]),
    };
    const service = new RepositoriesService(
      repositories as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      pullRequests as never,
      commitReviews as never,
    );

    return { service, pullRequests, commitReviews };
  };

  it('refuses a repository that belongs to someone else', async () => {
    const { service, pullRequests } = build({ repository: { ...owned, userId: 99 } });

    await expect(service.reviews(user, 3, {})).rejects.toBeInstanceOf(ForbiddenException);
    expect(pullRequests.find).not.toHaveBeenCalled();
  });

  it('answers 404 for a repository that does not exist', async () => {
    const { service } = build({ repository: null });

    await expect(service.reviews(user, 3, {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists only this repository, newest first, 25 to a page', async () => {
    const { service, pullRequests } = build({ prs: 60 });

    const result = await service.reviews(user, 3, { kind: 'prs', page: 3 });

    expect(pullRequests.find).toHaveBeenCalledWith({
      where: { repositoryId: 3 },
      relations: { repository: true, review: true },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: 50,
      take: 25,
    });
    expect(result).toMatchObject({ kind: 'prs', page: 3, per_page: 25, total_prs: 60 });
  });

  it('reports both totals whichever kind is asked for', async () => {
    const { service } = build({ prs: 4, commits: 9 });

    const result = await service.reviews(user, 3, { kind: 'commits' });

    expect(result).toMatchObject({ kind: 'commits', total_prs: 4, total_commits: 9, page: 1 });
  });

  it('opens a commit-only repository on its commits', async () => {
    const { service, pullRequests, commitReviews } = build({ prs: 0, commits: 4 });

    const result = await service.reviews(user, 3, {});

    expect(result.kind).toBe('commits');
    expect(commitReviews.find).toHaveBeenCalledWith({
      where: { repositoryId: 3 },
      relations: { repository: true },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: 0,
      take: 25,
    });
    expect(pullRequests.find).not.toHaveBeenCalled();
  });

  it('opens on pull requests otherwise, and honours an explicit kind', async () => {
    expect((await build().service.reviews(user, 3, {})).kind).toBe('prs');
    expect((await build({ prs: 2, commits: 4 }).service.reviews(user, 3, {})).kind).toBe('prs');
    expect((await build({ commits: 4 }).service.reviews(user, 3, { kind: 'prs' })).kind).toBe('prs');
  });

  it('describes the repository for the page header', async () => {
    const result = await build().service.reviews(user, 3, {});

    expect(result.repository).toEqual({
      id: 3,
      name: 'BSLCTR',
      full_name: 'Muhammad-AIUB/BSLCTR',
      review_mode: 'both',
    });
  });
});
```

Add to the spec's imports: `import { ForbiddenException, NotFoundException } from '@nestjs/common';`

Run: `npm test -- repositories.service`. Expected: FAIL, `service.reviews is not a function`.

- [ ] **Step 5: Implement the service method**

In `repositories.service.ts`:

```ts
// imports
import { CommitReview, PullRequest, Repository, User } from '../../database/entities';
import {
  commitReviewFeedItem,
  pullRequestFeedItem,
  type ReviewFeedItem,
} from '../../database/review-feed.mapper';
import type {
  ConnectRepositoryDto,
  RepositoryReviewsQueryDto,
  ReviewKind,
  UpdateRepositorySettingsDto,
} from './dto/repository.dto';

// beside the cache TTL constants
export const REVIEWS_PER_PAGE = 25;

// constructor: two more parameters, at the end
    @InjectRepository(PullRequest)
    private readonly pullRequests: OrmRepository<PullRequest>,
    @InjectRepository(CommitReview)
    private readonly commitReviews: OrmRepository<CommitReview>,

// after settings()/updateSettings()
  /**
   * GET /repositories/:id/reviews — every review for one repository.
   *
   * The dashboard shows the last ten across all repositories; this is the
   * whole list for one. Both totals come back whichever kind is listed, so
   * the page can label both tabs from a single request.
   */
  async reviews(
    user: User,
    id: number,
    query: RepositoryReviewsQueryDto,
  ): Promise<{
    repository: { id: number; name: string; full_name: string; review_mode: string };
    kind: ReviewKind;
    total_prs: number;
    total_commits: number;
    page: number;
    per_page: number;
    items: ReviewFeedItem[];
  }> {
    const repository = await this.findOwned(user, id);
    const where = { repositoryId: repository.id };

    const [totalPrs, totalCommits] = await Promise.all([
      this.pullRequests.count({ where }),
      this.commitReviews.count({ where }),
    ]);

    // A commit-only repository opens on its commits rather than on an empty
    // pull request tab — the same rule the dashboard applies.
    const kind = query.kind ?? (totalPrs === 0 && totalCommits > 0 ? 'commits' : 'prs');
    const page = query.page ?? 1;
    const paging = {
      // id breaks ties so rows created in the same second do not shuffle.
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (page - 1) * REVIEWS_PER_PAGE,
      take: REVIEWS_PER_PAGE,
    } as const;

    const items =
      kind === 'prs'
        ? (
            await this.pullRequests.find({
              where,
              relations: { repository: true, review: true },
              ...paging,
            })
          ).map((pr) => pullRequestFeedItem(pr))
        : (
            await this.commitReviews.find({ where, relations: { repository: true }, ...paging })
          ).map((cr) => commitReviewFeedItem(cr));

    return {
      repository: {
        id: repository.id,
        name: repository.name,
        full_name: repository.fullName,
        review_mode: repository.reviewMode,
      },
      kind,
      total_prs: totalPrs,
      total_commits: totalCommits,
      page,
      per_page: REVIEWS_PER_PAGE,
      items,
    };
  }
```

- [ ] **Step 6: Wire the module and the route**

`repositories.module.ts`:

```ts
import { CommitReview, PullRequest, Repository } from '../../database/entities';
// ...
    TypeOrmModule.forFeature([Repository, PullRequest, CommitReview]),
```

`repositories.controller.ts`, after `updateSettings`, with `RepositoryReviewsQueryDto` added to the DTO import:

```ts
  @Get(':repository/reviews')
  reviews(
    @CurrentUser() user: User,
    @Param('repository', ParseIdPipe) id: number,
    @Query() query: RepositoryReviewsQueryDto,
  ) {
    return this.repositories.reviews(user, id, query);
  }
```

- [ ] **Step 7: Run the gates**

Run: `cd prism-api && npm run typecheck && npm run lint && npm test`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add prism-api/src/modules/repositories
git commit -m "List every review for one repository"
```

---

### Task 3: Shared review table (web)

**Files:**
- Create: `prism-web/src/components/review/ReviewFeedTable.tsx`
- Test: `prism-web/src/components/review/ReviewFeedTable.test.tsx`
- Modify: `prism-web/src/components/dashboard/DashboardView.tsx:318-454`

**Interfaces:**
- Produces: `ReviewFeedTable({ rows, kind, showRepository? })`, default export.
  `rows: FeedItem[]`, `kind: 'prs' | 'commits'`, `showRepository: boolean` (default `true`).

- [ ] **Step 1: Write the failing test**

```tsx
// prism-web/src/components/review/ReviewFeedTable.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { FeedItem } from '@/lib/types';
import ReviewFeedTable from './ReviewFeedTable';

function row(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    kind: 'pr',
    id: 5,
    title: 'Add login',
    author: 'octocat',
    status: 'completed',
    pr_number: 12,
    created_at: '2026-06-12T11:28:00+00:00',
    repository: { name: 'BSLCTR', full_name: 'Muhammad-AIUB/BSLCTR' },
    score: 81,
    url: '/reviews/5',
    ...overrides,
  };
}

// jsdom applies no CSS, so the stacked (mobile) and tabular (desktop) layouts
// are both in the document and every row appears twice.
describe('ReviewFeedTable', () => {
  it('links every row to its review', () => {
    render(<ReviewFeedTable rows={[row()]} kind="prs" />);

    const links = screen.getAllByRole('link', { name: /#12 Add login/ });

    expect(links).toHaveLength(2);
    links.forEach((link) => expect(link).toHaveAttribute('href', '/reviews/5'));
  });

  it('identifies a commit by its short sha', () => {
    render(
      <ReviewFeedTable
        rows={[row({ kind: 'commit', short_sha: '0123456', pr_number: undefined, title: 'Fix parser', url: '/commits/9' })]}
        kind="commits"
      />,
    );

    const links = screen.getAllByRole('link', { name: /0123456 Fix parser/ });

    links.forEach((link) => expect(link).toHaveAttribute('href', '/commits/9'));
    expect(screen.getByRole('columnheader', { name: 'Commit' })).toBeInTheDocument();
  });

  it('names the repository on the dashboard', () => {
    render(<ReviewFeedTable rows={[row()]} kind="prs" />);

    expect(screen.getByRole('columnheader', { name: 'Repository' })).toBeInTheDocument();
    expect(screen.getAllByText('Muhammad-AIUB/BSLCTR')).toHaveLength(2);
  });

  it('leaves the repository out where the page is already about one', () => {
    render(<ReviewFeedTable rows={[row()]} kind="prs" showRepository={false} />);

    expect(screen.queryByRole('columnheader', { name: 'Repository' })).not.toBeInTheDocument();
    expect(screen.queryByText('Muhammad-AIUB/BSLCTR')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd prism-web && npm test -- ReviewFeedTable`
Expected: FAIL, cannot resolve `./ReviewFeedTable`.

- [ ] **Step 3: Create the component by moving the markup**

Create `ReviewFeedTable.tsx` with this frame, and move `DashboardView.tsx` lines 319-453 (the mobile `<ul>` and the `md+` table, everything inside the `<>…</>` fragment) into the fragment below, unchanged except for the three edits listed after it.

```tsx
import { GitCommit, GitPullRequest } from 'lucide-react';
import Link from 'next/link';
import { AuthorAvatar, ScorePill, StatusPill } from '@/components/ui/pills';
import { relativeTime } from '@/lib/time';
import type { FeedItem } from '@/lib/types';

/**
 * The rows of a review list: stacked cards on a phone, a table from md up.
 *
 * Shared by the dashboard and a repository's own review page so the two
 * cannot drift. A page that is already about one repository passes
 * `showRepository={false}` rather than repeating its name on every row.
 */
export default function ReviewFeedTable({
  rows,
  kind,
  showRepository = true,
}: {
  rows: FeedItem[];
  kind: 'prs' | 'commits';
  showRepository?: boolean;
}) {
  return (
    <>
      {/* moved markup */}
    </>
  );
}
```

The three edits to the moved markup:

1. Mobile card: wrap the repository line in the flag.

```tsx
{showRepository && (
  <p className="truncate font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
    {row.repository?.full_name ?? '—'}
  </p>
)}
```

2. Table head: `{showRepository && <th className="px-5 py-3 font-medium">Repository</th>}`, and `{tab === 'prs' ? 'PR Title' : 'Commit'}` becomes `{kind === 'prs' ? 'PR Title' : 'Commit'}`.

3. Table body: wrap the repository `<td>` in `{showRepository && ( … )}`.

- [ ] **Step 4: Use it in the dashboard**

In `DashboardView.tsx` the `rows.length === 0 ? (…) : (<>…</>)` else-branch becomes:

```tsx
        ) : (
          <ReviewFeedTable rows={rows} kind={tab} />
        )}
```

Add `import ReviewFeedTable from '@/components/review/ReviewFeedTable';` and remove the imports the dashboard no longer uses (`AuthorAvatar`, `ScorePill`, `StatusPill`, `relativeTime`; lint names any that remain unused).

- [ ] **Step 5: Run the gates**

Run: `cd prism-web && npm run typecheck && npm run lint && npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add prism-web/src/components/review/ReviewFeedTable.tsx prism-web/src/components/review/ReviewFeedTable.test.tsx prism-web/src/components/dashboard/DashboardView.tsx
git commit -m "Share the review rows between pages"
```

---

### Task 4: The repository page (web)

**Files:**
- Create: `prism-web/src/lib/repository-reviews.ts`
- Test: `prism-web/src/lib/repository-reviews.test.ts`
- Modify: `prism-web/src/lib/types.ts`
- Create: `prism-web/src/components/repositories/ModeBadge.tsx`
- Modify: `prism-web/src/components/repositories/RepositoriesView.tsx:52-85`
- Create: `prism-web/src/components/repositories/RepositoryReviewsView.tsx`
- Test: `prism-web/src/components/repositories/RepositoryReviewsView.test.tsx`
- Create: `prism-web/src/app/repositories/[repository]/page.tsx`

**Interfaces:**
- Consumes: `ReviewFeedTable` (Task 3); the endpoint (Task 2).
- Produces: `reviewsQuery(params): string`; `RepositoryReviewsData`; `ModeBadge({ mode })` default export; `RepositoryReviewsView({ data })` default export.

- [ ] **Step 1: Write the failing query test**

```ts
// prism-web/src/lib/repository-reviews.test.ts
import { describe, expect, it } from 'vitest';
import { reviewsQuery } from './repository-reviews';

/**
 * The API answers 422 to a kind or page it does not accept, and a 422 on a
 * page load renders the error screen. A hand-edited URL should fall back to
 * the defaults instead, so only acceptable values are forwarded.
 */
describe('reviewsQuery', () => {
  it('is empty when the URL carries nothing', () => {
    expect(reviewsQuery({})).toBe('');
  });

  it('forwards a valid kind and page', () => {
    expect(reviewsQuery({ kind: 'commits', page: '3' })).toBe('?kind=commits&page=3');
  });

  it.each(['pr', 'PRS', ''])('drops kind %p', (kind) => {
    expect(reviewsQuery({ kind })).toBe('');
  });

  it.each(['0', '-1', '1.5', 'abc', '01', '99999999999999999999'])('drops page %p', (page) => {
    expect(reviewsQuery({ page })).toBe('');
  });

  it('drops a repeated parameter rather than guessing which one was meant', () => {
    expect(reviewsQuery({ kind: ['prs', 'commits'], page: ['1', '2'] })).toBe('');
  });
});
```

Run: `cd prism-web && npm test -- repository-reviews`. Expected: FAIL, module not found.

- [ ] **Step 2: Implement it**

```ts
// prism-web/src/lib/repository-reviews.ts
type Param = string | string[] | undefined;

/**
 * The query string for GET /repositories/:id/reviews, built only from values
 * that endpoint accepts. Anything else in the page's URL is left out, so the
 * API's defaults apply instead of its 422.
 */
export function reviewsQuery(params: { kind?: Param; page?: Param }): string {
  const query = new URLSearchParams();

  if (params.kind === 'prs' || params.kind === 'commits') {
    query.set('kind', params.kind);
  }

  // Six digits keeps it under the API's ceiling of 1,000,000.
  if (typeof params.page === 'string' && /^[1-9]\d{0,5}$/.test(params.page)) {
    query.set('page', params.page);
  }

  const text = query.toString();

  return text ? `?${text}` : '';
}
```

Run the test again. Expected: PASS.

- [ ] **Step 3: Add the type**

In `types.ts`, after `RepositorySettingsData`:

```ts
export interface RepositoryReviewsData {
  repository: {
    id: number;
    name: string;
    full_name: string;
    review_mode: string;
  };
  /** Which list `items` holds. The API picks one when the URL names none. */
  kind: 'prs' | 'commits';
  total_prs: number;
  total_commits: number;
  page: number;
  per_page: number;
  items: FeedItem[];
}
```

- [ ] **Step 4: Move `ModeBadge` to its own file**

Create `ModeBadge.tsx` holding `MODE_BADGE` and `ModeBadge` exactly as they are in `RepositoriesView.tsx:52-85`, with `export default function ModeBadge` and these imports:

```tsx
import { GitCommit, GitPullRequest, Layers } from 'lucide-react';
import type { ComponentType } from 'react';
```

Delete both from `RepositoriesView.tsx`, add `import ModeBadge from '@/components/repositories/ModeBadge';`, and drop the imports that leaves unused.

- [ ] **Step 5: Write the failing view test**

```tsx
// prism-web/src/components/repositories/RepositoryReviewsView.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FeedItem, RepositoryReviewsData } from '@/lib/types';
import RepositoryReviewsView from './RepositoryReviewsView';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

function item(id: number, overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    kind: 'commit',
    id,
    title: `Commit ${id}`,
    author: 'octocat',
    status: 'completed',
    short_sha: `abc000${id}`,
    branch: 'main',
    created_at: '2026-06-12T11:28:00+00:00',
    repository: { name: 'BSLCTR', full_name: 'Muhammad-AIUB/BSLCTR' },
    score: 80,
    url: `/commits/${id}`,
    ...overrides,
  };
}

function data(overrides: Partial<RepositoryReviewsData> = {}): RepositoryReviewsData {
  return {
    repository: { id: 3, name: 'BSLCTR', full_name: 'Muhammad-AIUB/BSLCTR', review_mode: 'both' },
    kind: 'commits',
    total_prs: 2,
    total_commits: 60,
    page: 2,
    per_page: 25,
    items: [item(1)],
    ...overrides,
  };
}

describe('RepositoryReviewsView', () => {
  it('lists the reviews and links each to its page', () => {
    render(<RepositoryReviewsView data={data()} />);

    screen
      .getAllByRole('link', { name: /Commit 1/ })
      .forEach((link) => expect(link).toHaveAttribute('href', '/commits/1'));
  });

  it('marks the tab the API returned, and counts both', () => {
    render(<RepositoryReviewsView data={data()} />);

    const commits = screen.getByRole('link', { name: /Commits\s*60/ });
    const prs = screen.getByRole('link', { name: /Pull Requests\s*2/ });

    expect(commits).toHaveAttribute('aria-current', 'page');
    expect(prs).not.toHaveAttribute('aria-current');
    expect(prs).toHaveAttribute('href', '/repositories/3?kind=prs');
  });

  it('pages within the same kind', () => {
    render(<RepositoryReviewsView data={data()} />);

    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Previous' })).toHaveAttribute(
      'href',
      '/repositories/3?kind=commits',
    );
    expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute(
      'href',
      '/repositories/3?kind=commits&page=3',
    );
  });

  it('shows no pager when everything fits on one page', () => {
    render(<RepositoryReviewsView data={data({ page: 1, total_commits: 1 })} />);

    expect(screen.queryByText(/^Page /)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Next' })).not.toBeInTheDocument();
  });

  it('says what triggers a review when there are none', () => {
    render(
      <RepositoryReviewsView
        data={data({ kind: 'prs', page: 1, total_prs: 0, total_commits: 0, items: [] })}
      />,
    );

    expect(screen.getByText('No pull request reviews yet')).toBeInTheDocument();
    expect(screen.getByText(/Open a pull request/)).toBeInTheDocument();
  });

  it('offers the way back from a page past the end', () => {
    render(<RepositoryReviewsView data={data({ page: 9, items: [] })} />);

    expect(screen.getByText('Nothing on this page')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Previous' })).toHaveAttribute(
      'href',
      '/repositories/3?kind=commits&page=3',
    );
    expect(screen.queryByRole('link', { name: 'Next' })).not.toBeInTheDocument();
  });
});
```

Run: `npm test -- RepositoryReviewsView`. Expected: FAIL, module not found.

- [ ] **Step 6: Implement the view**

```tsx
// prism-web/src/components/repositories/RepositoryReviewsView.tsx
'use client';

import { ChevronLeft, ChevronRight, GitCommit, GitPullRequest } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import ReviewFeedTable from '@/components/review/ReviewFeedTable';
import type { RepositoryReviewsData } from '@/lib/types';

type Kind = RepositoryReviewsData['kind'];

const TABS = [
  { key: 'prs', label: 'Pull Requests', icon: GitPullRequest },
  { key: 'commits', label: 'Commits', icon: GitCommit },
] as const;

/**
 * Every review for one repository: the dashboard's table without its cap.
 *
 * The tab and the page live in the URL rather than in state, so a list can be
 * linked to and the server component fetches exactly what is shown.
 */
export default function RepositoryReviewsView({ data }: { data: RepositoryReviewsData }) {
  const { repository, kind, total_prs, total_commits, page, per_page, items } = data;
  const router = useRouter();

  const totals: Record<Kind, number> = { prs: total_prs, commits: total_commits };
  const lastPage = Math.max(1, Math.ceil(totals[kind] / per_page));

  const href = (target: Kind, targetPage = 1) =>
    `/repositories/${repository.id}?kind=${target}${targetPage > 1 ? `&page=${targetPage}` : ''}`;

  const hasInFlight = items.some((row) => row.status === 'pending' || row.status === 'analyzing');

  // Poll while anything is still being reviewed, as the dashboard does, so a
  // fresh push appears without a manual reload.
  useEffect(() => {
    if (!hasInFlight) {
      return;
    }

    const id = setInterval(() => router.refresh(), 8000);

    return () => clearInterval(id);
  }, [hasInFlight, router]);

  const EmptyIcon = kind === 'prs' ? GitPullRequest : GitCommit;

  return (
    <div className="card-flat overflow-hidden">
      <div className="border-b px-5" style={{ borderColor: 'var(--border)' }}>
        <nav className="-mx-1 flex gap-1" aria-label="Review type">
          {TABS.map(({ key, label, icon: Icon }) => {
            const isActive = kind === key;

            return (
              <Link
                key={key}
                href={href(key)}
                aria-current={isActive ? 'page' : undefined}
                className={`tab-item ${isActive ? 'tab-item-active' : ''}`}
              >
                <Icon className="h-4 w-4" />
                {label}
                <span
                  className="rounded-full px-1.5 text-xs"
                  style={{
                    backgroundColor: 'var(--bg-hover)',
                    color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                  }}
                >
                  {totals[key]}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>

      {items.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <div
            className="mx-auto grid h-12 w-12 place-items-center rounded-full"
            style={{ backgroundColor: 'var(--accent-bg)', color: 'var(--accent)' }}
          >
            <EmptyIcon className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
            {page > 1
              ? 'Nothing on this page'
              : kind === 'prs'
                ? 'No pull request reviews yet'
                : 'No commit reviews yet'}
          </h2>
          {page === 1 && (
            <p className="mx-auto mt-2 max-w-md text-sm" style={{ color: 'var(--text-secondary)' }}>
              {kind === 'prs'
                ? 'Open a pull request in this repository and PRism will review it.'
                : 'Push to a watched branch and PRism will review the commit.'}
            </p>
          )}
        </div>
      ) : (
        <ReviewFeedTable rows={items} kind={kind} showRepository={false} />
      )}

      {(lastPage > 1 || page > 1) && (
        <div
          className="flex items-center justify-between gap-3 border-t px-5 py-3 text-sm"
          style={{ borderColor: 'var(--border)' }}
        >
          <span style={{ color: 'var(--text-muted)' }}>
            Page {page} of {lastPage}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              // From past the end, "previous" is the last page that exists.
              <Link href={href(kind, Math.min(page - 1, lastPage))} className="btn btn-secondary">
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Link>
            )}
            {page < lastPage && (
              <Link href={href(kind, page + 1)} className="btn btn-secondary">
                Next
                <ChevronRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

Run: `npm test -- RepositoryReviewsView`. Expected: PASS (6 tests).

- [ ] **Step 7: Add the page**

```tsx
// prism-web/src/app/repositories/[repository]/page.tsx
import { ArrowLeft, ExternalLink, Settings } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { cache } from 'react';
import AuthenticatedLayout from '@/components/layouts/AuthenticatedLayout';
import ModeBadge from '@/components/repositories/ModeBadge';
import RepositoryReviewsView from '@/components/repositories/RepositoryReviewsView';
import { apiGetAuthed } from '@/lib/api';
import { reviewsQuery } from '@/lib/repository-reviews';
import { getSessionUser } from '@/lib/session';
import type { RepositoryReviewsData } from '@/lib/types';

interface Props {
  params: Promise<{ repository: string }>;
  searchParams: Promise<{ kind?: string | string[]; page?: string | string[] }>;
}

/**
 * One request serves both the title and the page. Every API call leaves from
 * this server's address and counts against a throttle bucket all visitors
 * share, so fetching the same list twice per view is not free.
 */
const loadReviews = cache((repository: string, query: string) =>
  apiGetAuthed<RepositoryReviewsData>(
    `/repositories/${encodeURIComponent(repository)}/reviews${query}`,
  ),
);

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ repository }, search] = await Promise.all([params, searchParams]);
  const data = await loadReviews(repository, reviewsQuery(search));

  return { title: `Reviews · ${data.repository.full_name}` };
}

export default async function RepositoryReviewsPage({ params, searchParams }: Props) {
  const [{ repository }, search] = await Promise.all([params, searchParams]);

  const [user, data] = await Promise.all([
    getSessionUser(),
    loadReviews(repository, reviewsQuery(search)),
  ]);

  return (
    <AuthenticatedLayout
      user={user}
      header={
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p
              className="text-xs font-medium uppercase tracking-wider sm:text-xs"
              style={{ color: 'var(--text-muted)' }}
            >
              Repository
            </p>
            <div className="mt-0.5 flex min-w-0 items-center gap-3">
              <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl lg:text-3xl">
                {data.repository.full_name}
              </h1>
              <ModeBadge mode={data.repository.review_mode} />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <a
              href={`https://github.com/${data.repository.full_name}`}
              target="_blank"
              rel="noreferrer"
              aria-label="Open on GitHub"
              className="btn btn-ghost min-h-[44px] transition active:scale-95"
              style={{ padding: '0.375rem 0.625rem' }}
            >
              <ExternalLink className="h-4 w-4" />
            </a>
            <Link
              href={`/repositories/${data.repository.id}/settings`}
              aria-label="Repository settings"
              className="btn btn-ghost min-h-[44px] transition active:scale-95"
              style={{ padding: '0.375rem 0.625rem' }}
            >
              <Settings className="h-4 w-4" />
            </Link>
            <Link
              href="/repositories"
              className="btn btn-ghost min-h-[44px] transition active:scale-95"
              style={{ padding: '0.375rem 0.625rem' }}
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">Back</span>
            </Link>
          </div>
        </div>
      }
    >
      <RepositoryReviewsView data={data} />
    </AuthenticatedLayout>
  );
}
```

- [ ] **Step 8: Run the gates**

Run: `cd prism-web && npm run typecheck && npm run lint && npm test && npm run build`
Expected: all pass; the build output lists `/repositories/[repository]` as a dynamic route.

- [ ] **Step 9: Commit**

```bash
git add prism-web/src/lib/repository-reviews.ts prism-web/src/lib/repository-reviews.test.ts prism-web/src/lib/types.ts prism-web/src/components/repositories "prism-web/src/app/repositories/[repository]/page.tsx"
git commit -m "Add a page listing every review for a repository"
```

---

### Task 5: Make the connected card open it

**Files:**
- Create: `prism-web/src/components/repositories/RepoCard.tsx`
- Test: `prism-web/src/components/repositories/RepoCard.test.tsx`
- Modify: `prism-web/src/components/repositories/RepositoriesView.tsx`

**Interfaces:**
- Consumes: `ModeBadge` (Task 4).
- Produces: `RepoCard({ repo, isConnected, connectedRepo, isLoading, onConnect })`, default export, same props as today.

- [ ] **Step 1: Write the failing test**

```tsx
// prism-web/src/components/repositories/RepoCard.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ConnectedRepo, GithubRepo } from '@/lib/types';
import RepoCard from './RepoCard';

const repo: GithubRepo = {
  id: 900,
  name: 'BSLCTR',
  full_name: 'Muhammad-AIUB/BSLCTR',
  html_url: 'https://github.com/Muhammad-AIUB/BSLCTR',
  language: 'TypeScript',
};

const connected: ConnectedRepo = {
  id: 3,
  github_repo_id: 900,
  full_name: 'Muhammad-AIUB/BSLCTR',
  review_mode: 'commit_only',
  review_branches: ['main'],
};

describe('RepoCard', () => {
  it('opens the repository reviews when a connected card is clicked', () => {
    render(
      <RepoCard repo={repo} isConnected connectedRepo={connected} isLoading={false} onConnect={vi.fn()} />,
    );

    expect(
      screen.getByRole('link', { name: 'View reviews for Muhammad-AIUB/BSLCTR' }),
    ).toHaveAttribute('href', '/repositories/3');
  });

  it('keeps the GitHub and settings links on a connected card', () => {
    render(
      <RepoCard repo={repo} isConnected connectedRepo={connected} isLoading={false} onConnect={vi.fn()} />,
    );

    expect(screen.getByRole('link', { name: /Muhammad-AIUB\/BSLCTR$/ })).toHaveAttribute(
      'href',
      'https://github.com/Muhammad-AIUB/BSLCTR',
    );
    expect(screen.getByRole('link', { name: 'Repository settings' })).toHaveAttribute(
      'href',
      '/repositories/3/settings',
    );
  });

  it('offers only Connect on a repository that is not connected', () => {
    render(<RepoCard repo={repo} isConnected={false} isLoading={false} onConnect={vi.fn()} />);

    expect(screen.queryByRole('link', { name: /View reviews/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument();
  });
});
```

Run: `cd prism-web && npm test -- RepoCard`. Expected: FAIL, module not found.

- [ ] **Step 2: Move the card and add the link**

Create `RepoCard.tsx` with `LANG_COLORS` and `RepoCard` moved from `RepositoriesView.tsx` (`export default function RepoCard`, first line `'use client';`), importing what it uses:

```tsx
import { Check, ExternalLink, Lock, Settings, Star } from 'lucide-react';
import Link from 'next/link';
import ModeBadge from '@/components/repositories/ModeBadge';
import { relativeTime } from '@/lib/time';
import type { ConnectedRepo, GithubRepo } from '@/lib/types';
```

Then three changes inside it:

1. The root element gains `relative`, and the link is its first child:

```tsx
    <div className="card relative flex flex-col gap-3 transition" style={{ minHeight: '180px' }}>
      {/* The whole card opens the repository's reviews. An anchor cannot
          contain the GitHub link and the gear, so this one is stretched over
          the card instead and those two are raised above it. Not prefetched:
          each prefetch would render the page, and with it spend API calls
          from the throttle bucket every visitor shares. */}
      {connectedRepo?.id && (
        <Link
          href={`/repositories/${connectedRepo.id}`}
          prefetch={false}
          aria-label={`View reviews for ${repo.full_name}`}
          className="absolute inset-0 z-0 rounded-[inherit]"
        />
      )}
```

2. The GitHub anchor's class gains `relative z-10`:

```tsx
            className="relative z-10 inline-flex items-center gap-1.5 text-sm font-semibold transition hover:opacity-80"
```

3. The settings `Link`'s class gains `relative z-10`:

```tsx
                className="relative z-10 grid h-7 w-7 place-items-center rounded transition hover:bg-hover"
```

In `RepositoriesView.tsx` delete `LANG_COLORS` and `RepoCard`, add `import RepoCard from '@/components/repositories/RepoCard';`, and remove the imports that leaves unused.

- [ ] **Step 3: Run the gates**

Run: `cd prism-web && npm run typecheck && npm run lint && npm test && npm run build`
Expected: all pass.

- [ ] **Step 4: Check it in a browser**

Follow `prism-api/LOCAL-VERIFICATION.md` to stand up the local stack (API on 3999, web on 3001), sign in is not possible with dummy GitHub credentials, so seed a session the way that document describes, then confirm:

- a connected card opens `/repositories/{id}`; the GitHub link and the gear still go where they did;
- the tabs switch and show counts; a row opens its review;
- `/repositories/abc` and another user's id both render the not-found page;
- `/repositories/{id}?kind=x&page=-1` renders the default list, not an error.

If the local stack cannot be stood up, say so in the report instead of claiming this step.

- [ ] **Step 5: Commit**

```bash
git add prism-web/src/components/repositories/RepoCard.tsx prism-web/src/components/repositories/RepoCard.test.tsx prism-web/src/components/repositories/RepositoriesView.tsx
git commit -m "Open a repository's reviews from its card"
```
