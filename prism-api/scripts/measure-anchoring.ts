/**
 * THROWAWAY measurement harness. Not part of the application, not imported by
 * it, not covered by its tests. Delete it once it has done its job.
 *
 * It exists to answer one question the product cannot answer about itself:
 * when the model names a location in a diff, how often is that location real?
 *
 * The design doc's premise 2 says the model invents line numbers by counting
 * inside `@@` headers. Nothing in the pipeline has ever checked. And a
 * validator that DROPS unverifiable findings would satisfy "100% of shown line
 * numbers are correct" by construction, so shipping the validator first would
 * make the question permanently unanswerable. Hence: measure, then build.
 *
 * Usage (never point this at the production .env — pass the key inline):
 *
 *   cd prism-api
 *   GROQ_API_KEY=gsk_... npx ts-node scripts/measure-anchoring.ts \
 *     --prs scripts/prs.txt --budgets 8000,40000 --schemes raw,lines,anchors --repeats 2
 *
 * scripts/prs.txt holds one PR per line: owner/repo#number
 *
 * Add --dry-run to exercise everything except the Groq call. That path needs no
 * API key and still reports diff coverage, so it is worth running first.
 */
import { buildHunkIndex, type HunkIndex } from '../src/diff/hunk-index';
import { renderWithAnchors, renderWithLineNumbers, type Anchor } from '../src/diff/render';
import { detectLanguages } from '../src/diff/language-detector';
import { PromptBuilderService } from '../src/ai/prompt-builder.service';
import { extractJson } from '../src/ai/json-extractor';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

type Scheme = 'raw' | 'lines' | 'anchors';

/** How a single reported location resolved against the real diff. */
type Verdict =
  | 'file_unknown' // the file is not in the diff at all
  | 'line_absent' // the file is real, the line is not a changed line
  | 'line_added'
  | 'line_removed'
  | 'line_ambiguous' // real on BOTH sides: an in-place edit
  | 'line_context' // real, but an unchanged line
  | 'anchor_unknown' // no such anchor was ever rendered
  | 'anchor_file_match' // anchor resolves, and to the file the model named
  | 'anchor_file_mismatch' // anchor resolves, to a DIFFERENT file: caught
  | 'no_line'; // the model gave no usable number

const CACHE_DIR = join(__dirname, '.diff-cache');
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

const ANCHOR_INSTRUCTIONS =
  'Each changed line is prefixed with an opaque anchor id in square brackets, e.g. [7].\n' +
  'In the "line" field of every issue you report, return the ANCHOR ID of the line, not a file line number.\n' +
  'Only lines that show an anchor can be reported.\n\n';

const GUTTER_INSTRUCTIONS =
  'Each line shows its old-side and new-side line numbers in two columns, then | then the change marker.\n' +
  'A dot means the line does not exist on that side. In the "line" field, return the number shown for the line you mean.\n\n';

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));

  if (hit) {
    return hit.slice(name.length + 3);
  }

  const index = process.argv.indexOf(`--${name}`);

  return index !== -1 && process.argv[index + 1] ? (process.argv[index + 1] as string) : fallback;
}

const DRY_RUN = process.argv.includes('--dry-run');

