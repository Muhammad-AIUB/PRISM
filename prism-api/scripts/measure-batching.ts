/**
 * THROWAWAY spike harness for Phase 0b ("review every file in batches").
 * Not part of the application, not imported by it, not covered by its tests.
 *
 * Offline part: fetches real public diffs (unauthenticated), runs the REAL
 * `selectForReview` / `coverageRatio` from src/diff, and prototypes a greedy
 * batch packer plus an import-grouping variant (both pure functions, kept here).
 * Capacity part: prints the real timeout constants the job budget derives from.
 * No model call is made and no API key is read.
 *
 * Usage (from prism-api/, Node >= 20.11):
 *
 *   npx ts-node scripts/measure-batching.ts --cache <dir> --out <results.json>
 *
 * `--cache` holds raw diffs and `sample.json` (the discovered list); keep it
 * outside the repo. First run discovers PRs/commits through ~20 unauthenticated
 * GitHub API calls (limit 60/hour) and downloads the `.diff` pages; later runs
 * are fully offline. Add `--no-fetch` to forbid any network access.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { selectForReview, coverageRatio } from '../src/diff/file-selection';
import { parseGitHeader } from '../src/diff/git-paths';
import { GROQ_TIMEOUT_MS } from '../src/ai/ai-client.service';
import { GROQ_MODELS } from '../src/ai/providers/groq.provider';
import {
  REVIEW_JOB_TIMEOUT_MS,
  REVIEW_JOB_ATTEMPTS,
  REVIEW_JOB_BACKOFF_SECONDS,
  REVIEW_WORKER_OPTIONS,
} from '../src/modules/review/review.queue';

const DIFF_LIMIT = 8000;
const BUDGETS = [8000, 16000, 24000];
const FILE_START = /(?=^diff --git )/m;
const HUNK_START = /(?=^@@ )/m;
const NOISE =
  /(^|\/)(dist|build|vendor|node_modules|__snapshots__)\/|(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|composer\.lock|Gemfile\.lock|go\.sum)$|\.min\.(js|css)$|\.(png|jpe?g|gif|ico|svg|pdf|woff2?|ttf|eot|zip|gz|lock)$/i;

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);

  return i !== -1 && process.argv[i + 1] ? (process.argv[i + 1] as string) : fallback;
}

const CACHE = arg('cache', join(__dirname, '.batching-cache'));
const OUT = arg('out', join(CACHE, 'results.json'));
const NO_FETCH = process.argv.includes('--no-fetch');
const LEGACY_CACHE = join(__dirname, '.diff-cache');

interface SampleItem {
  kind: 'pr' | 'commit';
  repo: string;
  ref: string; // PR number or sha
  note?: string;
}

const REPOS = [
  'facebook/react', 'microsoft/TypeScript', 'nestjs/nest', 'vercel/next.js', 'django/django',
  'rails/rails', 'vuejs/core', 'pallets/flask', 'expressjs/express', 'angular/angular',
  'prettier/prettier', 'eslint/eslint', 'denoland/deno', 'grafana/grafana',
];
const COMMIT_REPOS = ['facebook/react', 'vuejs/core', 'nestjs/nest', 'django/django', 'eslint/eslint', 'angular/angular'];
const PINNED: SampleItem[] = [
  { kind: 'pr', repo: 'microsoft/TypeScript', ref: '64245', note: 'named in file-selection.spec.ts' },
  { kind: 'pr', repo: 'microsoft/TypeScript', ref: '64247' },
  { kind: 'pr', repo: 'facebook/react', ref: '37608' },
  { kind: 'pr', repo: 'facebook/react', ref: '37609' },
  { kind: 'pr', repo: 'nestjs/nest', ref: '17692' },
  { kind: 'pr', repo: 'nestjs/nest', ref: '17595' },
  { kind: 'pr', repo: 'vercel/next.js', ref: '93974' },
  { kind: 'pr', repo: 'vercel/next.js', ref: '93975' },
  { kind: 'pr', repo: 'django/django', ref: '21929' },
  { kind: 'pr', repo: 'rails/rails', ref: '58377' },
  { kind: 'pr', repo: 'rails/rails', ref: '58555' },
];

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const key = (s: SampleItem): string => `${s.repo}_${s.kind}_${s.ref}`.replace(/[^\w.-]/g, '_');

async function ghApi<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'PRism-batching-spike' },
  });

  if (!res.ok) {
    throw new Error(`${path}: GitHub API ${res.status}`);
  }

  return (await res.json()) as T;
}

async function discover(): Promise<SampleItem[]> {
  const items: SampleItem[] = [...PINNED];
  const seen = new Set(items.map(key));
  const add = (s: SampleItem): void => {
    if (!seen.has(key(s))) {
      seen.add(key(s));
      items.push(s);
    }
  };

  for (const repo of REPOS) {
    try {
      const list = await ghApi<{ number: number; title: string; merged_at: string | null }[]>(
        `/repos/${repo}/pulls?state=closed&per_page=100`,
      );
      const merged = list.filter((p) => p.merged_at);
      const stride = Math.max(1, Math.floor(merged.length / 3));

      for (let i = 0; i < 3; i++) {
        const p = merged[i * stride];
        if (p) add({ kind: 'pr', repo, ref: String(p.number) });
      }

      const deps = merged.find((p) => /\b(deps?|bump|lock|upgrade|update dependenc)/i.test(p.title));
      if (deps) add({ kind: 'pr', repo, ref: String(deps.number), note: 'dependency-style title' });
    } catch (e) {
      console.warn(`discover ${repo}: ${(e as Error).message}`);
    }
  }

  for (const repo of COMMIT_REPOS) {
    try {
      const list = await ghApi<{ sha: string; parents: unknown[] }[]>(`/repos/${repo}/commits?per_page=100`);
      const singles = list.filter((c) => c.parents.length === 1);

      for (const i of [3, 40]) {
        const c = singles[i];
        if (c) add({ kind: 'commit', repo, ref: c.sha });
      }
    } catch (e) {
      console.warn(`discover commits ${repo}: ${(e as Error).message}`);
    }
  }

  return items;
}

async function fetchDiff(s: SampleItem): Promise<string | null> {
  const file = join(CACHE, `${key(s)}.diff`);

  if (existsSync(file)) {
    return readFileSync(file, 'utf8');
  }

  const legacy = join(LEGACY_CACHE, `${s.repo.replace(/[^\w.-]/g, '_')}_${s.ref}.diff`);

  if (s.kind === 'pr' && existsSync(legacy)) {
    const body = readFileSync(legacy, 'utf8');
    writeFileSync(file, body);

    return body;
  }

  if (NO_FETCH) {
    return null;
  }

  const url =
    s.kind === 'pr'
      ? `https://github.com/${s.repo}/pull/${s.ref}.diff`
      : `https://github.com/${s.repo}/commit/${s.ref}.diff`;

  await sleep(600);
  const res = await fetch(url, { headers: { 'User-Agent': 'PRism-batching-spike' }, redirect: 'follow' });

  if (!res.ok) {
    console.warn(`fetch ${s.repo} ${s.ref}: HTTP ${res.status}`);

    return null;
  }

  const body = await res.text();
  writeFileSync(file, body);

  return body;
}

// ---------------------------------------------------------------- packer ---

interface FileChunk {
  path: string;
  body: string;
}

function reviewableFiles(diff: string): FileChunk[] {
  const out: FileChunk[] = [];

  for (const body of diff.split(FILE_START).filter((c) => c.startsWith('diff --git'))) {
    const path = parseGitHeader(body.split('\n', 1)[0] ?? '')?.oldPath;

    if (path && !NOISE.test(path)) out.push({ path, body });
  }

  return out;
}

/**
 * Splits one over-budget file into pieces of header + whole hunks, each within
 * budget. A single hunk larger than the budget is cut at line boundaries (and
 * `giantHunks` counted): partialFile() would drop the tail of such a hunk, a
 * full-coverage reviewer cannot.
 */
