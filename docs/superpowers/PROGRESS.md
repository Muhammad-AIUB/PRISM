# Progress tracker

Owner direction (2026-11-07): one fresh session per plan, never all in one context. Sonnet by default, Opus only for genuinely complex work, never Fable. Writers run one at a time on shared files. Sessions commit to a branch; nothing is pushed or merged without the owner.

| # | Work | Plan | Prompt | Model | Branch | Status |
|---|---|---|---|---|---|---|
| 1 | Phase 0a: honest coverage label | [plan](plans/2026-11-07-phase0-honest-coverage.md) | [prompt](prompts/01-phase0a-honest-coverage.md) | Sonnet | `phase0a-honest-coverage` | Done on branch, not merged; browser check not done |
| 2 | Phase 0b spike: measure batching | to write | to write | Sonnet | | Waits for 1 |
| 3 | Track B: own API key | [plan](plans/2026-11-07-track-b-own-api-key.md) | [prompt](prompts/02-track-b-own-api-key.md) | Opus (many files, DI, security) | `track-b-own-api-key` | Waits for 1 |
| 4 | Phase 0b: batched full review | after spike | | | | Blocked on 2 |
| 5 | Phase 1 and later | roadmap only | | | | Not planned yet |

## Notes by session
(Each session appends here: commits, deviations from the plan, what it did not verify.)

**Phase 0a** (commits 2e0d282, 3473be9, 8422c7b, b166bbf on `phase0a-honest-coverage`, plus 0e8a6fd for the plans). Deviations: the plan's builder test spread a base review that has a blocking finding, so I cleared its findings (plus a second test that blocking still wins); verdict test used category `style`, not a valid category, so `other`; the old whole-Selection `toEqual` needed `noise: []`; no commit-review runner spec exists, so only the PR runner has the coverage test. `known-issues.md` had no entry to remove. Task 2's new test was not seen failing first (implementation was trivial); the runner test was seen red against the unwired runner. Not verified: the Task 5 browser check at 390px (stack not started), no live review against real Groq. Gates: api typecheck+lint+539 tests, web typecheck+lint+77 tests, all green (web on Node 25.2.1).