/** Cached on disk so repeats and scheme arms never re-fetch, and never differ. */
async function fetchDiff(spec: string): Promise<string> {
  mkdirSync(CACHE_DIR, { recursive: true });

  const cacheFile = join(CACHE_DIR, `${spec.replace(/[^\w.-]/g, '_')}.diff`);

  if (existsSync(cacheFile)) {
    return readFileSync(cacheFile, 'utf8');
  }

  const [repo, number] = spec.split('#');
  const url = `https://api.github.com/repos/${repo}/pulls/${number}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github.v3.diff',
      'User-Agent': 'PRism-measure',
      ...(process.env.GITHUB_TOKEN
        ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
        : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`${spec}: GitHub returned ${response.status}`);
  }

  const body = await response.text();
  writeFileSync(cacheFile, body);

  return body;
}

/**
 * THROWAWAY selection, deliberately not the production implementation. The
 * engineering review put file selection in the lane that ships WITH the budget
 * raise, because whole-file selection at a small budget is a coverage
 * regression. Here it only has to be identical across arms.
 */
const SKIP = /(^|\/)(dist|vendor|node_modules)\/|package-lock\.json$|yarn\.lock$|\.min\.(js|css)$|\.(png|jpg|gif|ico|pdf|woff2?)$/;

function splitFiles(diff: string): { path: string; body: string }[] {
  const chunks = diff.split(/(?=^diff --git )/m).filter((c) => c.startsWith('diff --git'));

  return chunks.map((body) => ({
    path: /^diff --git a\/(\S+)/.exec(body)?.[1] ?? 'unknown',
    body,
  }));
}

function selectWithinBudget(diff: string, budget: number): { text: string; sent: number; total: number } {
  const files = splitFiles(diff);
  const eligible = files.filter((f) => !SKIP.test(f.path));
  let text = '';
  let sent = 0;

  for (const file of eligible) {
    if (text.length + file.body.length > budget) {
      continue;
    }

    text += file.body;
    sent += 1;
  }

  // 8A fallback: a single file bigger than the whole budget must still yield
  // something, or the model is handed nothing and every finding is dropped.
  if (sent === 0 && eligible.length > 0) {
    text = (eligible[0] as { body: string }).body.slice(0, budget);
    sent = 1;
  }

  return { text, sent, total: files.length };
}

interface Attempt {
  pr: string;
  budget: number;
  scheme: Scheme;
  repeat: number;
  filesSent: number;
  filesTotal: number;
  promptChars: number;
  latencyMs: number;
  status: number;
  rateRemaining: string | null;
  issues: number;
  verdicts: Record<string, number>;
}

function classify(
  file: unknown,
  line: unknown,
  index: HunkIndex,
  anchors: Map<number, Anchor> | null,
): Verdict {
  const n = typeof line === 'number' ? line : Number(line);

  if (!Number.isFinite(n)) {
    return 'no_line';
  }

  if (anchors) {
    const hit = anchors.get(Math.trunc(n));

    if (!hit) {
      return 'anchor_unknown';
    }

    return String(file) === hit.file ? 'anchor_file_match' : 'anchor_file_mismatch';
  }

  const hunks = index.get(String(file));

  if (!hunks) {
    return 'file_unknown';
  }

  const target = Math.trunc(n);
  const inAdded = hunks.added.has(target);
  const inRemoved = hunks.removed.has(target);

  if (inAdded && inRemoved) {
    return 'line_ambiguous';
  }

  if (inAdded) {
    return 'line_added';
  }

  if (inRemoved) {
    return 'line_removed';
  }

  return hunks.context.has(target) ? 'line_context' : 'line_absent';
}

async function callGroq(
  system: string,
  user: string,
): Promise<{ status: number; body: string; rateRemaining: string | null; latencyMs: number }> {
  const started = Date.now();
  const response = await fetch(GROQ_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY ?? ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });

  const body = await response.text();

  return {
    status: response.status,
    body,
    // The header the budget raise needs to be sized against, which the app
    // does not currently read.
    rateRemaining: response.headers.get('x-ratelimit-remaining-tokens'),
    latencyMs: Date.now() - started,
  };
}

async function runOne(
  pr: string,
  diff: string,
  budget: number,
  scheme: Scheme,
  repeat: number,
  builder: PromptBuilderService,
): Promise<Attempt> {
  const selected = selectWithinBudget(diff, budget);
  const selectedIndex = buildHunkIndex(selected.text);

  let userBody: string;
  let anchors: Map<number, Anchor> | null = null;

  if (scheme === 'raw') {
    userBody = selected.text;
  } else if (scheme === 'lines') {
    userBody = GUTTER_INSTRUCTIONS + renderWithLineNumbers(selectedIndex);
  } else {
    const rendered = renderWithAnchors(selectedIndex);
    userBody = ANCHOR_INSTRUCTIONS + rendered.text;
    anchors = rendered.anchors;
  }

  const system = builder.buildSystemPrompt(detectLanguages(diff), 'pull request');
  const user = `Review this diff:\n${userBody}`;
  const attempt: Attempt = {
    pr,
    budget,
    scheme,
    repeat,
    filesSent: selected.sent,
    filesTotal: selected.total,
    promptChars: user.length,
    latencyMs: 0,
    status: 0,
    rateRemaining: null,
    issues: 0,
    verdicts: {},
  };

  if (DRY_RUN) {
    return attempt;
  }

  const call = await callGroq(system, user);

  attempt.status = call.status;
  attempt.latencyMs = call.latencyMs;
  attempt.rateRemaining = call.rateRemaining;

  if (call.status !== 200) {
    attempt.verdicts[`http_${call.status}`] = 1;

    return attempt;
  }

  const content = (JSON.parse(call.body)?.choices?.[0]?.message?.content ?? '') as string;
  const parsed = extractJson(content);

  if (!parsed) {
    attempt.verdicts.unparseable = 1;

    return attempt;
  }

  for (const key of ['security_issues', 'performance_issues', 'code_quality_issues']) {
    const list = (parsed as Record<string, unknown>)[key];

    if (!Array.isArray(list)) {
      continue;
    }

    for (const issue of list as Record<string, unknown>[]) {
      attempt.issues += 1;

      // Against what the model was SHOWN, not the whole diff: a finding about a
      // file that exists but was never sent is a fabrication from where it sits.
      const verdict = classify(issue.file, issue.line, selectedIndex, anchors);

      attempt.verdicts[verdict] = (attempt.verdicts[verdict] ?? 0) + 1;
    }
  }

  return attempt;
}

async function main(): Promise<void> {
  const prs = readFileSync(arg('prs', join(__dirname, 'prs.txt')), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  const budgets = arg('budgets', '8000,40000').split(',').map(Number);
  const schemes = arg('schemes', 'raw,lines,anchors').split(',') as Scheme[];
  const repeats = Number(arg('repeats', '2'));

  if (!DRY_RUN && !process.env.GROQ_API_KEY) {
    console.error('GROQ_API_KEY is not set. Pass it inline, or use --dry-run.');
    process.exit(1);
  }

  const builder = new PromptBuilderService();
  const results: Attempt[] = [];

  for (const pr of prs) {
    let diff: string;

    try {
      diff = await fetchDiff(pr);
    } catch (error) {
      console.error(`SKIP ${pr}: ${(error as Error).message}`);
      continue;
    }

    for (const budget of budgets) {
      for (const scheme of schemes) {
        for (let repeat = 1; repeat <= repeats; repeat += 1) {
          const attempt = await runOne(pr, diff, budget, scheme, repeat, builder);

          results.push(attempt);
          console.log(
            [
              attempt.pr.padEnd(28),
              `b=${attempt.budget}`.padEnd(9),
              attempt.scheme.padEnd(8),
              `r${attempt.repeat}`,
              `files=${attempt.filesSent}/${attempt.filesTotal}`.padEnd(14),
              `chars=${attempt.promptChars}`.padEnd(13),
              `${attempt.latencyMs}ms`.padEnd(8),
              `issues=${attempt.issues}`.padEnd(10),
              JSON.stringify(attempt.verdicts),
            ].join(' '),
          );
        }
      }
    }
  }

  const out = join(__dirname, `measure-${Date.now()}.json`);
  writeFileSync(out, JSON.stringify(results, null, 2));

  console.log('\n=== SUMMARY BY SCHEME AND BUDGET ===');

  for (const scheme of schemes) {
    for (const budget of budgets) {
      const arm = results.filter((r) => r.scheme === scheme && r.budget === budget);
      const totals: Record<string, number> = {};
      let issues = 0;

      for (const attempt of arm) {
        issues += attempt.issues;

        for (const [verdict, count] of Object.entries(attempt.verdicts)) {
          totals[verdict] = (totals[verdict] ?? 0) + count;
        }
      }

      const resolvable =
        (totals.line_added ?? 0) +
        (totals.line_removed ?? 0) +
        (totals.line_ambiguous ?? 0) +
        (totals.anchor_file_match ?? 0) +
        (totals.anchor_file_mismatch ?? 0);
      const pct = issues > 0 ? Math.round((resolvable / issues) * 100) : 0;
      const coverage = arm.length
        ? Math.round(
            (arm.reduce((sum, a) => sum + a.filesSent / Math.max(a.filesTotal, 1), 0) / arm.length) *
              100,
          )
        : 0;

      console.log(
        `${scheme.padEnd(8)} b=${String(budget).padEnd(6)} issues=${String(issues).padEnd(5)} resolvable=${pct}%  files=${coverage}%  ${JSON.stringify(totals)}`,
      );
    }
  }

  console.log(`\nRaw results: ${out}`);
  console.log(
    '\nRead it like this: line_absent and file_unknown are fabrications. line_ambiguous is the\n' +
      'in-place-edit collision that makes "prefer added" unsafe. anchor_file_mismatch is a\n' +
      'fabrication the anchor scheme CAUGHT and the line schemes structurally cannot.',
  );
}

void main();
