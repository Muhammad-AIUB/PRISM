# Risk Radar

Risk Radar answers a question the AI review does not: *how carefully should I look at this
change?* A senior reviewer settles that in the first ten seconds of opening a pull request,
from **where the change lands** and not from what it says. Forty lines in a login guard need
more attention than nine hundred lines of docs. A model that reads lines cannot express that
blast radius, so PRism computes it separately.

Code: [`prism-api/src/diff/risk-radar.ts`](../prism-api/src/diff/risk-radar.ts). Decision:
[ADR 0008](adr/0008-deterministic-risk-radar.md).

## What it produces

`assessRisk(diff)` is a pure function from a unified diff to:

- a **score** from 0 to 100 and a **level**: `low` below 25, `medium` from 25, `high` from 50;
- the **signals** that make up the score, heaviest first, each with a label, weight, detail
  and at most 5 files;
- a **"Before merging" checklist** of at most 6 questions, each with the reason it is asked
  and at most 5 files.

The output is phrased as questions on purpose. A path name is evidence of where to look, not
proof that anything is wrong.

## Signals

The score is the sum of the signal weights, capped at 100.

| Signal | Weight | Fires when |
|---|---|---|
| `secret` | 50 | An added line (outside tests) looks like a private-key block, a known token format, or a credential literal. The only signal strong enough to reach `high` alone |
| `auth` | 20 | A non-test source file's path looks like authentication or authorisation |
| `migration` | 20 | A migration file (outside tests) changed |
| `untested` | 20 | No test file changed, and either 20 or more source lines changed or auth code was touched |
| `size` | 10 / 20 / 30 | 150 / 400 / 1,000 or more changed lines outside tests, docs and lockfiles |
| `spread` | 10 / 15 | 15 / 30 or more source files |
| `tests_removed` | 15 | A test file was deleted, or only had lines removed |
| `infra` | 15 | Build, CI or deploy files changed |
| `dependencies` | 10 | Dependency manifests changed |
| `public_api` | 10 | Routes, controllers or schemas changed |
| `config` | 10 | Runtime config changed |

Lockfiles and docs are excluded from size, because a 4,000-line `package-lock.json` is not a
4,000-line change anyone reads. The path patterns (`AUTH_PATH`, `MIGRATION_PATH`,
`INFRA_PATH`, ...) are constants near the top of the file.

## The checklist

Each question is triggered by what the **added lines** do, not by their path. Most content
checks run on added code with comments and string literals stripped, so a word inside a
comment cannot trigger them; the secret, raw-SQL and migration-rollback checks read the raw
lines. When more than six questions apply they are cut by priority, with what cannot be
undone first:

`secret` -> `auth` -> `migration` -> `raw_sql` -> `public_api` -> `timeouts` ->
`error_swallowed` -> `messaging` -> `retries` -> `infra` -> `concurrency` -> `caching` ->
`lockfile` -> `split`

Examples: a network call with no timeout or cancellation within a few lines (`timeouts`); SQL
built by string interpolation (`raw_sql`); a `catch` that discards its error
(`error_swallowed`); a queue publish with no idempotency story (`messaging`); a new migration
with no visible way back (`migration`); a dependency manifest changed without its lockfile
(`lockfile`); a change of 400 or more lines (`split`).

## Where it appears

| Surface | How |
|---|---|
| **GitHub comment** | One line after the summary and a collapsed task list. Omitted entirely when no assessment is supplied, so older comments are byte-identical |
| **Review pages** (PR and commit) | The risk panel below the verdict, loaded after the page renders |
| **API** | `GET /api/v1/pull-requests/:id/risk` and `.../commits/:id/risk` |
| **MCP** | The `get_change_risk` tool |

## Why it is deterministic

The same diff gives the same answer, so every rule has a test. It costs nothing per push, and
it works when Groq is down, so a review whose AI pass degraded still carries a useful signal.
A model pass would add a second source of unverifiable claims next to the first.

## Why it cannot break a review

Both runners call `tryAssessRisk()`, which returns `null` on any exception. A bug in a
pattern costs the comment its risk section; it never costs the user their review or triggers
a BullMQ retry. Keep it that way: **Risk Radar must stay pure** (no model, network or
database) and must never throw out of `tryAssessRisk`.

## Bound to the reviewed revision

A pull request's diff moves with every push, while the page keeps showing the previous review
until the next one completes. Computing risk from the live pull request in that window would
put a risk panel about one push next to a verdict about another.

So the PR runner saves the assessment of the exact diff it reviewed
([`ReviewRiskStore`](../prism-api/src/modules/risk/review-risk.store.ts), Redis, 90 days) and
the pages serve that with `basis: "reviewed"`. Only when none exists (a review older than the
feature, or expired) is the live head assessed, through the runners' diff-cache keys, and the
result is returned as `basis: "current"` with a visible note. A commit's diff is immutable
per SHA, so its risk is always the reviewed revision.

The saved assessment is user data, so it is written through an atomic script that refuses
while the account's erasure marker exists and is purged on account deletion
([database.md](database.md#redis-keyspace)).

## Extending it

1. Add the signal id (and, for a question, the check id) to the unions at the top of the file.
2. Add the pattern as a named constant, and a case to `risk-radar.spec.ts` that proves it
   fires **and** a case that proves it stays quiet on a near miss. False positives are what
   make a reviewer stop reading the panel.
3. Give a new question a place in `CHECK_PRIORITY`.
4. If the weight changes the level of a common change, say so in the pull request.
5. Persisting risk on the review row, so the dashboard could trend it, needs a schema change
   and is not done yet ([known-issues.md](known-issues.md#roadmap)).
