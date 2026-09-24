/**
 * Design Studio's data model: what a developer asks for (a brief) and what
 * PRism hands back (a blueprint).
 *
 * The review pipeline tells a developer what is wrong with code that already
 * exists. The most expensive mistakes are made before that code exists, in a
 * design nobody questioned: no timeout budget, a queue with no idempotency, a
 * single database with no restore ever tested. A blueprint puts those
 * questions in front of the person while changing the answer still costs a
 * whiteboard rather than a migration.
 *
 * Field names are snake_case because they are served as JSON to the web app
 * and the MCP server, like every other payload this API returns.
 */

export const DESIGN_SCALES = ['prototype', 'startup', 'growth', 'enterprise'] as const;
export type DesignScale = (typeof DESIGN_SCALES)[number];

export const DESIGN_PRIORITIES = [
  'high_availability',
  'low_latency',
  'strong_consistency',
  'low_cost',
  'fast_delivery',
  'security_compliance',
  'offline_first',
] as const;
export type DesignPriority = (typeof DESIGN_PRIORITIES)[number];

/**
 * Concrete numbers for each band. The model is given these rather than the
 * bare word, because "startup scale" means ten users to one person and ten
 * thousand requests a second to another, and the right design differs by
 * orders of magnitude between them.
 */
export const SCALE_PROFILES: Record<DesignScale, { label: string; load: string }> = {
  prototype: { label: 'Prototype', load: 'under 1,000 users, about 1 request/second peak, one region' },
  startup: { label: 'Startup', load: 'about 10,000 daily users, about 50 requests/second peak, one region' },
  growth: {
    label: 'Growth',
    load: 'about 1 million daily users, about 2,000 requests/second peak, one region with multiple availability zones',
  },
  enterprise: {
    label: 'Enterprise',
    load: '10 million+ daily users, 20,000+ requests/second peak, multiple regions, contractual uptime',
  },
};

export const PRIORITY_LABELS: Record<DesignPriority, string> = {
  high_availability: 'High availability',
  low_latency: 'Low latency',
  strong_consistency: 'Strong consistency',
  low_cost: 'Low cost',
  fast_delivery: 'Ship fast',
  security_compliance: 'Security & compliance',
  offline_first: 'Offline-first',
};

export interface DesignBrief {
  product: string;
  scale: DesignScale;
  priorities: DesignPriority[];
  constraints: string;
}

export interface BlueprintComponent {
  name: string;
  responsibility: string;
  technology: string;
  why: string;
}

export interface BlueprintDataStore {
  name: string;
  kind: string;
  holds: string;
  why: string;
}

export interface BlueprintReliability {
  pattern: string;
  where: string;
  why: string;
}

export interface BlueprintFailureMode {
  failure: string;
  impact: string;
  mitigation: string;
  detection: string;
}

export interface BlueprintScalingStage {
  stage: string;
  trigger: string;
  changes: string;
}

export interface BlueprintTradeoff {
  decision: string;
  chosen: string;
  alternative: string;
  why: string;
}

export interface BlueprintSlo {
  name: string;
  target: string;
}

export interface ReadinessItem {
  id: string;
  item: string;
  why: string;
}

/** Everything the model is asked for. Normalised before anything reads it. */
export interface BlueprintContent {
  title: string;
  summary: string;
  architecture_style: string;
  components: BlueprintComponent[];
  data_stores: BlueprintDataStore[];
  request_flow: string[];
  reliability: BlueprintReliability[];
  failure_modes: BlueprintFailureMode[];
  scaling_stages: BlueprintScalingStage[];
  tradeoffs: BlueprintTradeoff[];
  security: string[];
  observability: string[];
  slos: BlueprintSlo[];
  risks: string[];
  first_milestones: string[];
}

export interface Blueprint extends BlueprintContent {
  id: string;
  brief: DesignBrief;
  /**
   * Deterministic, from the brief alone. Never generated, so it is the part
   * of a blueprint that is the same every time and true every time.
   */
  readiness_checklist: ReadinessItem[];
  /**
   * 'baseline' when no model produced a usable answer. The page says so
   * rather than presenting a template as tailored advice.
   */
  source: 'ai' | 'baseline';
  model: string | null;
  notice: string | null;
  created_at: string;
}

export interface BlueprintSummary {
  id: string;
  title: string;
  scale: DesignScale;
  source: Blueprint['source'];
  created_at: string;
}

export function summarise(blueprint: Blueprint): BlueprintSummary {
  return {
    id: blueprint.id,
    title: blueprint.title,
    scale: blueprint.brief.scale,
    source: blueprint.source,
    created_at: blueprint.created_at,
  };
}
