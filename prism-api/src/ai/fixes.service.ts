import { Injectable } from '@nestjs/common';
import type {
  ReviewIssue,
  SuggestedFix,
  SuggestedFixes,
} from '../database/entities/review.entity';
import { AiClientService, type AiCallContext } from './ai-client.service';
import {
  FIXES_SYSTEM_PROMPT,
  PromptBuilderService,
  type IssueLayers,
  type ReviewTarget,
} from './prompt-builder.service';

/**
 * Port of generateFixes(), the second AI pass.
 *
 * Three return states, all meaningful to the caller:
 *   - `{ fixes: [] }` when the review found nothing (no AI call is made)
 *   - `null` when the model answered but not with a usable `fixes` array —
 *     the review is still saved, just without fixes
 *   - a populated object otherwise
 */
const VALID_LAYERS = ['security', 'performance', 'code_quality'] as const;

/** PHP's `(string) ($x ?? '')`. */
function toStringValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  return typeof value === 'string' ? value : String(value);
}

/** PHP's is_numeric() gate followed by an (int) truncating cast. */
export function toLine(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.trunc(value) : null;
  }

  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Math.trunc(Number(value));
  }

  return null;
}

@Injectable()
export class FixesService {
  constructor(
    private readonly aiClient: AiClientService,
    private readonly promptBuilder: PromptBuilderService,
  ) {}

  async generate(
    model: string,
    layers: IssueLayers,
    diff: string,
    target: ReviewTarget,
    context: AiCallContext,
  ): Promise<SuggestedFixes | null> {
    const payload: IssueLayers = {
      security: layers.security ?? [],
      performance: layers.performance ?? [],
      code_quality: layers.code_quality ?? [],
    };

    // Nothing to fix — short-circuit without spending a call.
    if (
      payload.security.length === 0 &&
      payload.performance.length === 0 &&
      payload.code_quality.length === 0
    ) {
      return { fixes: [] };
    }

    const parsed = await this.aiClient.call(
      model,
      FIXES_SYSTEM_PROMPT,
      this.promptBuilder.buildFixesPrompt(payload, diff, target),
      context,
    );

    if (!parsed || !Array.isArray(parsed.fixes)) {
      return null;
    }

    const fixes: SuggestedFix[] = parsed.fixes.slice(0, 5).map((entry) => {
      const fix = (entry ?? {}) as Record<string, unknown>;
      const layer = fix.layer;

      return {
        layer: VALID_LAYERS.includes(layer as SuggestedFix['layer'])
          ? (layer as SuggestedFix['layer'])
          : 'code_quality',
        file: toStringValue(fix.file),
        line: toLine(fix.line),
        original_issue: toStringValue(fix.original_issue),
        problematic_code: toStringValue(fix.problematic_code),
        suggested_code: toStringValue(fix.suggested_code),
        explanation: toStringValue(fix.explanation),
      };
    });

    return { fixes };
  }

  /** Shapes the three issue arrays the way both jobs pass them around. */
  static layersFrom(parsed: Record<string, unknown>): IssueLayers {
    const arrayAt = (key: string): ReviewIssue[] => {
      const value = parsed[key];

      return Array.isArray(value) ? (value as ReviewIssue[]) : [];
    };

    return {
      security: arrayAt('security_issues'),
      performance: arrayAt('performance_issues'),
      code_quality: arrayAt('code_quality_issues'),
    };
  }
}
