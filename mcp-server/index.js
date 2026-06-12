#!/usr/bin/env node
/**
 * PRism MCP server — exposes your PRism AI code reviews to any MCP client
 * (Claude Code, Claude Desktop, Cursor, Windsurf, …) over stdio.
 *
 * Required env:
 *   PRISM_API_TOKEN  — generate one in PRism → Settings → API Tokens
 * Optional env:
 *   PRISM_URL        — base URL of your PRism instance (default: production)
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const PRISM_URL = (process.env.PRISM_URL || 'https://prism.onrender.com').replace(/\/$/, '');
const TOKEN = process.env.PRISM_API_TOKEN;

if (!TOKEN) {
  console.error('PRISM_API_TOKEN env var is required. Generate one in PRism → Settings → API Tokens.');
  process.exit(1);
}

async function api(path, { method = 'GET' } = {}) {
  const res = await fetch(`${PRISM_URL}/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/json',
    },
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`PRism API ${res.status}: ${body.slice(0, 300)}`);
  }
  return JSON.parse(body);
}

/** Render a review object (commit or PR) as readable text for the model. */
function formatReview(r) {
  const lines = [];
  if (r.type === 'commit') {
    lines.push(`Commit ${r.commit_sha} on ${r.repository} (branch: ${r.branch})`);
    lines.push(`Message: ${r.commit_message ?? '—'}`);
  } else {
    lines.push(`PR #${r.pr_number} on ${r.repository}: ${r.title ?? '—'}`);
  }
  lines.push(`Status: ${r.status} · Score: ${r.overall_score ?? 'N/A'}/100 · Model: ${r.ai_model_used ?? '—'}`);
  if (r.summary) lines.push(`\nSummary: ${r.summary}`);

  for (const [label, key] of [
    ['Security issues', 'security_issues'],
    ['Performance issues', 'performance_issues'],
    ['Code quality issues', 'code_quality_issues'],
  ]) {
    const issues = r[key] ?? [];
    if (!issues.length) continue;
    lines.push(`\n${label} (${issues.length}):`);
    for (const i of issues) {
      lines.push(`  - [${i.severity ?? 'suggestion'}] ${i.file ?? '?'}${i.line ? `:${i.line}` : ''} — ${i.comment ?? ''}`);
    }
  }

  const fixes = r.suggested_fixes ?? [];
  if (fixes.length) {
    lines.push(`\nSuggested fixes (${fixes.length}):`);
    for (const f of fixes) {
      lines.push(`  ## ${f.file ?? '?'}${f.line ? ` line ${f.line}` : ''} (${f.layer ?? 'code_quality'})`);
      lines.push(`  Issue: ${f.original_issue ?? ''}`);
      if (f.problematic_code) lines.push(`  Current code:\n${indent(f.problematic_code, 4)}`);
      if (f.suggested_code) lines.push(`  Suggested code:\n${indent(f.suggested_code, 4)}`);
      if (f.explanation) lines.push(`  Why: ${f.explanation}`);
    }
  }
  return lines.join('\n');
}

const indent = (s, n) => String(s).split('\n').map((l) => ' '.repeat(n) + l).join('\n');

const text = (s) => ({ content: [{ type: 'text', text: s }] });

const server = new McpServer({ name: 'prism-code-review', version: '1.0.0' });

server.tool(
  'get_latest_review',
  'Get the most recent PRism AI code review (commit or pull request) — score, issues with file/line, summary, and suggested fixes. Use this right after pushing code to see what PRism found.',
  {},
  async () => {
    const { review } = await api('/reviews/latest');
    return text(formatReview(review));
  },
);

server.tool(
  'list_recent_reviews',
  'List recent PRism reviews across your connected repositories (commits and PRs, newest first).',
  {
    repo: z.string().optional().describe('Filter by repository full name, e.g. "owner/repo"'),
    limit: z.number().int().min(1).max(50).optional().describe('Max results (default 10)'),
  },
  async ({ repo, limit }) => {
    const params = new URLSearchParams();
    if (repo) params.set('repo', repo);
    if (limit) params.set('limit', String(limit));
    const qs = params.toString() ? `?${params}` : '';
    const { reviews } = await api(`/reviews${qs}`);
    if (!reviews.length) return text('No reviews found.');
    const rows = reviews.map((r) =>
      r.type === 'commit'
        ? `[commit ${r.id}] ${r.repository} ${r.commit_sha} (${r.branch}) — ${r.status}, score ${r.overall_score ?? 'N/A'} — ${r.commit_message ?? ''}`
        : `[pr ${r.id}] ${r.repository} #${r.pr_number} — ${r.status}, score ${r.overall_score ?? 'N/A'} — ${r.title ?? ''}`,
    );
    return text(rows.join('\n'));
  },
);

server.tool(
  'get_commit_review',
  'Get the full PRism review for a specific commit review ID (from list_recent_reviews), including all issues and suggested fixes with exact file paths and line numbers.',
  { id: z.number().int().describe('Commit review ID') },
  async ({ id }) => {
    const { review } = await api(`/commits/${id}`);
    return text(formatReview(review));
  },
);

server.tool(
  'get_pr_review',
  'Get the full PRism review for a specific pull request ID (from list_recent_reviews), including all issues and suggested fixes with exact file paths and line numbers.',
  { id: z.number().int().describe('Pull request ID') },
  async ({ id }) => {
    const { review } = await api(`/pull-requests/${id}`);
    return text(formatReview(review));
  },
);

server.tool(
  'reanalyze_commit',
  'Trigger a fresh PRism AI re-analysis of a commit. Takes ~10-30 seconds; call get_commit_review afterwards for the new result.',
  { id: z.number().int().describe('Commit review ID') },
  async ({ id }) => {
    const res = await api(`/commits/${id}/re-analyze`, { method: 'POST' });
    return text(res.message ?? 'Re-analysis queued');
  },
);

server.tool(
  'reanalyze_pull_request',
  'Trigger a fresh PRism AI re-analysis of a pull request. Takes ~10-30 seconds; call get_pr_review afterwards for the new result.',
  { id: z.number().int().describe('Pull request ID') },
  async ({ id }) => {
    const res = await api(`/pull-requests/${id}/re-analyze`, { method: 'POST' });
    return text(res.message ?? 'Re-analysis queued');
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`PRism MCP server connected → ${PRISM_URL}`);
