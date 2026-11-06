# 0001. Keep the stored formats of the application PRism replaced

Status: Accepted
Date: 2026-09-01 (the PHP application was deleted in `6ef7ac2`)

## Context

PRism began as a PHP application. Between 2026-08-30 and 2026-09-01 it was ported to NestJS and
Next.js as a strangler: both stacks ran against **one** Postgres and **one** Redis, one slice at a
time, with no data copy and no cutover weekend. The PHP application is gone, but the data it wrote
is not:

- `users.github_token` rows were encrypted by PHP's encrypter (AES-256-CBC with an HMAC, around a
  PHP-serialised string).
- `personal_access_tokens` rows were issued by Sanctum. Deployed MCP servers hold plaintext tokens
  of the form `{id}|{plaintext}` in their config files.
- The schema was built by the original migrations; there is no other definition of it.
- Timestamps are stored as naive `timestamp` columns in UTC, and the API's clients display
  serialised timestamps verbatim.
- The API's error bodies (`Unauthenticated.`, `Too Many Attempts.`, the `No query results for model
  [...]` 404s) are matched or relayed by clients.

Changing any of these would break something that cannot be fixed from this repository: a user's
stored token becomes unreadable, or a deployed MCP server starts failing with no way to update it.

## Decision

Treat everything that is already on disk, or already in someone's config, as a contract that
outlives the framework.

- `schema.sql` (a `pg_dump` taken from a database the original migrations built, verified by
  applying it to an empty database) is the source of truth. TypeORM runs with `synchronize: false`
  and `migrationsRun: false`, forever.
- `common/utils/crypt.service.ts` is the only reader and writer of `github_token`, in the original
  envelope including the PHP serialisation inside the ciphertext.
- API tokens stay `{id}|{plaintext}` with `sha256(plaintext)` stored; `tokenable_type` stays the
  legacy string.
- Status columns stay `varchar`; entities declare `varchar` with a TypeScript union, never
  `type: 'enum'`.
- `bigint` ids serialise as JSON numbers (`database/transformers.ts`); timestamps go through
  `common/utils/iso8601.ts` (`+00:00`); `database/pg-types.ts` parses naive timestamps as UTC before
  any connection.
- Error envelopes are fixed: 422 `{message, errors}`, 401 `Unauthenticated.`, 429
  `Too Many Attempts.`. `/api/v1` is additive-only.
- The golden fixtures (system prompts, encrypted payloads) are frozen and asserted byte for byte.

## Consequences

- Some code looks odd out of context: PHP serialisation in a TypeScript service, a constant
  `'App\\Models\\User'`, 404 messages naming classes that do not exist. They are the API.
- The schema has gaps a fresh design would not have (no UNIQUE on `reviews.pull_request_id`, missing
  CHECKs, unmapped legacy tables). Fixing them is hand-applied DDL against production with no agreed
  process, so they wait ([known-issues.md](../known-issues.md#integrity-gaps)).
- `APP_KEY` can never be rotated casually: a new key makes every stored token permanently unreadable,
  silently.
- `users.email_notifications` still exists but is unmapped, because the email feature was removed
  (`442826f`) and dropping the column is DDL.
- Features that need new storage use Redis instead of new tables (see
  [ADR 0009](0009-design-studio-inline-and-in-redis.md)).

## Alternatives considered

- **Migrate the data to a clean schema and re-issue tokens.** Rejected: re-issuing tokens means every
  MCP user must reconfigure, and re-encrypting `github_token` needs the old key in the new system
  anyway.
- **Let TypeORM own the schema.** Rejected: reconciliation would drop the CHECK constraints behind the
  original enum columns and rewrite indexes under a running application.
