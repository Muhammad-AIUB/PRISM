import { randomUUID } from 'node:crypto';
import { HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AiClientService, RateLimitedError } from '../../ai/ai-client.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { toIso8601String } from '../../common/utils/iso8601';
import type { User } from '../../database/entities';
import {
  summarise,
  type Blueprint,
  type BlueprintContent,
  type BlueprintSummary,
  type DesignBrief,
} from '../../design/blueprint';
import { renderBlueprintMarkdown } from '../../design/blueprint-markdown';
import { normaliseBlueprint } from '../../design/blueprint-normaliser';
import { baselineBlueprint, readinessChecklist } from '../../design/design-baseline';
import { buildDesignUserPrompt, DESIGN_SYSTEM_PROMPT } from '../../design/design-prompt';
import { DesignStore } from './design.store';

/**
 * Design Studio: a brief in, a blueprint out.
 *
 * Runs inline on the request rather than on the review queue, deliberately.
 * The queue runs at concurrency 1 to stay inside 512MB, so a design request
 * behind three slow reviews would wait minutes for a call that takes seconds,
 * and the person is sitting in front of the form waiting for it. The cost of
 * that choice is bounded twice: a per-user limit below, and a hard budget on
 * the AI call that is shorter than any proxy in front of this service.
 */

/**
 * Under Render's and Next's request ceilings with room for the save. The AI
 * client's own per-call timeout is longer, so this is what actually bounds
 * the request; when it fires, the model call is cancelled, not abandoned.
 */
export const DESIGN_BUDGET_MS = 55_000;

/** Generations per user per window. Each one is two Groq calls at worst. */
export const DESIGN_RATE_LIMIT = 10;
export const DESIGN_RATE_WINDOW_SECONDS = 60 * 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Generated {
  content: BlueprintContent;
  source: Blueprint['source'];
  model: string | null;
  notice: string | null;
}

@Injectable()
export class DesignService {
  private readonly logger = new Logger(DesignService.name);

  constructor(
    private readonly ai: AiClientService,
    private readonly store: DesignStore,
    private readonly auditLog: AuditLogService,
  ) {}

  async create(user: User, brief: DesignBrief): Promise<Blueprint> {
    // Checked before the model is called, so a client in a loop costs a Redis
    // INCR per attempt rather than two Groq calls.
    if ((await this.store.hit(user.id, DESIGN_RATE_WINDOW_SECONDS)) > DESIGN_RATE_LIMIT) {
      // The exact body the MCP server and the web app already recognise.
      throw new HttpException('Too Many Attempts.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const generated = await this.generate(brief);

    const blueprint: Blueprint = {
      ...generated.content,
      id: randomUUID(),
      brief,
      readiness_checklist: readinessChecklist(brief),
      source: generated.source,
      model: generated.model,
      notice: generated.notice,
      created_at: toIso8601String(new Date()) ?? '',
    };

    await this.store.save(user.id, blueprint);

    await this.auditLog.record(user.id, 'design_created', `Generated design "${blueprint.title}"`, {
      design_id: blueprint.id,
      source: blueprint.source,
    });

    return blueprint;
  }

  async list(user: User): Promise<BlueprintSummary[]> {
    return (await this.store.list(user.id)).map(summarise);
  }

  async show(user: User, id: string): Promise<Blueprint> {
    const blueprint = UUID.test(id) ? await this.store.find(user.id, id) : null;

    // Missing, expired, malformed and someone else's all look the same from
    // outside. A distinct answer would confirm that an id exists.
    if (!blueprint) {
      throw new NotFoundException('Design not found.');
    }

    return blueprint;
  }

  async markdown(user: User, id: string): Promise<{ filename: string; body: string }> {
    const blueprint = await this.show(user, id);
    const slug =
      blueprint.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'design';

    return { filename: `${slug}.md`, body: renderBlueprintMarkdown(blueprint) };
  }

  async remove(user: User, id: string): Promise<{ message: string }> {
    if (!UUID.test(id) || !(await this.store.delete(user.id, id))) {
      throw new NotFoundException('Design not found.');
    }

    return { message: 'Design deleted.' };
  }

  /**
   * Never throws for an AI failure. Rate limits, timeouts and unusable output
   * all degrade to the deterministic baseline with a notice saying which,
   * because the person asked for a design and a correct generic one is worth
   * more than an error page.
   */
  private async generate(brief: DesignBrief): Promise<Generated> {
    let notice: string;

    try {
      const result = await this.ai.callWithFallback(
        DESIGN_SYSTEM_PROMPT,
        buildDesignUserPrompt(brief),
        'design_advice',
        AbortSignal.timeout(DESIGN_BUDGET_MS),
      );
      const content = normaliseBlueprint(result.parsed);

      if (content) {
        return {
          content: { ...content, title: content.title || 'System design' },
          source: 'ai',
          model: result.model,
          notice: null,
        };
      }

      // No raw text means no model answered at all (an HTTP error or a
      // per-call timeout on every model), which is a different thing to tell
      // someone than "it answered badly".
      notice =
        result.raw === null
          ? 'The AI provider did not answer, so this is the baseline for your scale. Try again for a tailored design.'
          : 'The AI returned a design PRism could not use, so this is the baseline for your scale. Generate again for a tailored design.';
    } catch (error) {
      if (error instanceof RateLimitedError) {
        notice =
          'The AI provider is rate limited right now, so this is the baseline for your scale. Try again in a minute for a tailored design.';
      } else {
        this.logger.warn(
          `Design generation failed, serving baseline: ${error instanceof Error ? error.message : String(error)}`,
        );
        notice =
          'The AI did not answer in time, so this is the baseline for your scale. Try again for a tailored design.';
      }
    }

    return { content: baselineBlueprint(brief), source: 'baseline', model: null, notice };
  }
}
