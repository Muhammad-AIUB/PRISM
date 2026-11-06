# 0003. Derive the job budget from its parts, and make the deadline cancel

Status: Accepted
Date: 2026-09-13 (`a5a0d68`)

## Context

Two defects, which had to be fixed together because fixing either alone made the other worse.

**The budget was too small.** The PHP job had `$timeout = 120`, and the port copied the number without
checking it. One attempt can spend 60 s on each of two models in the review pass, the same again in the
fixes pass, and a GitHub round trip either side: roughly 240 s of worst case against a 120 s ceiling.
Whenever the models failed by *hanging* instead of answering badly, the job died mid-pipeline instead
of saving the raw text, burned all three attempts and landed on `failed`. The documented graceful
degradation was unreachable.

**The deadline did not stop anything.** The first version raced the work against a timer with
`Promise.race`, which resolves but does not cancel. The timed-out runner carried on, wrote its rows and
posted its GitHub comment while the retry ran the same pipeline: two comments on one PR, and
`markFailed` racing the detached attempt's own `status: 'completed'`. Raising the budget without real
cancellation would have been worse still.

## Decision

1. **Derive the budget.** `review.queue.ts` imports `GROQ_TIMEOUT_MS`, `GROQ_MODELS` and the GitHub
   timeout and computes `GROQ_TIMEOUT_MS x (models + 1) + GITHUB_TIMEOUT_MS x 2 + 30 s` = 270 s. Add a
   model or raise a timeout and the budget follows.
2. **Cancel, don't wait.** `ReviewProcessor` creates an `AbortController` per attempt and aborts it at
   the budget. The signal reaches every `fetch` (combined with that call's own timeout through
   `AbortSignal.any`), and the runners call `signal.throwIfAborted()` before each side effect: before
   persisting results and before posting the GitHub comment.
3. **Split run from cleanup.** Runners let exceptions propagate so BullMQ retries; terminal cleanup
   (`status = 'failed'`) lives in the processor's `failed` handler, once the attempts are spent.

## Consequences

- A genuinely slow review can now be cancelled at 270 s where it would previously have limped to
  completion through the leak. The retries give it more chances.
- Every new side effect in a runner needs a `throwIfAborted()` before it, and must be safe to repeat.
  A swallowed error in code that carries the signal must re-check it, as `postComment` does.
- The graceful-degradation path ("no model produced usable JSON, save the raw text") is reachable
  again.

## Alternatives considered

- **A larger constant.** Rejected: the bug was two independently maintained numbers drifting apart; a
  constant reintroduces it at the next model change.
- **Keep `Promise.race` and make the runner idempotent.** Rejected: GitHub keeps every comment we post,
  so repeating that step is not harmless.
