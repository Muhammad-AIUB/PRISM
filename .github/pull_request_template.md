## What and why

<!-- What does this change, and why? The reasoning matters more than the diff. -->

## How it was verified

<!-- Tick what applies; say what you did not verify. -->

- [ ] `npm run typecheck`, `npm run lint` and `npm test` pass in every package I touched
- [ ] I booted the API against Postgres and Redis (needed for modules, entities, config, pipeline)
- [ ] UI: checked in both themes, at 390 px, with the console open and with the keyboard
- [ ] A test fails without this change (bug fixes) / new behaviour is covered

## Risk check

- [ ] No change to a stored format, error body, or `/api/v1` field (or it is additive and noted)
- [ ] No change to the prompt, models or diff budget (or fixtures are regenerated and the reason is in the commit)
- [ ] If a runner changed, the other runner changed too (or why not)
- [ ] New side effects check `signal.throwIfAborted()` and are safe to repeat
- [ ] Nothing here reads or points at the repository-root `.env`

## Docs

- [ ] I updated the docs that describe this ([which owns what](../docs/README.md#which-document-owns-which-fact))
- [ ] If this fixes an item in `docs/known-issues.md`, I removed it
- [ ] If this is a surprising or hard-to-reverse choice, I added an ADR
