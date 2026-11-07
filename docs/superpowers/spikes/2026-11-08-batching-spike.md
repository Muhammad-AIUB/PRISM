# Phase 0b spike: can PRism review every file by batching?

Date: 2026-11-08. Branch `spike-phase0b-batching`. Script: [`prism-api/scripts/measure-batching.ts`](../../../prism-api/scripts/measure-batching.ts).
No product code changed. Every figure is labelled **M** (measured by the script on real diffs), **C** (read from code), **D** (from documentation) or **E** (my estimate or arithmetic on the others).

## Question

Today one model call sees about 8,000 characters (`DIFF_LIMIT`). The owner wants every PR and commit reviewed in full. If reviewable files are split into batches, one model call each, how many calls does a real change need, does the job budget hold, and do Groq's free-tier limits allow it?

## Method

- **Sample (M):** 75 public diffs: 64 PRs and 11 commits from 14 repositories (react, TypeScript, nest, next.js, django, rails, vue core, flask, express, angular, prettier, eslint, deno, grafana). 11 PRs were pinned (the set in `scripts/prs.txt`, including `microsoft/TypeScript#64245`); the rest were discovered by taking every third merged PR of the 100 most recent closed PRs per repository, plus one dependency-style title per repository, plus two single-parent commits in six repositories. Diffs came from `github.com/.../*.diff`, unauthenticated, 0 fetch failures. The full list is `sample.json` in the cache directory and the row labels printed by the script. 5 diffs had no reviewable file (all noise: lockfiles, snapshots, generated, for example `angular/angular#71785` with 34 noise files); statistics below use the other **70**.
- **Real code reused:** `selectForReview`, `coverageRatio` (budget 8,000), `parseGitHeader`. The `NOISE` pattern is copied into the script because it is not exported.
- **Prototype packer (pure function in the script):** files in diff order; a file goes into the open batch if it fits, otherwise a new batch opens. A file larger than the budget is cut into pieces of header plus whole hunks; a single hunk larger than the budget is cut at line boundaries (a "giant hunk"; `partialFile` would drop its tail, a full reviewer cannot). Budgets 8,000 / 16,000 / 24,000 characters.
- **Import grouping prototype:** relative TS/JS imports (`from './x'`, `require('./x')`) on **added** lines, resolved against the changed-file set; connected files are made contiguous, then packed by the same greedy packer.
- Rerun: `cd prism-api && npx ts-node scripts/measure-batching.ts --cache <dir> --out <results.json>`. First run needs network; later runs are offline; `--no-fetch` forbids network.

Sample bias, stated plainly: large well-known projects, recent PRs, and 11 pinned PRs chosen earlier because they are large. It is **not** a sample of PRism users' traffic, whose real size distribution is unknown (PRism's own `reviews` table would be the better source and was not read).

## A. Offline results (measured)

Size of the 70 reviewable diffs (M): median 4,638 characters, mean 15,450, p90 51,906, max 119,826. 15 of 70 contain a file larger than 8,000 characters; 4 contain one larger than 16,000.

Today's coverage at 8,000 (M, `coverageRatio`): 45 of 70 fully covered; **17 of 70 (24%) below 50%**, which Phase 0a labels partial with no score; p10 = 0.15.

Batches per review (M):

| Batch budget | p50 | p90 | p99 | max | mean | >1 | >4 | >8 | >16 | total calls (70 diffs) |
|---|---|---|---|---|---|---|---|---|---|---|
| 8,000 | 1 | 9 | 19 | 19 | 2.90 | 25 | 11 | **8 (11%)** | 2 | 203 |
| 16,000 | 1 | 5 | 10 | 10 | 1.84 | 19 | 8 | **2 (3%)** | 0 | 129 |
| 24,000 | 1 | 3 | 7 | 7 | 1.43 | 14 | 2 | **0** | 0 | 100 |

With 70 diffs, p99 is effectively the maximum.

Splitting inside files (M): at 8,000, 15 of 70 diffs need a file split across batches and 7 contain a hunk bigger than the budget; at 16,000 that falls to 4 and 1; at 24,000 to 3 and 0.

Import grouping (M):

| | 8k | 16k | 24k |
|---|---|---|---|
| diffs with at least one relative-import edge between changed files | 4 of 70 | 4 | 4 |
| import edges in those diffs | 36 | 36 | 36 |
| edges split across batches by plain greedy | 31 | 30 | 20 |
| edges still split after grouping | 29 | 29 | 20 |
| diffs whose batch assignment changes | 3 | 2 | 1 |
| change in total calls | 0 | 0 | 0 |

