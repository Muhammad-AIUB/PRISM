# PRism MCP server

Bring your [PRism](https://github.com/Muhammad-AIUB/PRISM) code reviews into Claude Code, Claude
Desktop, Cursor, Windsurf, or any [MCP](https://modelcontextprotocol.io) client. It runs on your
machine over stdio and talks to PRism's `/api/v1` with a bearer token.

Ask your assistant things like:

> *"What did PRism say about my last push?"*
> *"Apply PRism's suggested fixes to this file."*
> *"Re-analyze commit 42 and show me the new verdict."*
> *"Design a system for a bakery pre-order service at startup scale."*

## Setup

You need Node 18 or newer.

### 1. Get an API token

In PRism, open **Settings -> API tokens** and generate one. Copy it immediately; it is shown only
once.

### 2. Install the server

The package `prism-code-review-mcp` (version 1.1.1) is **not published to npm yet**, so
`npx -y prism-code-review-mcp` does not work today. Run it from a clone:

```bash
git clone https://github.com/Muhammad-AIUB/PRISM.git
cd PRISM/mcp-server
npm install
```

### 3. Add it to your MCP client

Claude Code (`.mcp.json` in your project), Claude Desktop (`claude_desktop_config.json`) and
Cursor (`.cursor/mcp.json`) all use the same block. Use the absolute path to `index.js`:

```json
{
  "mcpServers": {
    "prism": {
      "command": "node",
      "args": ["/absolute/path/to/PRISM/mcp-server/index.js"],
      "env": {
        "PRISM_API_TOKEN": "<id>|<token>",
        "PRISM_URL": "https://your-prism-api.onrender.com"
      }
    }
  }
}
```

Restart the client. The server prints `PRism MCP server connected -> <url>` to stderr on start.

Once the package is published, the equivalent block will be:

```json
{ "command": "npx", "args": ["-y", "prism-code-review-mcp"] }
```

## Configuration

| Variable | Required | Description |
|---|---|---|
| `PRISM_API_TOKEN` | yes | A token from *Settings -> API tokens*. The process exits with a hint if it is missing |
| `PRISM_URL` | no | The base URL of the PRism **API**. Defaults to the hosted instance, `https://prism-api-wmam.onrender.com` |

Point `PRISM_URL` at the **API** and not the web app. On Render's free tier a request made straight
to a sleeping API wakes it (about 40 seconds), while one proxied through the web app only receives a
429 and wakes nothing. If you self-host, set it to your own API URL.

## Tools

| Tool | Arguments | What it does |
|---|---|---|
| `get_latest_review` | none | The most recent review, commit or pull request: score, findings with file and line, summary, suggested fixes |
| `list_recent_reviews` | `repo?` (`owner/name`), `limit?` (1 to 50, default 10) | Recent reviews across your connected repositories, newest first. Each row carries the id the other tools take |
| `get_commit_review` | `id` | The full review for a commit review id |
| `get_pr_review` | `id` | The full review for a pull-request id |
| `reanalyze_commit` | `id` | Queue a fresh review of a commit. Call `get_commit_review` afterwards |
| `reanalyze_pull_request` | `id` | Queue a fresh review of a pull request. Call `get_pr_review` afterwards |
| `get_change_risk` | `kind` (`pull_request` or `commit`), `id` | Risk Radar: a 0 to 100 blast-radius score plus the questions to answer before merging |
| `design_system` | `product` (20 to 4,000 chars), `scale?`, `priorities?` (up to 4), `constraints?` | Generate a system design as Markdown you can commit. Takes 10 to 30 seconds |
| `get_design` | `id?` | A saved design as Markdown, or, with no id, your recent designs |

The `id` values are PRism's own row ids (the `[pr 42]` or `[commit 17]` in `list_recent_reviews`),
**not** GitHub PR numbers. Re-analysis is asynchronous: the tool returns once the job is queued, and the
new result appears in a few seconds to a minute.

## A typical session

```text
you:     (push code)
prism:   reviews it automatically
you:     "what did PRism find?"          -> get_latest_review
claude:  "2 findings: a removed auth check at routes/export.ts:41 ..."
you:     "fix them"
claude:  applies PRism's suggested fixes to your files
```

## Troubleshooting

| You see | Cause |
|---|---|
| `PRISM_API_TOKEN env var is required` | The `env` block is missing or the client did not pass it through |
| `PRism API 401: {"message":"Unauthenticated."}` | The token is wrong, revoked or expired. Create a new one |
| `PRism API 429: {"message":"Too Many Attempts."}` | More than 100 requests per minute from your address. Wait a minute |
| The first call hangs for about 40 seconds, then works | The free-tier API was asleep and is waking |
| `PRism API 404: No query results for model ...` | That id does not exist. Take it from `list_recent_reviews` |
| `PRism API 403: ... Not your repository` | That id belongs to another user |
| `design_system` returns a design labelled as a baseline | The model was unavailable or rate-limited; the notice says which. Try again later |

## Developing

```bash
cd mcp-server
npm install
node --check index.js                      # the only automated check
PRISM_API_TOKEN=... PRISM_URL=http://127.0.0.1:3999 node index.js   # speaks MCP on stdio
```

The server is one file, `index.js`, with no build step. There is deliberately no lockfile: this is a
published package, so users resolve its ranges fresh, and CI installs it the same way. The API's
`/api/v1` contract is additive-only, so a new server keeps working against an old API and the reverse.

When you change a tool, keep the `design_system` input schema in step with the API's
`DesignBriefDto`, and update the API reference ([docs/api-reference.md](../docs/api-reference.md)) if
the route changed.

**Releasing.** The version appears in two places that must match: `package.json` and
`new McpServer({ name: 'prism-code-review', version: '...' })` in `index.js`. Bump both, then
`npm publish` from this directory (only `index.js` and this README are included).

## License

MIT
