# 0010. Lead with a verdict, and keep the score

Status: Accepted
Date: 2026-09-14 (`4ed897e`), amended 2026-09-24 (`3d04565`)

## Context

The first thing a reviewer saw was `overall_score`, a number out of 100. It is unstable across re-runs,
unverifiable against anything, and answers a question nobody asked. The question people actually have is
"is there anything here that should stop me merging?"

But the score cannot simply be removed: `mcp-server/index.js` reads `overall_score` in both detail and list
responses, and `/api/v1` is additive-only ([ADR 0001](0001-keep-the-stored-formats.md)).

For a verdict to be an improvement and not a rename, "blocking" has to mean something a person can confirm.
The model's own `severity: critical` is free text sampled at temperature 0.2, and a model will call
anything critical.

## Decision

- Four verdicts: `blocking`, `worth_a_look`, `nothing_found` and `not_reviewed`.
- **`blocking` requires a category a reader can check against the diff in seconds**: `auth_weakened` (a
  check was removed or weakened), `contract_changed` (a response field, error string or status code changed
  shape) or `no_timeout` (a new outbound call has no timeout). Other categories inform but never gate.
- **The verdict is derived on read, never stored**, from the validated findings and the summary
  (`ai/verdict.ts`).
- **`not_reviewed` is not a softer "nothing found".** It means no model produced a review, so nothing was
  checked. Showing that as a green all-clear would be the most misleading thing the product could say. The
  two fixed fallback summaries are shared constants, and `isIncompleteReview()` recognises them.
- **The score is kept and reconciled**, never removed: capped at 60 when blocking, raised to at least 80
  when nothing was found, and left `null` when no model answered.
- The system prompt tells the model **not** to report anything a linter catches, and orders what to look
  hardest for. A reviewer with twenty years of practice spends their attention once.

## Consequences

- The fallback summary strings are a contract between the runners and the verdict. Rewording one without
  the other turns a review that checked nothing into a green "nothing found".
- A verdict cannot be filtered or sorted in SQL, because it is not a column.
- The score and the verdict can still disagree in the model's own summary text, which is not reconciled.
- One path still violates the `not_reviewed` rule: a model answer that is valid JSON with none of the
  expected keys is treated as a clean review ([T1](../known-issues.md#t1)).

## Alternatives considered

- **Drop the score.** Rejected: breaks deployed MCP servers.
- **Treat the model's `critical` severity as blocking.** Rejected: not checkable.
- **Store the verdict.** Rejected: would need DDL, and it would go stale when the rules change.
