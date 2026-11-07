/**
 * Part C of the Phase 0b spike: a handful of REAL Groq calls with the real
 * batching code, to replace the estimates in docs/superpowers/spikes/2026-11-08-batching-spike.md
 * with measurements. Not part of the application; nothing imports it.
 *
 * It reads ONE variable, GROQ_API_KEY_DEV, from the shell. If it is not set the
 * script says so and exits without making a call: do not look for another key,
 * and never read the repository-root .env.
 *
 * Usage (from prism-api/, Node >= 20.11):
 *
 *   npx ts-node scripts/measure-batching-live.ts --cache <dir> --out <results.json>
 *
 * `--cache` is the spike's cache directory (sample.json plus the raw .diff
 * files, see scripts/measure-batching.ts). `--max-calls` defaults to 15 and is
 * capped at 15. The first calls are sent back to back, on purpose, so the point
 * where Groq starts answering 429 shows how it counts tokens; later calls use
 * the pacer (`--unpaced N` changes how many are sent back to back; 0 paces them all). It stops at the second 429 in a row.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GROQ_MODELS } from '../src/ai/ai-client.service';
import { extractJson } from '../src/ai/json-extractor';
import { PromptBuilderService } from '../src/ai/prompt-builder.service';
import { GroqProvider } from '../src/ai/providers/groq.provider';
import { AI_TIMEOUT_MS } from '../src/ai/providers/http';
import { TokenPacer, systemClock } from '../src/ai/token-pacer';
import { packForReview } from '../src/diff/batch-pack';
import { detectLanguages } from '../src/diff/language-detector';
import { prepareBatch } from '../src/diff/prepare';
import { BATCH_CONFIG, GROQ_FREE_PACE } from '../src/modules/review/batching.config';

const HARD_MAX_CALLS = 15;
const DEFAULT_UNPACED_CALLS = 4;

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);

  return i !== -1 && process.argv[i + 1] ? (process.argv[i + 1] as string) : fallback;
}

interface SampleItem {
  kind: 'pr' | 'commit';
  repo: string;
  ref: string;
}

interface CallRecord {
  diff: string;
  batch: number;
  paced: boolean;
  estimatedTokens: number;
  tokensSentInPreviousMinute: number;
  waitedMs: number;
  latencyMs: number;
  status: number;
  responseChars: number;
  parsed: boolean;
}

async function main(): Promise<void> {
  const apiKey = process.env['GROQ_API_KEY_DEV'];

  if (!apiKey) {
    console.log('not measured: no development key (GROQ_API_KEY_DEV is not set). No call was made.');

    return;
  }

  const cache = arg('cache', join(__dirname, '.batching-cache'));
  const out = arg('out', join(cache, 'live-results.json'));
  const maxCalls = Math.min(Number(arg('max-calls', String(HARD_MAX_CALLS))) || HARD_MAX_CALLS, HARD_MAX_CALLS);
  const unpacedCalls = Number(arg('unpaced', String(DEFAULT_UNPACED_CALLS)));
  const sample = JSON.parse(readFileSync(join(cache, 'sample.json'), 'utf8')) as SampleItem[];
  const system =
    'Respond with ONLY raw JSON. NO prose. NO markdown code fences. NO explanations before or after.\n\n';
  const provider = new GroqProvider();
  const pacer = new TokenPacer(GROQ_FREE_PACE, systemClock);
  const records: CallRecord[] = [];
  const sent: { at: number; tokens: number }[] = [];
  let consecutive429 = 0;
  let diffsUsed = 0;

  for (const item of sample) {
    if (records.length >= maxCalls || diffsUsed >= 5 || consecutive429 >= 2) break;

    const file = join(cache, `${item.repo}_${item.kind}_${item.ref}`.replace(/[^\w.-]/g, '_') + '.diff');

    if (!existsSync(file)) continue;

    const diff = readFileSync(file, 'utf8');
    const packed = packForReview(diff, BATCH_CONFIG);

    // Only diffs that need several calls teach anything about pacing.
    if (packed.batches.length < 2 || packed.batches.length > 4) continue;

    diffsUsed += 1;
    const prompt = new PromptBuilderService().buildSystemPrompt(detectLanguages(diff), 'pull request');

    for (const batch of packed.batches) {
      if (records.length >= maxCalls || consecutive429 >= 2) break;

      const prepared = prepareBatch(batch.text);
      const estimated = pacer.estimate(prepared.body.length);
      const paced = records.length >= unpacedCalls;
      const waitedMs = paced ? await pacer.acquire(estimated) : 0;
      const now = Date.now();
      const previousMinute = sent.filter((s) => now - s.at < 60_000).reduce((n, s) => n + s.tokens, 0);
      const started = Date.now();
      const result = await provider.complete({
        model: GROQ_MODELS[0] as string,
        system: system + prompt,
        user: `Review this diff (part ${batch.index + 1} of ${packed.batches.length} of one change):\n${prepared.body}`,
        context: 'pr_review',
        apiKey,
        signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      });

      sent.push({ at: started, tokens: estimated });
      consecutive429 = result.status === 429 ? consecutive429 + 1 : 0;
      records.push({
        diff: `${item.repo}#${item.ref.slice(0, 8)}`,
        batch: batch.index + 1,
        paced,
        estimatedTokens: estimated,
        tokensSentInPreviousMinute: previousMinute,
        waitedMs,
        latencyMs: Date.now() - started,
        status: result.status,
        responseChars: result.content?.length ?? 0,
        parsed: result.ok && extractJson(result.content ?? '') !== null,
      });
    }
  }

  writeFileSync(out, JSON.stringify({ model: GROQ_MODELS[0], records }, null, 2));
  console.table(records);
  console.log(`calls ${records.length}, 429s ${records.filter((r) => r.status === 429).length}; results written to ${out}`);
}

void main();
