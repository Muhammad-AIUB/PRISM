# 0007. Groq is the only AI provider

Status: Accepted, with a known cost
Date: 2026-09-03 (`bec6ce6`)

## Context

PRism originally chained several free models across two providers, because the free models fail JSON
parsing at different rates and falling through to another provider produced a parseable answer far more
often (`f24ed15`, `9727b21`). The commit that ended this records the request plainly: no OpenRouter
anywhere. It was removed from the client, the config, the environment validation, `render.yaml`,
`.env.example` and the user-facing copy that named it.

## Decision

The only provider is **Groq**, with two models tried in order: `openai/gpt-oss-120b`, then
`openai/gpt-oss-20b`, at temperature 0.2 and with `response_format: {type: 'json_object'}`,
`max_completion_tokens: 8192` and `include_reasoning: false`.
`GROQ_API_KEY` is required at boot, so a missing key fails loudly at start-up rather than failing every
review one at a time.

**Update 2026-11-07.** Groq shut down the original pair, `llama-3.3-70b-versatile` and
`llama-3.1-8b-instant`, on 2026-08-16. In production every call returned 404 `model_not_found` and each
review completed as `not_reviewed`. The list was switched to Groq's named successors (`openai/gpt-oss-120b`
for the first, `openai/gpt-oss-20b` for the second) **without re-measuring parse rates or review quality**:
that measurement is still owed ([known issue](../known-issues.md)). The two extra parameters are there
because these are reasoning models whose default 1024-token ceiling can be spent before the answer.

The model list, its order and the temperature were **measured behaviour**: they must not be reordered or
"modernised" without re-measuring parse rates.

## Consequences

- **Groq's native JSON mode now carries the weight.** It is what keeps unparseable output rare, covering what
  the removed chain used to.
- When both models still fail to return JSON, the review **completes** with a null score and the raw text
  behind a fixed prefix, and reads as `not_reviewed`. It is not a failure and it is not a pass
  ([ADR 0010](0010-lead-with-a-verdict-and-keep-the-score.md)).
- A 429 from every model throws and is retried by BullMQ at +60 s and +180 s. A **daily** limit therefore
  fails a review permanently after about four minutes ([T13](../known-issues.md#t13)). Waiting in the job
  was rejected: the worker runs at concurrency 1 and would block every other review.
- The two models share one free-tier quota, so the fallback does not help when the cause is a daily cap.
- The second AI pass (fixes) reuses the model that succeeded, with no fallback of its own.
- A second provider is deliberately not on the roadmap. If one is ever added, re-measure parse rates for
  the whole chain, revisit the derived job budget (it grows with the model list), and supersede this record.

## Alternatives considered

- **Keep the multi-provider chain.** Better parse rates, rejected by the owner for operational simplicity.
- **Self-hosted models.** Out of reach on a 512 MB free tier.
