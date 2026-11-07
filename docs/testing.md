# Testing

What is tested, how, and the rules that keep the suite fast, offline and trustworthy.

## Strategy

| Package | Runner | What it covers |
|---|---|---|
| `prism-api` | Jest 29 with ts-jest. Specs sit beside the code as `*.spec.ts` | Pure logic with fakes: the AI client, validators, verdict, diff parsing, Risk Radar, both runners, the processor, the queue policy, guards, stores, services, DTO validation. A few specs drive a Nest HTTP app (the repository reviews route, the OAuth throttle) |
| `prism-web` | Vitest 5, jsdom, Testing Library. Tests sit beside the code as `*.test.ts(x)` | `lib/api.ts`, the middleware CSP, time helpers, the reviews query, and several components (`RepoCard`, `RepositoryReviewsView`, `ReviewFeedTable`, `RiskPanel`, `VerdictPanel`, `ThemeSync`) |
| `mcp-server` | `node --check index.js` only | Syntax. There are no behavioural tests |

**Nothing in `npm test` may need Postgres, Redis, the network or a secret.** Unit tests fake
their stores (a Redis stand-in, an in-memory repository). That keeps the suite fast and runnable
anywhere, including a CI job with no services should one return. A test that needs a live service does not belong in `npm test`; verify it by booting the stack
([development.md](development.md#5-prove-the-review-pipeline-is-wired)).

Unit tests cannot catch a broken dependency-injection graph, a misconfigured entity or an
environment variable that fails validation. One of those shipped once (`PORT` arriving as a
string would have killed the service on every Render boot while every test stayed green). So
**boot the API against real Postgres and Redis** before you believe a change that touches
modules, entities or configuration.

## Running tests

```bash
# prism-api
cd prism-api
npm test                              # everything
npm test -- json-extractor            # files whose path contains this
npm test -- -t "clamps the score"     # tests whose name contains this

# prism-web  (Node >= 22.12)
cd prism-web
npm test                              # vitest run
```

`npm run test:e2e` in `prism-api` fails because `test/jest-e2e.json` was never created. That is
known, not a regression.

Gates: before every commit run `npm run typecheck`, `npm run lint` and `npm test` in each
package you touched. There is no CI, so nothing else will. In `prism-api`, `no-floating-promises`
and `no-misused-promises` are lint errors, and lint runs with `--max-warnings 0`.

**Spend checks in order of cost.** Typecheck takes 5 s (api) or 17 s (web); an API test run on one
directory about 50 s against about 110 s for the whole suite; a web test run costs about the same
for one file as for all of them (startup dominates); lint takes 50 to 70 s per package. Typecheck
while editing, run one narrow API test when logic changed, and run web tests, lint and each full
suite once, before committing. The code map has the table of which command matches which change
([code-map.md](code-map.md#tests-run-the-one-that-matches)). Do not boot the stack unless the change
needs it (below).

## What to test when you change something

| Change | Test |
|---|---|
| A runner step | The spec for **both** runners; they are near-parallel |
| A side effect in a runner (comment, write, notify) | That it does not happen after an aborted signal, and that a failure of it cannot fail the review if it is a notification |
| A validator or the verdict | Table-driven cases including the near misses; the dropped-reason counts |
| A Risk Radar rule | One case that fires **and** one near miss that must stay quiet |
| A guard or anything reading the session | Missing, malformed, expired, revoked, and deleted-user cases; that revocation is checked |
| A Redis store holding user data | That it refuses while the erasure marker exists, that every `MULTI/EXEC` result is checked, and that deletion purges it |
| An error response | The exact status and body; clients match on them |
| A DTO | The rejection of unknown keys (`forbidNonWhitelisted`) as well as the happy path |
| A UI view | Its loading, empty, error and success states; and that a rejected action or `ok: false` is shown |

For a bug fix, write the test first and watch it fail for the right reason.

## The golden fixtures are frozen

`prism-api/test/fixtures/` holds two files asserted byte for byte:

- **`system-prompts.json`**: the review system prompt for every language combination, for each of
  the two targets (`commit` and `pull request`).
- **`encrypted-payloads.json`**: `users.github_token` envelopes written by the original
  implementation, with the `APP_KEY` they were encrypted under. `npm test` decrypts every
  payload and checks that a tampered one is rejected with `The MAC is invalid.`

Neither can be regenerated from the original: the generators needed code that is gone. The
encrypted payloads must never change. The prompts change only deliberately.

### Changing a prompt on purpose

A prompt change **must break a test**. That is the point of the fixture. Do it in one commit and
explain why in the message.

1. Edit `prism-api/src/ai/prompt-builder.service.ts`.
2. Regenerate the fixture from the current builder:

   ```bash
   cd prism-api && npx ts-node scripts/regen-fixtures.ts
   ```

   It rewrites every entry and prints two invariant checks: that commit and pull-request
   prompts are symmetric, and that Ruby and Java still have no language rules. Both must say
   `true`.
3. Read the diff of `system-prompts.json` line by line.
4. Update by hand the spec assertions that depend on the prompt's shape, in
   `prompt-builder.service.spec.ts`: the index of the language rule you changed, the test that
   replaces `commit` with `pull request` to prove symmetry (**so no new base-prompt text may
   contain the word "commit"**), and the `buildFixesPrompt` 4,000-character truncation test.
5. Run the full suite.

This is a one-way door. After the first regeneration the fixtures stop being a record of the
deleted implementation and become a snapshot of PRism's own output: a guard against unintended
drift, not proof of parity. Say so in the commit message.

The anchor instructions are deliberately not part of the system prompt. They travel in the
**user** message (`diff/prepare.ts`), so changing how the model is told to cite lines costs no
fixture entries. The Design Studio prompt lives in its own file for the same reason.

## Measuring model behaviour

Unit tests cannot say whether a model follows the prompt. `prism-api/scripts/measure-anchoring.ts`
is a throwaway harness for that question: for real merged pull requests listed in
`scripts/prs.txt` (one `owner/repo#number` per line), how often is a location the model reports
real? It compares ways of showing the diff (`raw`, `lines`, `anchors`) at different budgets.

```bash
cd prism-api
# Free: fetches diffs and reports coverage, makes no model call
npx ts-node scripts/measure-anchoring.ts --prs scripts/prs.txt --budgets 8000,40000 --dry-run

# Costs Groq calls (pass the key inline; never point this at the root .env)
GROQ_API_KEY=gsk_... npx ts-node scripts/measure-anchoring.ts \
  --prs scripts/prs.txt --budgets 8000,40000 --schemes raw,lines,anchors --repeats 2
```

Results are written to `scripts/measure-*.json` (gitignored). The model-accuracy half has not
been run against the current pipeline; the budget, the model list and the prompt should not be
changed without it ([known-issues.md](known-issues.md#roadmap)).

## Verifying the whole system

The checks that unit tests cannot make, worth running before a release that touches the
pipeline, auth or the schema, against the local stack in [development.md](development.md):

- The API boots with every module initialised and every route mapped.
- `GET /health` is 200.
- Webhooks: `ping` returns 200, a bad signature 401, an unknown repository 404, a missing
  repository id 400, a push to an unwatched branch and a closed pull request are ignored with
  their messages, a push and an opened pull request create rows and enqueue jobs.
- The worker picks a job up and sets `analyzing`; the first retry is scheduled 60 seconds out.
- `users.github_token` decrypts on the live path.
- Every authenticated route without a session returns `401 {"message":"Unauthenticated."}`.
- `bigint` ids are numbers in JSON.
- A token created in *Settings* authenticates `GET /api/v1/me`; revoking it makes the next call 401.
- Validation failures are 422 `{message, errors}`.
- Another user's session on someone's review, commit or export returns 403.
- Deleting an account with `confirm: DELETE` cascades the user's rows, leaves other users' rows
  alone, and makes the old session 401 immediately; without the exact confirmation it is a 422
  and nothing is deleted.

## Untested areas

Be honest about these when you change them. In `prism-web`: the dashboard, review and commit
views, the diff viewer, `BranchPicker`, `ModeSelector`, the settings, profile, security and
Design Studio views, every Server Action, the export and Markdown route handlers, and the demo
pages. In `mcp-server`: everything beyond syntax. Add tests when you touch them, and update this
list in the same pull request.
