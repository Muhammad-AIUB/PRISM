# Architecture decision records

A short record of each decision that is surprising, constrained by something outside the code,
or expensive to reverse. They exist so the next person (or agent) does not "fix" a deliberate
choice, and so a deliberate choice can be revisited knowing what it cost.

Each record states the context, the decision, what it costs, and what was rejected. Dates and
commit hashes point at the change that made the call; the reasoning in the commit messages is
worth reading alongside.

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-keep-the-stored-formats.md) | Keep the stored formats of the application PRism replaced | Accepted |
| [0002](0002-review-worker-in-the-api-process.md) | Run the review worker inside the API process | Accepted |
| [0003](0003-derive-the-job-budget-and-cancel-on-deadline.md) | Derive the job budget from its parts, and make the deadline cancel | Accepted |
| [0004](0004-server-side-api-access-on-one-hostname.md) | Call the API only from the server, and serve both services on one hostname | Accepted |
| [0005](0005-wake-the-api-from-the-browser.md) | Wake a sleeping API from the visitor's browser | Superseded |
| [0006](0006-validate-findings-against-the-diff.md) | Show the model anchors and validate every finding against the diff | Accepted |
| [0007](0007-groq-is-the-only-ai-provider.md) | Groq is the only AI provider | Accepted, partly superseded by 0012 |
| [0008](0008-deterministic-risk-radar.md) | Compute change risk deterministically, without a model | Accepted |
| [0009](0009-design-studio-inline-and-in-redis.md) | Run Design Studio inline and store blueprints in Redis | Accepted |
| [0010](0010-lead-with-a-verdict-and-keep-the-score.md) | Lead with a verdict, and keep the score | Accepted |
| [0011](0011-partial-review-on-thin-coverage.md) | Partial review on thin coverage | Accepted |
| [0012](0012-optional-user-supplied-api-key.md) | Optional user-supplied API key | Accepted |
| [0013](0013-review-every-file-in-batches.md) | Review every file, in batches of a fixed size with a cap | Accepted |

## Writing a new one

Copy the shape of an existing record into `NNNN-short-title.md` (next number, lower-case,
hyphens) and add a row above, in the same pull request that makes the decision.

```markdown
# NNNN. Title in the form of the decision

Status: Proposed | Accepted | Superseded by [NNNN](NNNN-title.md)
Date: YYYY-MM-DD

## Context
What forces are at play? What goes wrong without a decision? Facts, not opinions.

## Decision
What we do, in the present tense.

## Consequences
What gets easier, what gets harder, what we now have to remember. Be honest about costs.

## Alternatives considered
What else was on the table, and why it lost.
```

Do not edit an accepted record to change its meaning. Write a new one that supersedes it, and
mark the old one. Fixing a typo or a broken link is fine.
