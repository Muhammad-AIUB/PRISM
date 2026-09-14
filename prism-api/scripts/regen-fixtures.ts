/**
 * Regenerates test/fixtures/system-prompts.json from the CURRENT prompt builder.
 *
 * Read this before running it. These fixtures began as a byte-exact record of a
 * deleted PHP implementation, captured by reflecting its job classes. From the
 * moment this script runs, they stop being that and become a snapshot of our
 * own output — a guard against unintended drift rather than a parity proof.
 *
 * That is a one-way door and it is taken deliberately, in the same commit that
 * rewrote the prompt, with the reason recorded in the commit message. Do not run
 * it to make a red test go green. Run it only when the prompt change was the
 * point, and read the diff it produces line by line afterwards.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PromptBuilderService, type ReviewTarget } from '../src/ai/prompt-builder.service';

const COMBINATIONS: Record<string, string[]> = {
  none: [],
  php: ['PHP'],
  javascript: ['JavaScript'],
  typescript: ['TypeScript'],
  python: ['Python'],
  go: ['Go'],
  ruby: ['Ruby'],
  java: ['Java'],
  ruby_java: ['Ruby', 'Java'],
  php_javascript: ['PHP', 'JavaScript'],
  js_ts: ['JavaScript', 'TypeScript'],
  all_supported: ['PHP', 'JavaScript', 'TypeScript', 'Python', 'Go', 'Ruby', 'Java'],
  mixed_unruled: ['Ruby', 'PHP', 'Java'],
};

const TARGETS: { key: string; target: ReviewTarget }[] = [
  { key: 'commit', target: 'commit' },
  { key: 'pull_request', target: 'pull request' },
];

const builder = new PromptBuilderService();
const out: Record<string, Record<string, { languages: string[]; prompt: string }>> = {};

for (const { key, target } of TARGETS) {
  out[key] = {};

  for (const [name, languages] of Object.entries(COMBINATIONS)) {
    (out[key] as Record<string, { languages: string[]; prompt: string }>)[name] = {
      languages,
      prompt: builder.buildSystemPrompt(languages, target),
    };
  }
}

const path = join(__dirname, '..', 'test', 'fixtures', 'system-prompts.json');
writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`);

const commit = builder.buildSystemPrompt([], 'commit');
const pr = builder.buildSystemPrompt([], 'pull request');

console.log(`Wrote ${Object.keys(COMBINATIONS).length * 2} entries to ${path}`);
console.log(`Target symmetry holds: ${commit.replace(/commit/g, 'pull request') === pr}`);
console.log(`Ruby+Java still have no language rules: ${builder.getLanguageRules(['Ruby', 'Java']).length === 0}`);
