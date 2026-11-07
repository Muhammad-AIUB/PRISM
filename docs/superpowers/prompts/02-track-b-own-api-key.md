# Session prompt: Track B, bring your own API key

You are a senior engineer on PRism (AI code reviewer for GitHub). You start with no memory of earlier conversation. Everything you need is in the repo.

## Read first, in this order
1. `E:\prism\CLAUDE.md` (follow it exactly; no CI, so you are the gate; never load the root `.env`).
2. `docs/superpowers/plans/2026-11-07-track-b-own-api-key.md`: **the plan you execute.** 8 tasks, exact code and tests.
3. `docs/adr/0007-groq-is-the-only-ai-provider.md`, `docs/adr/0010-lead-with-a-verdict-and-keep-the-score.md`: so you know what you are superseding and what must not change.
4. Context only: `docs/superpowers/plans/2026-11-07-google-review-roadmap.md` (Track B section).

## Your job
Execute the Track B plan end to end with TDD, task by task, using `superpowers:subagent-driven-development` (recommended; this plan has independent-enough tasks) or `superpowers:executing-plans`. Follow its commit steps.

## Git
- Phase 0a lives on branch `phase0a-honest-coverage` (check `git branch` and `git log`; its status is in `docs/superpowers/PROGRESS.md`). Create branch `track-b-own-api-key` **from that branch** (both touch the runners, so build on 0a, do not diverge from it). If 0a was already merged to `main`, branch from `main`.
- Stage by name only. Never commit `.env`, `dist/`, `.next/`, `node_modules/`.
- Commit messages: imperative subject, body says why, end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Do NOT push, merge or open a PR.

## Hard rules
- The Groq path is measured behaviour. Task 2 is a pure refactor: the existing specs in `src/ai` and `src/modules/review/` must pass **unedited** (the only permitted spec edit in this plan is the constructor change in Task 5). If you must edit a pre-existing assertion elsewhere, the refactor changed behaviour: revert and investigate.
- Golden fixtures in `prism-api/test/fixtures/` stay frozen. No prompt changes.
- The user's API key must never appear in a log, an error message, an API response (only the 4-character hint), an audit entry, or a test snapshot. Grep for it at the end.
- DDL is hand-applied: add it to `prism-api/schema.sql`, apply it to **local** Postgres only (127.0.0.1), never to anything pointed at the root `.env`. `synchronize` stays false.
- Do not add provider base-URL input fields; URLs are constants.
- If the plan and the code disagree, trust the code, take the smallest adjustment, record it. Do not add features outside the plan (see its "Out of scope").
- Task 4 Step 5 and Task 8 Step 3 need real provider keys or a running stack. If you do not have a key, do NOT fake the result: mark the step "not verified" in your report and in `PROGRESS.md`.

## Verification
Narrow tests per task, as the plan says; typecheck while editing; one full `npm run typecheck && npm run lint && npm test` in `prism-api/` and `prism-web/` before the final commit. Start Docker/API only once, at Task 8, because this touches modules and DI wiring.

## Done means
- Plan checkboxes ticked in the plan file; ADR 0012 written; docs updated in the same commits.
- Gates green with real output quoted, or each red named.
- `docs/superpowers/PROGRESS.md`: Track B row set to its real status plus a 3 to 6 line note (commits, plan deviations and why, what is not verified, e.g. live provider calls).
- Final message: branch, commit list, gate results from real output, deviations, unverified items.
