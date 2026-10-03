# Repository reviews page

Date: 2026-10-04
Status: approved, not yet implemented.

## Goal

Clicking a connected repository card on `/repositories` opens a page listing
every review PRism has run for that repository, pull requests and commits,
each row opening the existing review detail page.

## Why

There is no per-repository list anywhere. The dashboard shows the last 10
pull requests and the last 10 commits across all repositories, and the
sidebar's "Reviews" item links to the dashboard. After connecting a repository
there is no way to see everything PRism has said about it.

## Scope

### In

- A new API endpoint, `GET /repositories/:repository/reviews`.
- A new page, `/repositories/[repository]`.
- Connected cards on `/repositories` become clickable.

### Out

- The sidebar "Reviews" item keeps pointing at the dashboard.
- No filtering, sorting or search on the new page.
- No change to the dashboard, the review detail pages, or the `/api/v1`
  token-authenticated surface.
- Unconnected cards are unchanged.

## API

`GET /repositories/:repository/reviews?kind=prs|commits&page=N`

- Lives on the existing `RepositoriesController`, so it is behind
  `WebAuthGuard` and the global throttler like its neighbours.
- `:repository` goes through `ParseIdPipe`. Ownership uses the existing
  `findOwned()`: 404 for a missing row, 403 for someone else's. The web folds
  both into the not-found page via `apiGetAuthed()`.
- `kind` is optional. When it is omitted the API returns pull requests, unless
  the repository has none and has commits, in which case it returns commits.
  The response's `kind` says which list `items` holds. A value other than
  `prs` or `commits` is a 422 through the usual validation envelope.
- `page` defaults to 1 and must be a positive integer.
- Page size is 25, fixed.
- Order is `created_at DESC, id DESC`, the same tie-break the dashboard uses.

Response:

```json
{
  "repository": {
    "id": 12,
    "name": "BSLCTR",
    "full_name": "Muhammad-AIUB/BSLCTR",
    "review_mode": "commit_only"
  },
  "kind": "commits",
  "total_prs": 0,
  "total_commits": 37,
  "page": 1,
  "per_page": 25,
  "items": []
}
```

`items` are `FeedItem` rows, the shape the dashboard feed already returns
(`kind`, `id`, `title`, `author`, `status`, `pr_number` or `short_sha` and
`branch`, `created_at`, `repository`, `score`, `url`). Both totals are always
returned so the tabs can show counts without a second request.

The two row mappers move out of `DashboardService` into a shared
`review-feed.mapper.ts`, and both services call them. One mapper, so the
dashboard rows and the repository rows cannot drift.

Stored-data rules apply as everywhere: ids are JSON numbers, timestamps go
through `toIso8601String`.

## Web

### Card

A connected card navigates to `/repositories/{id}` when clicked anywhere on
it. The repository name stays a link to GitHub and the gear stays a link to
settings; neither may be nested inside another anchor. The card uses a
stretched link: one `next/link` covering the card, with the GitHub link and
the gear raised above it. The card gets a hover state and the link gets an
accessible name ("View reviews for {full_name}").

### Page

`/repositories/[repository]/page.tsx` is a server component. It reads `kind`
and `page` from the query string, calls `apiGetAuthed()`, and renders
`RepositoryReviewsView`.

- Header: back link to `/repositories`, the repository's full name, the
  review-mode badge, a link to GitHub and a link to settings.
- Tabs: "Pull requests (n)" and "Commits (n)". They are links that set
  `?kind=`, so the tab is in the URL. The active tab is the response's `kind`,
  so with no `kind` in the URL the API's default applies, which matches the
  dashboard's rule.
- Rows: the dashboard table's columns. Title, `#number` or short SHA, author,
  status, score, relative time. Each row links to `row.url`.
- Pagination: previous and next links that set `?page=`, shown only when
  there is more than one page.
- Empty state: when the repository has no reviews of the selected kind, a
  line saying so and what triggers one (open a pull request, or push to a
  watched branch).
- Refresh: while any visible row is `pending` or `analyzing`, the view calls
  `router.refresh()` every 8 seconds, as the dashboard does.

The row markup is extracted from `DashboardView` into a shared
`ReviewFeedTable` component used by both views, rather than copied.

## Error handling

- Unknown or foreign repository id: not-found page.
- Malformed id (`/repositories/abc`): not-found page, not a 500.
- `page` past the end: an empty list with the pagination still showing
  "previous".
- Junk in the query string (`?kind=x`, `?page=-1`): the page forwards `kind`
  only when it is `prs` or `commits` and `page` only when it is a positive
  integer, so a hand-edited URL falls back to the defaults instead of
  surfacing the API's 422 as an error page.
- Signed out: redirect to `/login`, via `apiGetAuthed()`.

## Testing

API (`repositories.service.spec.ts`, plus a mapper spec):

- returns only rows for the requested repository;
- refuses a repository owned by another user, and a missing one;
- orders newest first with the id tie-break;
- pages at 25, and reports both totals regardless of `kind`;
- with `kind` omitted, returns commits only when there are no pull requests
  and there are commits;
- the shared mapper produces the same rows the dashboard produced before the
  extraction.

Web (vitest):

- `RepositoryReviewsView` renders rows that link to `row.url`;
- the empty state renders for a repository with no reviews;
- the active tab follows the response's `kind`;
- a connected card exposes the "View reviews" link and an unconnected card
  does not.

Gates before commit: `typecheck`, `lint` and `test` in both packages.