function splitOversized(body: string, budget: number): { pieces: string[]; giantHunks: number } {
  const parts = body.split(HUNK_START);
  const header = parts[0] ?? '';
  const pieces: string[] = [];
  let giantHunks = 0;
  let cur = header;

  const flush = (): void => {
    if (cur !== header) pieces.push(cur);
    cur = header;
  };

  for (const hunk of parts.slice(1)) {
    if (header.length + hunk.length > budget) {
      flush();
      giantHunks += 1;
      const room = Math.max(budget - header.length, 200);
      let rest = hunk;

      while (rest.length > 0) {
        let cut = rest.slice(0, room);
        const nl = cut.lastIndexOf('\n');
        if (rest.length > room && nl > 0) cut = cut.slice(0, nl + 1);
        pieces.push(header + cut);
        rest = rest.slice(cut.length);
      }
      continue;
    }

    if (cur.length + hunk.length > budget) flush();
    cur += hunk;
  }

  flush();

  return { pieces, giantHunks };
}

interface Packed {
  batches: number;
  /** For each file path, the set of batch indexes holding any part of it. */
  placement: Map<string, Set<number>>;
  splitFiles: number;
  giantHunks: number;
}

/** Greedy sequential packer: fill the open batch, otherwise open a new one. */
function pack(files: FileChunk[], budget: number): Packed {
  const placement = new Map<string, Set<number>>();
  let used = 0;
  let batch = -1;
  let splitFiles = 0;
  let giantHunks = 0;

  const place = (path: string, size: number): void => {
    if (batch === -1 || used + size > budget) {
      batch += 1;
      used = 0;
    }
    used += size;
    const set = placement.get(path) ?? new Set<number>();
    set.add(batch);
    placement.set(path, set);
  };

  for (const f of files) {
    if (f.body.length <= budget) {
      place(f.path, f.body.length);
      continue;
    }

    const { pieces, giantHunks: g } = splitOversized(f.body, budget);
    splitFiles += 1;
    giantHunks += g;
    for (const p of pieces) place(f.path, p.length);
  }

  return { batches: batch + 1, placement, splitFiles, giantHunks };
}

