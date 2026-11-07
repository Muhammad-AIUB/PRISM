# Contributing to PRism

Thank you for helping. PRism is a small codebase with a few rules that are easy to break and
expensive to repair, so this page is mostly about those. For the system itself, read
[docs/architecture.md](docs/architecture.md); for the rule list agents follow, see
[CLAUDE.md](CLAUDE.md).

## Set up

Follow [docs/development.md](docs/development.md). You need Node 22.12 or newer, Docker, and
(for the real sign-in flow) a GitHub OAuth app. Install each package separately:

```bash
cd prism-api && npm ci
cd ../prism-web && npm ci
```

Never run anything with the repository root's `.env` loaded: it holds production credentials.
Run the API from `prism-api/`, and check that connection strings say `127.0.0.1`.

## The workflow

1. **Branch** from `main`. Do not commit to `main` directly.
2. **Make one logical change.** Several small pull requests beat one large one.
3. **Write the test first** for a bug fix and watch it fail for the right reason. New behaviour
   needs tests that would fail without it.
4. **Run the gates** in every package you touched, from inside that package:

   ```bash
   npm run typecheck && npm run lint && npm test
   ```

   Lint runs with `--max-warnings 0`. **There is no CI** (the workflows were removed on
   2026-11-06), so nothing else will catch a failure: you are the gate. Also run `npm audit --omit=dev --audit-level=high` when
   dependencies change.
5. **Boot it** if you touched modules, entities, configuration or the pipeline. Unit tests cannot
   catch a broken dependency-injection graph or an environment variable that fails validation
   ([docs/testing.md](docs/testing.md)).
6. **Check the UI** in a browser if you touched it: both themes, 390 px wide, console open, keyboard
   only ([docs/frontend.md](docs/frontend.md#verifying-a-ui-change)).
7. **Update the docs** that describe what you changed, in the same pull request
   ([which document owns what](docs/README.md#which-document-owns-which-fact)). Fix a defect from
   [docs/known-issues.md](docs/known-issues.md)? Remove it from there.
8. **Open a pull request** using the template. Say what changed and why, and what you did and did
   not verify.

## Commits

One logical change per commit, written in the imperative, with a body that explains **why**:

```text
Give a review attempt a budget it fits in, and make the deadline cancel

Two defects that had to be fixed together, because fixing either alone makes
the other worse. The budget was too small: ...
```

The subject says what the change does; the body gives the reason, the evidence and what you
rejected. `git log` is the best style guide. Do not commit `.env` files, build output
(`dist/`, `.next/`), or anything under `node_modules/`.

## Code rules that matter

**prism-api**

- TypeScript is strict with `noUncheckedIndexedAccess`. `esModuleInterop` is off: CommonJS packages
  use `import x = require('x')`.
- `no-floating-promises` and `no-misused-promises` are errors. Await it, or handle the rejection. A
  lint disable needs its reason on the same line.
- Log with Nest's `Logger`, never `console.*`, or the line loses its request or job id.
- Runners let exceptions propagate (BullMQ retries); cleanup lives in the processor's `failed` handler.
  Put `signal.throwIfAborted()` before any side effect a runner adds, and make it safe to repeat.
- Notifications must never fail a review.
- Keep `diff/` and the validators pure: no Nest, no I/O.
- Treat webhook payload fields and model output as untrusted input.
- Never use `Date#toISOString()` in a response. Use `common/utils/iso8601.ts`.
- Never add a field to or remove one from an `/api/v1` response that clients read without thinking
  about compatibility: it is additive-only.

**prism-web**

- All data comes from the server through `lib/api.ts`. No `fetch` in a component, no `NEXT_PUBLIC_`
  variables.
- Follow the standards in [docs/frontend.md](docs/frontend.md#standards): 12 px minimum text,
  4.5:1 contrast in both themes, tokens not hex, visible focus, `sr-only sm:not-sr-only` for labels
  hidden on mobile, and a visible failure state for every Server Action.
- Inline scripts need the CSP nonce; new third-party origins need a deliberate CSP change.

**Stored data**

- No schema change without the discussion in [docs/database.md](docs/database.md#changing-the-schema).
  `synchronize` stays `false`.
- Anything holding a user's data in Redis writes through the erasure-marker script and is purged on
  account deletion.

## Things that need extra care

| You are changing | Because |
|---|---|
| The system prompt, models, temperature, or a diff budget | They are measured behaviour, and the prompts are frozen by fixtures. See [Changing a prompt on purpose](docs/testing.md#changing-a-prompt-on-purpose) |
| `github_token` encryption or the API token format | Production rows and deployed MCP configs depend on the exact bytes |
| An error body (`Unauthenticated.`, `Too Many Attempts.`, a 404 message) | Clients match on them |
| The fallback summaries in `ai/verdict.ts` | They are a contract between the runners and the verdict |
| One runner | The other almost always needs the same change |
| `SESSION_COOKIE_NAME`, the rewrites, the hostname | Sign-in will appear to work and every later request will be anonymous |

## Decisions

If you are making a choice that is surprising, constrained by production data, or hard to reverse,
write an ADR in [docs/adr/](docs/adr/README.md) in the same pull request.

## Reporting bugs and ideas

Open an issue with what you did, what you expected, what happened, and the `X-Request-Id` from the
response if you have one ([docs/operations.md](docs/operations.md#following-one-request)). **Do not
report security problems in a public issue**; see [SECURITY.md](SECURITY.md).

## License

By contributing you agree that your contribution is licensed under the [MIT License](LICENSE).
