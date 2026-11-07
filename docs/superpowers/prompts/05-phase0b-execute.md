# Session prompt: execute the Phase 0b plan (batched full review)

You are a senior engineer on PRism (AI code reviewer for GitHub). You start with no memory of earlier conversation. Everything you need is in the repo.

## Read first
1. `E:\prism\CLAUDE.md` (binding repo rules; no CI so you are the gate; never load the root `.env`).
2. **`docs/superpowers/plans/2026-11-08-phase0b-batched-review.md`: the plan you execute.** 12 tasks with full code, tests and commands. Read its header, Global Constraints, File Structure and the closing "Owner decisions and open questions" first, then work task by task (read each task when you reach it, not all 3,800 lines up front).
3. Context only: `docs/superpowers/spikes/2026-11-08-batching-spike.md`.

## Your job
Execute the plan end to end with TDD, using `superpowers:subagent-driven-development` (one fresh subagent per task with review between tasks; this plan is large, so do not run it all in one head). Tick the checkboxes in the plan file as steps complete. Follow the plan's commit steps.

## Git
You are in a shared checkout on `phase0b-batching` (the plan is committed there; it sits on 0a, Track B and the spike). Work on this branch. Stage by name only; never `.env`, `dist/`, `.next/`, `node_modules/`. Commit messages: imperative subject, body says why, end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (subagents may use their own model name). **No push, no merge, no PR.**

## Hard rules
- The root-level and VPS `.env` hold production credentials: never read, load, print or point anything at them. Use `127.0.0.1` for all local services.
- System prompt, `GROQ_MODELS` order, temperature and golden fixtures (`prism-api/test/fixtures/`) stay untouched; a red fixture test means stop and find out why.
- Both runners change together (the plan does this in Tasks 7 and 8; keep them parallel).
- If plan and code disagree, trust the code, make the smallest adjustment and record it in your report. If a plan error would change behaviour, stop and report instead of guessing.
- Do not start Docker/the API until Task 11, which is where the plan puts the stack boot (modules/DI/Redis path changed). Start once, reuse, stop.
- **Task 12 (live Groq)** runs only if `GROQ_API_KEY_DEV` is set in the shell. If it is not set: do NOT look for any other key, do NOT touch any `.env`, mark Task 12 "not measured: no development key" in the plan, in `PROGRESS.md` and in your final report, and finish everything else. If it is set: at most 15 live calls, never print the key, stop at a sustained 429.
- Never claim a check passed that you did not run; quote real output.

## Done means
- All tasks complete except possibly Task 12 as above; checkboxes ticked; ADR and docs written in their commits.
- Final gate run once in `prism-api/` and `prism-web/`: `npm run typecheck && npm run lint && npm test`, real output quoted.
- `docs/superpowers/PROGRESS.md` row 4 updated with the true status and a 4 to 8 line note: commits, plan deviations and why, what is not verified (live Groq, browser, worker memory), residual risks.
- Final message: branch, commit list, gate results, deviations, unverified items, and the decisions still waiting for the owner.
