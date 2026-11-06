# 0006. Show the model anchors and validate every finding against the diff

Status: Accepted
Date: 2026-09-14 (`4ed897e`)

## Context

A review used to cut the diff at byte 8,000, hand the model a raw fragment, and store whatever
locations came back. Nothing checked that a reported file was in the diff or that a reported line was one
that changed, and the UI displayed those numbers prominently. A developer who opens the named line, finds
nothing wrong, and closes the tab does not come back. **One wrong line costs more trust than ten correct
findings earn**, and nothing in the pipeline could tell the difference.

Two further problems made locations unverifiable: per-file line numbers are ambiguous (an in-place edit
puts the same integer on both the removed and the added side), and a fabricated number stays inside the
named file where it looks like a true one.

## Decision

- Parse the diff into both sides (`diff/hunk-index.ts`). Show the model an **opaque anchor** per changed
  line, numbered across the whole review (`diff/render.ts`). Validate what it returns against the anchors
  that were rendered (`ai/issue-validator.ts`). **The location displayed is the anchor's, never the
  model's.** A finding whose named file disagrees with its anchor is dropped; with per-file numbers that
  check is impossible, and it fired on the first real diff it saw.
- The model still returns a plain integer in the frozen schema's `line` field, so the scheme costs zero
  fixture entries. The instruction for which integer travels in the **user** message
  (`diff/prepare.ts`), which is not fixture-frozen.
- Select **whole files, then whole hunks, then a line boundary**, so a file larger than the budget is
  reviewed in part instead of dropped (`diff/file-selection.ts`). Measured on `microsoft/TypeScript#64245`,
  which lost a file at every budget under whole-file selection.
- Detect languages from the **whole** diff, not the truncated slice.
- Validate suggested fixes against the code they quote (`ai/fix-validator.ts`), so the weakest surface does
  not set the trust level for the verified findings beside it.
- Anchors were chosen over two-gutter line numbers on prompt overhead as reported by the dry-run harness
  (about +1.6% against +10.3% at 8,000 characters). Which scheme a 70B model follows better is an accuracy
  question that has not been measured ([known-issues.md](../known-issues.md#review-quality-needs-keys)).

## Consequences

- Dropping a real finding is the failure this prefers. A missing comment costs a bug; a confident wrong one
  costs the reader's belief in every other comment.
- The review states how much of the change it covered ("Reviewed 7 of 14 changed files...") and how many
  reported issues could not be traced.
- Findings carry `side` and `category` fields that rows written before 2026-09-14 lack, so every field is
  optional in the entity type.
- The anchor scheme is unfamiliar to the model, so its quality depends on the instruction block staying
  intact.

## Alternatives considered

- **Trust the model's line numbers.** The status quo; rejected for the reasons above.
- **Two-gutter real line numbers.** Familiar to a model but ambiguous to us; kept in the code
  (`renderWithLineNumbers`) only for the measurement harness.
- **Review the whole diff.** Rejected: Groq's free-tier limits and parse rate.
