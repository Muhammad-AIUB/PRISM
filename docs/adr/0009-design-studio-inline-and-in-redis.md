# 0009. Run Design Studio inline and store blueprints in Redis

Status: Accepted
Date: 2026-09-24 (`1fd0ca1`)

## Context

Design Studio turns a brief into a system design with a Groq call that typically takes 10 to 30 seconds
and is bounded at 55.
Two forces conflicted with how the rest of the system works:

- The review queue runs at concurrency 1 to stay inside 512 MB. A design behind three reviews would wait
  minutes while a person watches a form.
- Storing a blueprint in Postgres means a new table: hand-applied DDL against a production schema whose
  history this codebase does not own, with no agreed process ([ADR 0001](0001-keep-the-stored-formats.md)).

## Decision

- **Inline.** A design is generated on its HTTP request, bounded by `AbortSignal.timeout(55 s)`, which
  *cancels* the Groq fetch rather than abandoning it, and by a per-user limit of 10 per clock hour checked
  in Redis **before** the model is called.
- **A service-level limit, not `@Throttle`.** It must be per user on both the web and the API-token routes
  (the global guard keys token callers by IP), it must survive restarts, and it must **fail closed**: an
  unreadable counter is a 503, not permission. Every `MULTI/EXEC` result is checked per command.
- **Always an answer.** Rate limiting, the budget firing, no model answering and unusable output all
  degrade to the deterministic `baselineBlueprint()` for the brief's scale, labelled as a baseline with a
  `notice`. The readiness checklist is never generated; it is a pure function of scale and priorities.
- **Redis, 30 days.** Blueprints are `design:{uuid}` with the owner stored *beside* the payload. A missing,
  expired, malformed or foreign id returns one identical 404. The durable copy of a design is the Markdown
  the user commits to their repository, and the UI says so.
- **Erasable.** The save is an atomic script that refuses while the owner's erasure marker exists, and
  account deletion purges every design key.

## Consequences

- No DDL, no schema coupling, and the stored shape is already the row if blueprints ever need to outlive 30
  days.
- Redis data is not durable the way Postgres is; a Redis loss loses designs (not reviews).
- A design request holds an HTTP connection and a Groq call for up to 55 seconds on the same process as the
  worker. The hourly limit is what bounds the cost.
- The prompt has no frozen fixtures to protect it, so changes to it must be justified by reading output.
  No live model output has been read by a person yet ([known-issues.md](../known-issues.md#review-quality-needs-keys)).

## Alternatives considered

- **Put designs on the review queue.** Rejected for the wait.
- **A `designs` table.** Rejected until the production-DDL process exists.
- **`@Throttle`.** Rejected for the three reasons above.