// ------------------------------------------------------- import grouping ---

const IMPORT_RE = /^\+.*?(?:from\s+|import\s+|require\(\s*)['"](\.{1,2}\/[^'"]+)['"]/;
const EXTS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '/index.ts', '/index.tsx', '/index.js'];

function dirOf(p: string): string {
  const i = p.lastIndexOf('/');

  return i === -1 ? '' : p.slice(0, i);
}

function normalise(p: string): string {
  const out: string[] = [];

  for (const seg of p.split('/')) {
    if (seg === '..') out.pop();
    else if (seg !== '.' && seg !== '') out.push(seg);
  }

  return out.join('/');
}

/** Undirected edges between changed files where one's added lines import the other (relative TS/JS imports only). */
function importEdges(files: FileChunk[]): [string, string][] {
  const paths = new Set(files.map((f) => f.path));
  const edges: [string, string][] = [];

  for (const f of files) {
    if (!/\.(tsx?|jsx?|mjs|cjs)$/.test(f.path)) continue;

    for (const line of f.body.split('\n')) {
      const m = IMPORT_RE.exec(line);
      if (!m) continue;
      const base = normalise(`${dirOf(f.path)}/${m[1] as string}`);
      const hit = EXTS.map((e) => base + e).find((c) => paths.has(c) && c !== f.path);
      if (hit) edges.push([f.path, hit]);
    }
  }

  return edges;
}

