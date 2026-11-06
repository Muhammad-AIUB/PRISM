# 0008. Compute change risk deterministically, without a model

Status: Accepted
Date: 2026-09-24 (`7ea0cee`)

## Context

The AI pass says what is wrong with the lines. Nothing said how much a change could break. A senior
reviewer settles "how carefully should I look?" in the first ten seconds from *where* the change lands:
forty lines in a login guard need more attention than nine hundred lines of docs. A model that reads lines
cannot express blast radius, and a second model pass would add a second source of unverifiable claims
beside the first.

## Decision

Risk Radar (`diff/risk-radar.ts`) is a **pure function** from a unified diff to a 0 to 100 score, a level,
named weighted signals, and a checklist of at most six "before merging" questions. No model, no network, no
database. The runners call `tryAssessRisk()`, which returns `null` on any exception.

The output is phrased as questions because a path name is evidence of where to look, not proof of a
problem. For a pull request the runner saves the assessment of the exact diff it reviewed
(`ReviewRiskStore`, Redis, 90 days) and the pages serve that as `basis: "reviewed"`; a live assessment of
the current head is only a fallback and is labelled `basis: "current"`.

## Consequences

- The same diff always gives the same answer, so every rule has a test, and it costs nothing per push.
- It works when Groq is down, so a review whose AI pass degraded still carries a useful signal.
- A bug in a pattern costs a comment its risk section. It cannot fail a review or trigger a retry. This is
  an invariant: Risk Radar must stay pure and `tryAssessRisk` must never throw.
- Heuristics have false positives. Each rule needs a case that fires and a near miss that stays quiet, or
  reviewers stop reading the panel.
- Weights are judgement, not fitted. Calibrating them against outcomes (reverts, incident-linked PRs)
  needs data that does not exist yet.
- The saved assessment is user data in Redis, so it is written through the erasure-marker script and
  purged on account deletion ([database.md](../database.md#redis-keyspace)). It lives in Redis and not on
  the review row because a column is hand-applied DDL; persisting it there remains on the roadmap.

## Alternatives considered

- **Ask the model for a risk score.** Rejected: unstable across runs, unverifiable, and unavailable when
  the AI is.
- **Compute risk live from the current pull request.** The first version did this, and it could put a risk
  panel about a later push beside a verdict about an earlier one. Fixed by binding to the reviewed revision.