The heuristic is nearly inert here: edges are rare (6% of diffs) and where they exist (next.js #93974 and #93975, 15 to 17 edges, 54k characters) the connected group is larger than any budget, so it cannot be kept together. Python, Go, Ruby, Java and Rust imports are not detected at all, so the true edge rate is higher.

## B. Capacity (code and documentation)

| Fact | Value | Source |
|---|---|---|
| `GROQ_TIMEOUT_MS` | 60,000 per call | C (`providers/http.ts`, printed by the script) |
| `GROQ_MODELS` | `openai/gpt-oss-120b`, `openai/gpt-oss-20b` | C |
| `REVIEW_JOB_TIMEOUT_MS` | 330,000 ms = 60 s x (2 models + 2) + 2 x 30 s GitHub + 30 s | C |
| Attempts / backoff | 3 / 60 s, 180 s, 600 s (the 600 s step is never reached with 3 attempts) | C |
| Worker | concurrency 1, 512 MB | C |
| `max_completion_tokens` | 8,192 | C |
| System prompt | about 2,100 characters plus language rules | M (built with `PromptBuilderService`) |
| Free-tier limits, each gpt-oss model | 30 requests/min, 1,000 requests/day, **8,000 tokens/min**, **200,000 tokens/day** | D (console.groq.com/docs/rate-limits, fetched 2026-11-08; columns RPM, RPD, TPM, TPD) |

**Calls that fit the current budget (E).** The "+2" in the formula is the fixes pass and the user's own-model attempt, so one review's worst case is 4 sequential 60 s calls, all of it consumed by 1 batch. With 90 s reserved for GitHub and margin, 240 s remains: at a realistic 10 to 20 s per call (**assumed, not measured**) that is 12 to 24 calls by wall clock, so the current budget would hold roughly 8 batches plus the fixes pass if nothing hangs, and nothing at all if calls hang.

**What the formula has to become (E).** With M models and N batches, worst case per batch is the own-model attempt plus the chain (M + 1 calls) and the fixes pass runs once:

`REVIEW_JOB_TIMEOUT_MS = GROQ_TIMEOUT_MS x (N x (M + 1) + 1) + 2 x GITHUB_TIMEOUT_MS + 30 s`

| N | worst-case job budget (E) |
|---|---|
| 1 (today) | 330 s |
| 4 | 14.5 min |
| 8 | 26.5 min |
| 16 | 50.5 min |

These are ceilings that hold only if every call hangs. A job that long at concurrency 1 blocks every other review behind it, so the practical design is a budget derived from N (cap N), plus a per-batch deadline instead of one deadline for everything.

**Retry schedule (E).** A BullMQ retry re-runs from batch 1, repeating paid, rate-limited calls: a failure on batch 7 of 8 would cost 14 calls instead of 7. With N batches the retry should resume from persisted per-batch results. Backoff of 60 s suits a per-minute limit, but the token limit below is hit by design, so batching needs in-job pacing rather than relying on retry.

**Free-tier fit (E from D).** Input per call is estimated as batch characters / 3.5 (assumed ratio) plus about 800 tokens of prompt. Output length is unknown.
- Input tokens per review across the 70 diffs: about 6,700 at 8k batches, 5,900 at 16k, 5,600 at 24k. The diff itself dominates, so bigger batches save only the repeated prompt.
- **TPM 8,000 is the binding limit.** An 8,000-character batch is about 3,000 input tokens (about 2 calls a minute); a 24,000-character batch is about 7,700 and alone fills the minute. Whether Groq counts the reserved `max_completion_tokens` (8,192) against TPM was **not verified**; if it does, even one call a minute could be rejected. So a p90 review at 8k (9 calls) needs at least 4 to 5 minutes of pacing, and at 16k (5 calls) about 3 minutes, before output tokens are counted.
- **TPD 200,000:** at about 6,000 input tokens per review, one model supports roughly 30 reviews a day. ADR 0007 says the two models share one quota; the docs table lists a row per model. Unresolved.
- RPM (30) and RPD (1,000) are not the constraint.

Worker memory (512 MB): **not measured on the worker**. The whole 75-diff analysis, ts-node included, peaked at 386 MB RSS, which only shows that processing a 120 KB diff is far from the limit. Batches are slices of a string already in memory, so batching should add little, but that is reasoning, not a measurement.

## C. Live Groq

**Not measured: no development key.** `GROQ_API_KEY_DEV` was not set in the shell. No other key was looked for and the repo-root `.env` was not read. Per-call latency, real token usage, 429 behaviour, whether batch replies stay valid JSON, and whether reserved output tokens count against TPM are therefore all unknown, and the latency and token figures in B are estimates.

## D. Cross-file risk (qualitative; review quality was not measured)

- **vercel/next.js#93974 and #93975** (54k characters, 10 and 11 files, 15 to 17 import edges): `local-span-recorder.ts` imports and re-exports from `span-store.ts`; `tracer.ts`, `tracer.test.ts` and `local-span-recorder.test.ts` import from both; `next-dev-server.ts` registers the recorder. At 8k, 14 to 15 of those edges cross batches. A reviewer shown `tracer.test.ts` without `span-store.ts` cannot tell whether `clearSpanStoreForTest` has that signature.
- **vuejs/core#16158** (11 files, 23k): 3 edges, 1 split at 8k.
- **microsoft/TypeScript#64245 and #64247** (6 and 9 files, 52 to 62k): a source or test change plus generated `.errors.txt`, `.symbols`, `.types` baselines. There are no import edges (baselines are not code), but the baselines only make sense next to the test case; pairing by file-name stem would help here and the import heuristic would not.

Import grouping is cheap, but on this sample it reduced split edges only from 31 to 29 at 8k, because the connected group is larger than a batch. A one-line summary of the other batches in each call (the roadmap's second mitigation) is the only option that works on large groups; it costs a few hundred tokens per call and its value is untested. Neither mitigation was run against a model.

## Recommendation

**Batched full review is feasible in code but not comfortable on the current free tier.** The packer is trivial and the job budget can be derived for N batches. The limit is Groq's documented 8,000 tokens/minute and 200,000 tokens/day per model, which a multi-batch review meets within a minute or two. With 16,000-character batches the median change needs one call, 62 of 70 sampled diffs (89%) need 4 or fewer, and 68 of 70 (97%) need 8 or fewer; at 8,000 characters 11% need more than 8 and the maximum is 19.

Starting point (E): **16,000-character batches, a hard cap of 8 batches, with anything past the cap reported through the Phase 0a partial label** and files dropped in reverse Risk Radar order. It halves the calls compared with 8k, keeps each call near 5,000 input tokens so two fit a minute, and leaves about 3% of this sample on the partial label. A 24,000 budget removes the cap problem in this sample, but one call alone nearly fills the per-minute token allowance, and very large prompts may degrade review quality (not measured).

Job budget: derive it from N with the formula in B, keep N and the batch budget as constants beside it, give each batch its own deadline, persist per-batch results so a retry resumes, pace calls inside the job for the per-minute limit, and let a daily-limit 429 end the review as partial or `not_reviewed` instead of failing it (known issue T13 gets worse with more calls).

What must be built: the packer (with line-level splitting of giant hunks; `partialFile` only truncates), merge and dedupe of findings across batches, anchor ids that stay unique across batches, the batch cap with partial-label fallback, per-batch checkpointing, and the same change in both runners. System prompt and golden fixtures stay frozen; batch context goes in the user message.

Still unknown: real latency and tokens per call (no key); whether reserved output tokens count against TPM; whether the two models share the daily quota; review quality of batched calls and of any cross-batch summary; PRism's real PR size distribution (this sample is biased large); import detection beyond TS/JS.

## Inputs for the Phase 0b implementation plan

1. Batch budget 16,000 characters, cap 8 batches, both configurable; overflow goes through the 0a partial label, in Risk Radar order.
2. The packer must split over-budget hunks at line boundaries: 7 of 70 diffs contain one at 8k, 1 at 16k.
3. Budget formula `GROQ_TIMEOUT_MS x (N x (M + 1) + 1) + 2 x GITHUB_TIMEOUT_MS + 30 s`, derived, never hard-coded; re-check it against `reviewBackoffStrategy` and the concurrency-1 blocking effect.
4. Pace against 8,000 TPM (about two small batches a minute) and handle a daily 429 as a clean end state; measure with a development key first.
5. Idempotent per-batch persistence with resume on retry; `signal.throwIfAborted()` before each side effect.
6. Import grouping is optional (it changed 3 of 70 assignments at 8k); test a short summary of the other batches in a separate quality experiment.
7. Run part C of this spike (at most 15 calls) once `GROQ_API_KEY_DEV` exists, before fixing numbers 1 and 3.