/** Reorders files so each connected component is contiguous (first-appearance order). */
function groupByImports(files: FileChunk[], edges: [string, string][]): FileChunk[] {
  const parent = new Map<string, string>(files.map((f) => [f.path, f.path]));
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r) as string;
    parent.set(x, r);

    return r;
  };

  for (const [a, b] of edges) parent.set(find(a), find(b));

  const order: string[] = [];
  const groups = new Map<string, FileChunk[]>();

  for (const f of files) {
    const root = find(f.path);
    if (!groups.has(root)) {
      groups.set(root, []);
      order.push(root);
    }
    (groups.get(root) as FileChunk[]).push(f);
  }

  return order.flatMap((r) => groups.get(r) as FileChunk[]);
}

const shared = (a: Set<number> | undefined, b: Set<number> | undefined): boolean =>
  !!a && !!b && [...a].some((x) => b.has(x));

// -------------------------------------------------------------- analysis ---

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;

  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] as number;
}

interface Row {
  id: string;
  kind: string;
  files: number;
  noise: number;
  reviewable: number;
  reviewableChars: number;
  maxFileChars: number;
  coverage8000: number;
  lowerBound: Record<number, number>;
  batches: Record<number, number>;
  splitFiles: Record<number, number>;
  giantHunks: Record<number, number>;
  importEdges: number;
  edgesSplitPlain: Record<number, number>;
  edgesSplitGrouped: Record<number, number>;
  assignmentChanged: Record<number, boolean>;
  batchesGrouped: Record<number, number>;
}

function analyse(id: string, kind: string, diff: string): Row {
  const sel = selectForReview(diff, DIFF_LIMIT);
  const files = reviewableFiles(diff);
  const chars = files.reduce((n, f) => n + f.body.length, 0);
  const edges = importEdges(files);
  const grouped = groupByImports(files, edges);
  const row: Row = {
    id,
    kind,
    files: sel.totalFiles,
    noise: sel.noise.length,
    reviewable: files.length,
    reviewableChars: chars,
    maxFileChars: files.reduce((m, f) => Math.max(m, f.body.length), 0),
    coverage8000: coverageRatio(sel),
    lowerBound: {},
    batches: {},
    splitFiles: {},
    giantHunks: {},
    importEdges: edges.length,
    edgesSplitPlain: {},
    edgesSplitGrouped: {},
    assignmentChanged: {},
    batchesGrouped: {},
  };

  for (const b of BUDGETS) {
    const plain = pack(files, b);
    const g = pack(grouped, b);
    row.lowerBound[b] = Math.ceil(chars / b);
    row.batches[b] = plain.batches;
    row.splitFiles[b] = plain.splitFiles;
    row.giantHunks[b] = plain.giantHunks;
    row.batchesGrouped[b] = g.batches;
    row.edgesSplitPlain[b] = edges.filter(([x, y]) => !shared(plain.placement.get(x), plain.placement.get(y))).length;
    row.edgesSplitGrouped[b] = edges.filter(([x, y]) => !shared(g.placement.get(x), g.placement.get(y))).length;
    row.assignmentChanged[b] = files.some(
      (f) => [...(plain.placement.get(f.path) ?? [])].join() !== [...(g.placement.get(f.path) ?? [])].join(),
    );
  }

  return row;
}

