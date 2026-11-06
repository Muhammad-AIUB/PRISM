# PRism documentation

Start with the [project README](../README.md) for what PRism is. This index says where
everything else lives, and which document owns which fact, so a change can update the right one.

## Learn and run it

| Document | Read it to |
|---|---|
| [Code map](code-map.md) | Find the two or three files a change needs, which files not to read, and which test to run. **Start here when changing code** |
| [Development guide](development.md) | Go from a fresh clone to a running stack, prove the review pipeline is wired without a tunnel, and fix the common local problems |
| [Testing](testing.md) | Know what is tested, run the checks, change a prompt on purpose, and measure model behaviour |

## Understand it

| Document | Read it to |
|---|---|
| [Architecture](architecture.md) | See the components, the three decisions that shape everything, and what happens when each dependency fails |
| [Review pipeline](review-pipeline.md) | Follow one review from webhook to GitHub comment, and change the pipeline safely |
| [Risk Radar](risk-radar.md) | Understand the deterministic change-risk score and checklist |
| [Design Studio](design-studio.md) | Understand how system designs are generated, bounded and stored |
| [Frontend](frontend.md) | Navigate `prism-web`, its data access, theming and UI standards |
| [Security](security.md) | See what is stored, what is trusted, and how it is protected |
| [Decision records](adr/README.md) | Learn *why* the non-obvious choices were made, and what each costs |

## Look it up

| Document | Holds |
|---|---|
| [API reference](api-reference.md) | Every route, the error envelopes, rate limits, webhook responses |
| [Configuration](configuration.md) | Every environment variable and fixed limit |
| [Database and stored data](database.md) | Tables, JSON shapes, encodings, the Redis keyspace, deletion |
| [MCP server](../mcp-server/README.md) | Tools and setup for AI editors |

## Operate it

| Document | Read it to |
|---|---|
| [Deployment](deployment.md) | Stand up your own copy on Render, Neon and Upstash, and understand the free-tier limits |
| [Operations runbook](operations.md) | Diagnose a symptom, follow one request through the logs, rotate a secret |
| [Known issues and roadmap](known-issues.md) | See what is broken or unfinished, honestly |

## Contribute

[CONTRIBUTING.md](../CONTRIBUTING.md) covers the workflow and the gates. [SECURITY.md](../SECURITY.md)
covers reporting a vulnerability. [CLAUDE.md](../CLAUDE.md) is the short rule list for coding agents.

## Which document owns which fact

Update the owner in the same pull request as the change. Link to it from elsewhere instead of
repeating it, and never hard-code counts (tests, routes, lines) in prose.

| If you change... | Update |
|---|---|
| A route, a status code, an error body, a rate limit | [api-reference.md](api-reference.md) |
| An environment variable or a fixed limit | [configuration.md](configuration.md), `prism-api/.env.example`, `render.yaml` |
| A table, a column, a JSON shape, a Redis key, an encoding | [database.md](database.md) and `prism-api/schema.sql` |
| A step of the review pipeline, a prompt, a model, a timeout | [review-pipeline.md](review-pipeline.md), and [testing.md](testing.md) if fixtures move |
| A Risk Radar signal or question | [risk-radar.md](risk-radar.md) |
| Design Studio behaviour or storage | [design-studio.md](design-studio.md) |
| Auth, headers, CSP, anything that touches secrets or deletion | [security.md](security.md) |
| A page, a theme token, a UI rule | [frontend.md](frontend.md) |
| Deploy steps, hosting | [deployment.md](deployment.md) |
| A file moved, was added or deleted | [code-map.md](code-map.md) |
| How to diagnose a failure you just diagnosed | [operations.md](operations.md) |
| A bug you found or fixed | [known-issues.md](known-issues.md) |
| A surprising or hard-to-reverse choice | a new [ADR](adr/README.md) |
| An MCP tool | [mcp-server/README.md](../mcp-server/README.md), and the matching API route |
| A rule a coding agent keeps breaking | [CLAUDE.md](../CLAUDE.md) |
