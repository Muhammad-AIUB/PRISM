# PRism MCP Server

Bring your [PRism](https://github.com/Muhammad-AIUB/PRISM) AI code reviews into Claude Code, Claude Desktop, Cursor, Windsurf — any [MCP](https://modelcontextprotocol.io) client.

Ask your AI assistant things like:

> *"What did PRism say about my last push?"*
> *"Apply PRism's suggested fixes to this file."*
> *"Re-analyze commit 42 and show me the new score."*

## Setup

### 1. Get an API token

In PRism: **Settings → API Tokens → Generate token**. Copy it immediately — it's shown only once.

### 2. Add to your MCP client

**Claude Code** (`.mcp.json` in your project, or `claude mcp add`):

```json
{
  "mcpServers": {
    "prism": {
      "command": "npx",
      "args": ["-y", "prism-code-review-mcp"],
      "env": {
        "PRISM_API_TOKEN": "your-token-here",
        "PRISM_URL": "https://your-prism-instance.onrender.com"
      }
    }
  }
}
```

**Claude Desktop** (`claude_desktop_config.json`): same `mcpServers` block.

**Cursor** (`.cursor/mcp.json`): same `mcpServers` block.

Running from a local clone instead of npm:

```json
{
  "mcpServers": {
    "prism": {
      "command": "node",
      "args": ["/path/to/PRISM/mcp-server/index.js"],
      "env": {
        "PRISM_API_TOKEN": "your-token-here",
        "PRISM_URL": "https://your-prism-instance.onrender.com"
      }
    }
  }
}
```

## Tools

| Tool | What it does |
|---|---|
| `get_latest_review` | Most recent review (commit or PR) — score, issues, fixes |
| `list_recent_reviews` | Recent reviews across connected repos (`repo`, `limit` filters) |
| `get_commit_review` | Full review for a commit, with file/line for every issue |
| `get_pr_review` | Full review for a pull request |
| `reanalyze_commit` | Trigger a fresh AI review of a commit |
| `reanalyze_pull_request` | Trigger a fresh AI review of a PR |

## The killer workflow

```
you:    push code
prism:  reviews it automatically (~10s)
you:    "what did prism find?"        ← get_latest_review
claude: "2 issues: missing error handling at page.tsx:103, …"
you:    "fix them"
claude: applies PRism's suggested fixes directly to your files ✨
```

## Env vars

| Var | Required | Description |
|---|---|---|
| `PRISM_API_TOKEN` | ✅ | From PRism Settings → API Tokens |
| `PRISM_URL` | — | Your PRism base URL (defaults to production) |

## License

MIT