function summarise(rows: Row[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const withCode = rows.filter((r) => r.reviewable > 0);

  for (const b of BUDGETS) {
    const v = withCode.map((r) => r.batches[b] as number).sort((x, y) => x - y);
    const g = withCode.map((r) => r.batchesGrouped[b] as number).sort((x, y) => x - y);
    const edgeRows = withCode.filter((r) => r.importEdges > 0);
    out[String(b)] = {
      diffsWithReviewableCode: withCode.length,
      p50: pct(v, 50),
      p90: pct(v, 90),
      p99: pct(v, 99),
      max: v[v.length - 1] ?? 0,
      mean: +(v.reduce((a, c) => a + c, 0) / Math.max(v.length, 1)).toFixed(2),
      over1: v.filter((x) => x > 1).length,
      over4: v.filter((x) => x > 4).length,
      over8: v.filter((x) => x > 8).length,
      over16: v.filter((x) => x > 16).length,
      totalCalls: v.reduce((a, c) => a + c, 0),
      groupedP50: pct(g, 50),
      groupedP90: pct(g, 90),
      groupedMax: g[g.length - 1] ?? 0,
      groupedTotalCalls: g.reduce((a, c) => a + c, 0),
      diffsWithImportEdges: edgeRows.length,
      edgesTotal: edgeRows.reduce((a, r) => a + r.importEdges, 0),
      edgesSplitPlain: edgeRows.reduce((a, r) => a + (r.edgesSplitPlain[b] as number), 0),
      edgesSplitGrouped: edgeRows.reduce((a, r) => a + (r.edgesSplitGrouped[b] as number), 0),
      diffsAssignmentChanged: withCode.filter((r) => r.assignmentChanged[b]).length,
      diffsWithSplitFile: withCode.filter((r) => (r.splitFiles[b] as number) > 0).length,
      diffsWithGiantHunk: withCode.filter((r) => (r.giantHunks[b] as number) > 0).length,
    };
  }

  const cov = withCode.map((r) => r.coverage8000).sort((a, c) => a - c);
  out['coverage8000'] = {
    p10: pct(cov, 10),
    p50: pct(cov, 50),
    fullyCovered: cov.filter((c) => c >= 1).length,
    under50pct: cov.filter((c) => c < 0.5).length,
    n: cov.length,
  };

  return out;
}

async function main(): Promise<void> {
  mkdirSync(CACHE, { recursive: true });
  const listFile = join(CACHE, 'sample.json');
  let sample: SampleItem[];

  if (existsSync(listFile)) {
    sample = JSON.parse(readFileSync(listFile, 'utf8')) as SampleItem[];
  } else if (NO_FETCH) {
    throw new Error('no sample.json in cache and --no-fetch given');
  } else {
    sample = await discover();
    writeFileSync(listFile, JSON.stringify(sample, null, 2));
  }

  const rows: Row[] = [];
  const failed: string[] = [];
  const rssStart = process.memoryUsage().rss;
  let peakRss = rssStart;

  for (const s of sample) {
    const diff = await fetchDiff(s);

    if (diff === null || diff.trim() === '') {
      failed.push(key(s));
      continue;
    }

    const label = `${s.repo}${s.kind === 'pr' ? '#' : '@'}${s.kind === 'pr' ? s.ref : s.ref.slice(0, 8)}`;
    rows.push(analyse(label, s.kind, diff));
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
  }

  const capacity = {
    GROQ_TIMEOUT_MS,
    GROQ_MODELS,
    REVIEW_JOB_TIMEOUT_MS,
    REVIEW_JOB_ATTEMPTS,
    REVIEW_JOB_BACKOFF_SECONDS,
    workerConcurrency: REVIEW_WORKER_OPTIONS.concurrency,
  };
  const summary = summarise(rows);

  writeFileSync(OUT, JSON.stringify({ capacity, summary, failed, rows, peakRssMb: +(peakRss / 1e6).toFixed(0) }, null, 2));

  console.log(`sample ${sample.length}, analysed ${rows.length}, failed ${failed.length}; peak RSS ${(peakRss / 1e6).toFixed(0)} MB`);
  console.log('capacity', JSON.stringify(capacity));
  console.log('coverage@8000', JSON.stringify(summary['coverage8000']));
  console.table(
    BUDGETS.map((b) => ({ budget: b, ...(summary[String(b)] as object) })),
  );
  console.table(
    rows.map((r) => ({
      id: r.id, files: r.files, noise: r.noise, review: r.reviewable, chars: r.reviewableChars,
      cov8k: +r.coverage8000.toFixed(2), b8: r.batches[8000], b16: r.batches[16000], b24: r.batches[24000],
      edges: r.importEdges, split8: r.edgesSplitPlain[8000],
    })),
  );
  console.log(`results written to ${OUT}`);
}

void main();
