import { Injectable } from '@nestjs/common';
import type { ReviewIssue } from '../database/entities/review.entity';

/**
 * The two Laravel jobs build *almost* the same prompts. The differences are
 * small enough to look like copy-paste noise and large enough that collapsing
 * them would change what the model is asked. They are preserved exactly:
 *
 *   - the system prompt names the subject twice ("a commit" / "a pull request")
 *   - the fixes prompt's JSON skeleton is a single line for commits and a
 *     pretty-printed block for pull requests, with different hint text
 *     ("the bad code snippet" vs "the bad code snippet (2-5 lines)")
 */
export type ReviewTarget = 'commit' | 'pull request';

export interface IssueLayers {
  security: ReviewIssue[];
  performance: ReviewIssue[];
  code_quality: ReviewIssue[];
}

/** Prepended by callAiWithFallback before every first-pass review call. */
export const STRONG_JSON_PREAMBLE =
  'Respond with ONLY raw JSON. NO prose. NO markdown code fences. NO explanations before or after.\n\n';

export const FIXES_SYSTEM_PROMPT =
  'You are an expert software engineer providing precise code fixes. Return only valid JSON.';

/**
 * PHP's json_encode escapes every non-ASCII character as \uXXXX unless
 * JSON_UNESCAPED_UNICODE is passed — and neither job passes it. JS does the
 * opposite. Without this the prompt diverges the moment an issue comment
 * contains an emoji or an accented character.
 */
function phpJsonEncodePretty(value: unknown): string {
  const json = JSON.stringify(value, null, 4);
  let escaped = '';

  // Per UTF-16 code unit, not per code point: PHP emits surrogate pairs as two
  // separate \uXXXX escapes, which is what charCodeAt gives us for free.
  for (let index = 0; index < json.length; index += 1) {
    const code = json.charCodeAt(index);

    escaped +=
      code > 0x7f ? `\\u${code.toString(16).padStart(4, '0')}` : json.charAt(index);
  }

  return escaped;
}

@Injectable()
export class PromptBuilderService {
  /**
   * Port of buildSystemPrompt(). The base block is a PHP nowdoc, so it is
   * reproduced byte for byte — including the "(NOT 0-10)" clarification that
   * commit 'aef446d' added to stop the model scoring out of ten.
   */
  buildSystemPrompt(languages: string[], target: ReviewTarget): string {
    const base =
      `You are a senior software engineer reviewing a ${target}.\n` +
      'Analyze the diff and return ONLY a valid JSON object with this exact structure:\n' +
      '{\n' +
      '  "security_issues": [{"file": "", "line": 0, "severity": "", "comment": ""}],\n' +
      '  "performance_issues": [{"file": "", "line": 0, "severity": "", "comment": ""}],\n' +
      '  "code_quality_issues": [{"file": "", "line": 0, "severity": "", "comment": ""}],\n' +
      '  "overall_score": 0,\n' +
      '  "summary": ""\n' +
      '}\n' +
      `overall_score must be an integer from 0 to 100 (NOT 0-10), where 100 is flawless and 0 is critically broken. A clean ${target} with only minor suggestions should score 80-95.\n` +
      'severity must be: critical, warning, or suggestion';

    const rules = this.getLanguageRules(languages);

    if (rules.length === 0) {
      return base;
    }

    return (
      `Detected languages: ${languages.join(', ')}\n\n` +
      base +
      '\n\nApply these language-specific rules:\n- ' +
      rules.join('\n- ')
    );
  }

  /**
   * Port of getLanguageRules(). Ruby and Java are deliberately absent: the
   * detector recognises them for the UI badges, but Laravel has never had rules
   * for them, so a diff of only .rb files gets the base prompt unchanged.
   */
  getLanguageRules(languages: string[]): string[] {
    const rules: string[] = [];

    if (languages.includes('PHP')) {
      rules.push(
        'Detect N+1 query patterns (loops with model calls)',
        'Check for missing form validation in controllers',
        'Flag raw SQL queries without parameter binding',
        'Verify authorization checks in sensitive endpoints',
        'Check for hardcoded credentials',
        'Detect missing return type hints',
      );
    }

    if (languages.includes('JavaScript') || languages.includes('TypeScript')) {
      rules.push(
        'Flag console.log statements left in production code',
        'Check for missing error handling in async functions',
        'Detect usage of `any` type in TypeScript',
        'Check for missing key prop in React lists',
        'Flag direct DOM manipulation in React',
        'Detect potential memory leaks (uncleaned listeners)',
      );
    }

    if (languages.includes('Python')) {
      rules.push(
        'Check for bare except clauses',
        'Detect missing type hints',
        'Flag print statements in production code',
        'Check for SQL injection in raw queries',
      );
    }

    if (languages.includes('Go')) {
      rules.push(
        'Verify error handling on every error return',
        'Check for goroutine leaks',
        'Detect missing context propagation',
      );
    }

    return rules;
  }

  /** Port of generateFixes()'s user prompt. Diff is truncated to 4000 here. */
  buildFixesPrompt(layers: IssueLayers, diff: string, target: ReviewTarget): string {
    const skeleton =
      target === 'commit'
        ? '{ "fixes": [ { "layer": "security|performance|code_quality", "file": "path/to/file", "line": <number>, "original_issue": "brief description", "problematic_code": "the bad code snippet", "suggested_code": "the fixed code snippet", "explanation": "why this fix is better" } ] }'
        : '{\n' +
          '  "fixes": [\n' +
          '    {\n' +
          '      "layer": "security|performance|code_quality",\n' +
          '      "file": "path/to/file",\n' +
          '      "line": <number>,\n' +
          '      "original_issue": "brief description",\n' +
          '      "problematic_code": "the bad code snippet (2-5 lines)",\n' +
          '      "suggested_code": "the fixed code snippet",\n' +
          '      "explanation": "why this fix is better (1-2 sentences)"\n' +
          '    }\n' +
          '  ]\n' +
          '}';

    return (
      'Based on these issues found in the code review, provide concrete code fixes.\n\n' +
      `Issues:\n${phpJsonEncodePretty(layers)}\n\n` +
      `Diff context (first 4000 chars):\n${diff.slice(0, 4000)}\n\n` +
      'Return ONLY a valid JSON object with this exact structure:\n' +
      `${skeleton}\n\n` +
      'Provide fixes only for the most impactful issues (max 5).'
    );
  }
}
