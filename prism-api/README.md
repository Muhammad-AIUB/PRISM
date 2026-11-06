# prism-api

The PRism backend: a NestJS 11 application that serves the REST API, receives GitHub webhooks,
authenticates browsers and API tokens, **and** runs the BullMQ review worker, all in one process.

For the system as a whole read [docs/architecture.md](../docs/architecture.md). This page is the map
of the package.

## Quick start

```bash
cp .env.example .env     # then fill in the blanks; see docs/configuration.md
npm ci
npm run start:dev        # http://127.0.0.1:3999
```

It needs Postgres 16 (schema from `schema.sql`) and Redis with `maxmemory-policy noeviction`. The
step-by-step guide, including the Docker commands, is [docs/development.md](../docs/development.md).
**Always run it from this directory**: Nest loads `.env` from the working directory, and the repository
root's `.env` holds production credentials.

## Scripts

| Script | Does |
|---|---|
| `npm run start:dev` | Watch mode |
| `npm run build` | `nest build` to `dist/` |
| `npm run start:prod` | `node dist/main.js` (what Render runs) |
| `npm run typecheck` | `tsc --noEmit`. Must pass before a commit |
| `npm run lint` | ESLint with type-aware rules, `--max-warnings 0`. Must pass |
| `npm test` | Jest. Must pass. `npm test -- <path fragment>` or `-- -t "<name>"` to narrow |
| `npm run test:e2e` | Fails: `test/jest-e2e.json` was never created. Known, not a regression |

Engines: Node 20.11 or newer (CI runs 22).

## Layout

```text
src/
  main.ts                 boot order: pg type parsers, TZ=UTC, rawBody, helmet, cookies, validation, filter
  app.module.ts           TypeORM (synchronize: false), BullMQ, throttler, every feature module
  config/                 env validation (fails at boot) and typed config
  database/               entities, bigint transformer, pg type parsers, row mappers
  modules/
    webhook/              POST /webhook/github: HMAC check, row upsert, enqueue
    review/               queue policy, ReviewProcessor, the two runners, the comment builder
    api-v1/reviews/       /api/v1 reviews, risk, re-analyze (API-token auth)
    design/               Design Studio service, store and both controllers
    auth/  dashboard/  demo/  health/  profile/  repositories/
    reviews-web/  risk/  security/  settings/  account/
  ai/                     Groq client, prompt builder, JSON extraction, validators, verdict
  diff/                   pure: hunk index, anchors, file selection, languages, Risk Radar
  design/                 pure: blueprint types, prompt, normaliser, baseline, Markdown
  github/                 GitHub REST client
  cache/  redis/          Redis client and read-through caches
  auth/                   API-token guard and token service
  common/                 exception filter, rate-limit guard, request id and logger, crypto, ISO-8601
  notifications/  audit/  Slack, audit log
schema.sql                the schema; the source of truth. Applied by hand
scripts/                  regen-fixtures.ts, measure-anchoring.ts (a throwaway harness), prs.txt
test/fixtures/            frozen: system prompts and encrypted payloads, asserted byte for byte
```

## Rules that live here

These are the ones that break silently. The full list is in [CLAUDE.md](../CLAUDE.md).

- `synchronize: false`, always. DDL is hand-applied from `schema.sql`.
- `bigint` ids as JSON numbers; timestamps through `common/utils/iso8601.ts`; naive timestamps parsed as
  UTC. `main.ts` registers the parsers before anything connects.
- `rawBody: true` is what makes the webhook HMAC possible.
- Error bodies `Unauthenticated.` and `Too Many Attempts.` are exact; `/api/v1` is additive-only.
- Runners propagate exceptions, check the abort signal before side effects, and must stay near-parallel.
- `diff/risk-radar.ts` stays pure and `tryAssessRisk()` never throws.
- Log with Nest's `Logger`, never `console.*`.

## Documentation

[API reference](../docs/api-reference.md) · [Review pipeline](../docs/review-pipeline.md) ·
[Database](../docs/database.md) · [Configuration](../docs/configuration.md) ·
[Testing](../docs/testing.md) · [Security](../docs/security.md) · [Operations](../docs/operations.md)
