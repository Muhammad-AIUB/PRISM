# Progress tracker

Owner direction (2026-11-07): one fresh session per plan, never all in one context. Sonnet by default, Opus only for genuinely complex work, never Fable. Writers run one at a time on shared files. Sessions commit to a branch; nothing is pushed or merged without the owner.

| # | Work | Plan | Prompt | Model | Branch | Status |
|---|---|---|---|---|---|---|
| 1 | Phase 0a: honest coverage label | [plan](plans/2026-11-07-phase0-honest-coverage.md) | [prompt](prompts/01-phase0a-honest-coverage.md) | Sonnet | `phase0a-honest-coverage` | Done on branch, not merged; browser check not done |
| 2 | Phase 0b spike: measure batching | to write | to write | Sonnet | | Waits for 1 |
| 3 | Track B: own API key | [plan](plans/2026-11-07-track-b-own-api-key.md) | [prompt](prompts/02-track-b-own-api-key.md) | Opus (many files, DI, security) | `track-b-own-api-key` | Done on branch (cut from `phase0a-honest-coverage`), not merged; live provider calls not verified |
| 4 | Phase 0b: batched full review | after spike | | | | Blocked on 2 |
| 5 | Phase 1 and later | roadmap only | | | | Not planned yet |

## Notes by session
(Each session appends here: commits, deviations from the plan, what it did not verify.)

**Phase 0a** (commits 2e0d282, 3473be9, 8422c7b, b166bbf on `phase0a-honest-coverage`, plus 0e8a6fd for the plans). Deviations: the plan's builder test spread a base review that has a blocking finding, so I cleared its findings (plus a second test that blocking still wins); verdict test used category `style`, not a valid category, so `other`; the old whole-Selection `toEqual` needed `noise: []`; no commit-review runner spec exists, so only the PR runner has the coverage test. `known-issues.md` had no entry to remove. Task 2's new test was not seen failing first (implementation was trivial); the runner test was seen red against the unwired runner. Not verified: the Task 5 browser check at 390px (stack not started), no live review against real Groq. Gates: api typecheck+lint+539 tests, web typecheck+lint+77 tests, all green (web on Node 25.2.1).

**Track B** (branch `track-b-own-api-key`, 8 commits after 4fb12ea: ADR 0012, provider interface, key storage, providers, routing, settings API, settings screen, docs). Deviations: `call()` only routes to a user provider when `userId` is given and the label prefix is a selectable provider, so a bare Groq id such as `openai/gpt-oss-120b` without a `groq/` prefix keeps the old Groq path; `apiSend` in the web app gained `PUT`; the new `AiClientService` specs reuse the file's existing `response()` fetch fake instead of `Response`. Tests for Tasks 2 to 4 passed on first run (implementation was written alongside), not seen red first. NOT verified: Task 4 Step 5 (no provider keys, so the four base URLs, Gemini's OpenAI endpoint and the Anthropic header version are untested against the real services) and Task 8 Step 3 (no live review, no browser check of the Settings screen; the DDL was applied to local Postgres and the API booted with the four `/settings/ai` routes mapped and returning 401 unauthenticated, on port 3998 because a stale `dist` API held 3999). Production needs the `user_ai_settings` DDL applied by hand before deploy. Gates: api typecheck+lint+574 tests, web typecheck+lint+83 tests, green.
