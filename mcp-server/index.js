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

const PRISM_URL = (process.env.PRISM_URL || 'https://prism-2o7j.onrender.com').replace(/\/$/, '');
const TOKEN = process.env.PRISM_API_TOKEN;

if (!TOKEN) {
  console.error('PRISM_API_TOKEN env var is required. Generate one in PRism → Settings → API Tokens.');
  process.exit(1);
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${PRISM_URL}/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await res.text();
  if (!res.ok) {
    throw new Error(`PRism API ${res.status}: ${payload.slice(0, 300)}`);
  }
  return JSON.parse(payload);
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

/** Risk Radar as readable text: level, why, and the questions to answer before merging. */
function formatRisk(risk, basis) {
  const lines = [
    `Change risk: ${risk.level.toUpperCase()} (${risk.score}/100)`,
    ...(basis === 'current'
      ? ['(Assessed against the current head; it may include pushes made after the last review.)']
      : []),
    `${risk.stats.files} files, +${risk.stats.additions} −${risk.stats.deletions}, ${risk.stats.testFiles} test files`,
  ];
  if (risk.signals.length) {
    lines.push('\nWhy:');
    for (const s of risk.signals) {
      lines.push(`  - ${s.label} (+${s.weight}): ${s.detail}${s.files.length ? ` [${s.files.join(', ')}]` : ''}`);
    }
  }
  if (risk.checklist.length) {
    lines.push('\nBefore merging:');
    for (const c of risk.checklist) {
      lines.push(`  [ ] ${c.question}${c.files.length ? ` [${c.files.join(', ')}]` : ''}`);
      lines.push(`      ${c.why}`);
    }
  }
  return lines.join('\n');
}

const indent = (s, n) => String(s).split('\n').map((l) => ' '.repeat(n) + l).join('\n');

const text = (s) => ({ content: [{ type: 'text', text: s }] });

const server = new McpServer({ name: 'prism-code-review', version: '1.1.0' });

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

server.tool(
  'get_change_risk',
  'Risk Radar for a reviewed pull request or commit: a deterministic 0-100 blast-radius score (auth, migrations, secrets, missing tests, infra, public API…) plus the reliability questions to answer before merging. Use it to decide how carefully to review, or to self-check your own change.',
  {
    kind: z.enum(['pull_request', 'commit']).describe('Which kind of review the id belongs to'),
    id: z.number().int().describe('Pull request ID or commit review ID (from list_recent_reviews)'),
  },
  async ({ kind, id }) => {
    const { risk, basis } = await api(kind === 'commit' ? `/commits/${id}/risk` : `/pull-requests/${id}/risk`);
    return text(formatRisk(risk, basis));
  },
);

server.tool(
  'design_system',
  'Generate a production system design with PRism Design Studio before writing code: components sized to the stated load, request flow, failure modes with concrete mitigations, reliability patterns, SLOs, a scaling plan with triggers, trade-offs and a production-readiness checklist. Returns a Markdown design doc you can commit (e.g. docs/design/<name>.md). Takes 10-30 seconds.',
  {
    product: z.string().min(20).max(4000).describe('What is being built: users, what they do, what must never go wrong'),
    scale: z.enum(['prototype', 'startup', 'growth', 'enterprise']).optional()
      .describe('prototype <1k users; startup ~10k DAU; growth ~1M DAU; enterprise 10M+ multi-region (default startup)'),
    priorities: z.array(z.enum([
      'high_availability', 'low_latency', 'strong_consistency', 'low_cost',
      'fast_delivery', 'security_compliance', 'offline_first',
    ])).max(4)
      // Mirrors the API's @ArrayUnique, so a repeat fails here with a clear
      // message instead of coming back from the server as a 422.
      .refine((list) => new Set(list).size === list.length, { message: 'priorities must not repeat' })
      .optional().describe('Up to 4 distinct priorities, most important first'),
    constraints: z.string().max(1500).optional().describe('Stack, team size, cloud, budget, regulation'),
  },
  async (brief) => {
    const { design, markdown } = await api('/designs', { method: 'POST', body: brief });
    return text(`Design id: ${design.id}\n\n${markdown}`);
  },
);

server.tool(
  'get_design',
  'Get a previously generated PRism Design Studio design as Markdown. Omit id to list your recent designs.',
  { id: z.string().uuid().optional().describe('Design id (from design_system or the list)') },
  async ({ id }) => {
    if (!id) {
      const { designs } = await api('/designs');
      if (!designs.length) return text('No designs yet. Use design_system to create one.');
      return text(designs.map((d) => `[${d.id}] ${d.title} — ${d.scale}, ${d.created_at}`).join('\n'));
    }
    const { markdown } = await api(`/designs/${id}`);
    return text(markdown);
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`PRism MCP server connected → ${PRISM_URL}`);
