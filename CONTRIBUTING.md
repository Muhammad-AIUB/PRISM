# Contributing to PRism

Thanks for your interest in contributing to PRism! 🎉

## Layout

PRism is two deployable packages plus an MCP server:

| Path | What it is |
|---|---|
| `prism-api/` | NestJS — REST API, GitHub webhook, and the BullMQ review worker |
| `prism-web/` | Next.js — the frontend |
| `mcp-server/` | MCP server for AI assistants, talks to `/api/v1` |

## Getting Started

You need Node 20+, a PostgreSQL database and a Redis instance.

1. Fork the repository and clone your fork
2. Create the schema on an empty database:
   `psql "$DB_URL" -f prism-api/schema.sql`
3. Start the API:
   `cd prism-api && npm install && npm run build && npm run start:prod`
   — copy `.env.example` to `.env` first and fill it in
4. Start the frontend:
   `cd prism-web && npm install && npm run dev`

`prism-api/LOCAL-VERIFICATION.md` walks through a full local stack with
Docker, including what to assert once it is up.

**Redis must have `maxmemory-policy noeviction`.** BullMQ requires it; under an
eviction policy queued review jobs can be dropped silently and reviews simply
never run.

## How to Contribute

- 🐛 **Bug reports** — open an issue with reproduction steps
- 💡 **Feature requests** — open an issue with use case
- 🔧 **Pull requests** — fork, branch, commit, push, open PR

## Code Style

- TypeScript, strict mode. `npm run typecheck` must pass in both packages.
- `npm test` in `prism-api` must pass.
- Write meaningful commit messages (conventional commits encouraged)

### A note on the golden fixtures

`prism-api/test/fixtures/` holds prompts and encrypted payloads captured from
the Laravel application this was ported from. The tests assert against them
byte-for-byte, and they cannot be regenerated — the PHP is gone.

That is deliberate. They record the behaviour the port promised to preserve, so
changing a prompt has to break a test on purpose rather than drift past it. If
you do intend to change one, update the fixture in the same commit and say why.

## Reporting Security Issues

Please don't open public issues for security vulnerabilities.
Email the maintainer directly.

## Code of Conduct

Be respectful, inclusive, and constructive. We welcome contributors
of all backgrounds.
