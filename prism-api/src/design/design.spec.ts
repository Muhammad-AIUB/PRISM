import type { Blueprint, DesignBrief } from './blueprint';
import { renderBlueprintMarkdown } from './blueprint-markdown';
import { normaliseBlueprint } from './blueprint-normaliser';
import { baselineBlueprint, readinessChecklist } from './design-baseline';
import { buildDesignUserPrompt, DESIGN_SYSTEM_PROMPT } from './design-prompt';

const brief = (over: Partial<DesignBrief> = {}): DesignBrief => ({
  product: 'A marketplace where local bakeries take pre-orders for weekend pickup.',
  scale: 'startup',
  priorities: [],
  constraints: '',
  ...over,
});

describe('buildDesignUserPrompt', () => {
  it('turns the scale band into numbers the model can design against', () => {
    const prompt = buildDesignUserPrompt(brief({ scale: 'growth' }));

    expect(prompt).toContain('about 2,000 requests/second peak');
    expect(prompt).toContain('weekend pickup');
  });

  it('says so when nothing was stated, rather than leaving a blank', () => {
    const prompt = buildDesignUserPrompt(brief());

    expect(prompt).toContain('Priorities, most important first: none stated');
    expect(prompt).toContain('Constraints (stack, team, budget, cloud, regulation): none stated.');
  });

  it('keeps priorities in the order given, as labels', () => {
    expect(buildDesignUserPrompt(brief({ priorities: ['low_cost', 'high_availability'] }))).toContain(
      'Low cost, High availability',
    );
  });

  it('asks for the structure the normaliser reads, and against over-engineering', () => {
    for (const key of ['components', 'failure_modes', 'scaling_stages', 'tradeoffs', 'slos']) {
      expect(DESIGN_SYSTEM_PROMPT).toContain(`"${key}"`);
    }

    expect(DESIGN_SYSTEM_PROMPT).toContain('Design for the stated load');
  });
});

describe('normaliseBlueprint', () => {
  it('returns null for no output, and for output with nothing a design is made of', () => {
    expect(normaliseBlueprint(null)).toBeNull();
    expect(normaliseBlueprint({ title: 'X', summary: 'Just prose.' })).toBeNull();
  });

  it('coerces, trims and drops entries missing the field that gives them meaning', () => {
    const content = normaliseBlueprint({
      title: '  Bakery   orders ',
      components: [
        { name: 'API', responsibility: 'serves', technology: 42, why: '  because ' },
        { responsibility: 'no name' },
        'not an object',
      ],
      failure_modes: [{ failure: 'DB down', impact: 'x', mitigation: 'y' }],
      security: ['TLS', '', 7, null],
    });

    expect(content?.title).toBe('Bakery orders');
    expect(content?.components).toEqual([
      { name: 'API', responsibility: 'serves', technology: '42', why: 'because' },
    ]);
    expect(content?.failure_modes[0]).toEqual({
      failure: 'DB down',
      impact: 'x',
      mitigation: 'y',
      detection: '',
    });
    expect(content?.security).toEqual(['TLS', '7']);
    expect(content?.tradeoffs).toEqual([]);
  });

  it('caps list length and string length, so one runaway answer cannot bloat the page', () => {
    const content = normaliseBlueprint({
      components: Array.from({ length: 30 }, (_, i) => ({ name: `c${i}`, why: 'w'.repeat(5000) })),
    });

    expect(content?.components).toHaveLength(8);
    expect(content?.components[0]?.why.length).toBeLessThanOrEqual(600);
    expect(content?.components[0]?.why.endsWith('…')).toBe(true);
  });
});

describe('readinessChecklist', () => {
  const ids = (b: DesignBrief) => readinessChecklist(b).map((item) => item.id);

  it('gives every design the fundamentals, whatever its size', () => {
    expect(ids(brief({ scale: 'prototype' }))).toEqual(
      expect.arrayContaining(['timeouts', 'idempotency', 'retries', 'backups', 'rollback', 'secrets']),
    );
  });

  it('adds multi-zone and load testing only once the scale calls for them', () => {
    expect(ids(brief({ scale: 'startup' }))).not.toContain('load_test');
    expect(ids(brief({ scale: 'growth' }))).toEqual(expect.arrayContaining(['multi_az', 'load_test']));
    expect(ids(brief({ scale: 'enterprise' }))).toContain('dr');
  });

  it('lets a stated priority pull an item in early', () => {
    expect(ids(brief({ scale: 'prototype', priorities: ['high_availability'] }))).toContain('multi_az');
    expect(ids(brief({ priorities: ['security_compliance'] }))).toEqual(
      expect.arrayContaining(['encryption', 'audit']),
    );
  });

  it('never repeats an item', () => {
    const all = ids(
      brief({ scale: 'enterprise', priorities: ['high_availability', 'security_compliance'] }),
    );

    expect(new Set(all).size).toBe(all.length);
  });
});

describe('baselineBlueprint', () => {
  it('is a complete design that survives its own normaliser', () => {
    const baseline = baselineBlueprint(brief());

    expect(normaliseBlueprint(baseline as never)).toEqual(baseline);
  });

  it('is named after the product, so saved baselines can be told apart', () => {
    expect(baselineBlueprint(brief()).title).toBe(
      'Baseline: A marketplace where local bakeries take pre-orders for…',
    );
    expect(baselineBlueprint(brief({ product: 'An internal CRM. It syncs contacts.' })).title).toBe(
      'Baseline: An internal CRM',
    );
  });

  it('stays simple at small scale and adds a cache only when the load does', () => {
    const small = baselineBlueprint(brief({ scale: 'prototype' }));
    const large = baselineBlueprint(brief({ scale: 'growth' }));

    expect(small.architecture_style).toBe('Modular monolith');
    expect(small.components.map((c) => c.name)).not.toContain('Cache');
    expect(large.components.map((c) => c.name)).toContain('Cache');
  });

  it('covers the four failure modes the prompt demands of the model', () => {
    const failures = baselineBlueprint(brief()).failure_modes.map((f) => f.failure).join(' ');

    expect(failures).toMatch(/slow/);
    expect(failures).toMatch(/twice/);
    expect(failures).toMatch(/deploy/);
    expect(failures).toMatch(/loss/i);
  });

  it('halves the latency target when latency is a priority', () => {
    const slo = (b: DesignBrief) =>
      baselineBlueprint(b).slos.find((s) => s.name === 'Latency')?.target;

    expect(slo(brief())).toContain('500 ms');
    expect(slo(brief({ priorities: ['low_latency'] }))).toContain('250 ms');
  });
});

describe('renderBlueprintMarkdown', () => {
  const blueprint = (over: Partial<Blueprint> = {}): Blueprint => ({
    ...baselineBlueprint(brief()),
    id: '00000000-0000-4000-8000-000000000000',
    brief: brief({ priorities: ['low_cost'], constraints: 'Two engineers, TypeScript' }),
    readiness_checklist: readinessChecklist(brief()),
    source: 'ai',
    model: 'groq/llama-3.3-70b-versatile',
    notice: null,
    created_at: '2026-09-24T10:00:00+00:00',
    ...over,
  });

  it('renders a design doc with context, tables and a checklist', () => {
    const md = renderBlueprintMarkdown(blueprint({ title: 'Bakery pre-orders' }));

    expect(md.startsWith('# Bakery pre-orders\n\n')).toBe(true);
    expect(md).toContain('on 2026-09-24 with `groq/llama-3.3-70b-versatile`');
    expect(md).toContain('- **Constraints:** Two engineers, TypeScript');
    expect(md).toContain('## Failure modes\n\n| Failure | Impact | Mitigation | Detection |');
    expect(md).toContain('## Production readiness checklist\n\n- [ ] Every outbound call');
    expect(md.endsWith('\n')).toBe(true);
  });

  it('escapes pipes so a cell cannot break its table', () => {
    const md = renderBlueprintMarkdown(
      blueprint({ slos: [{ name: 'Errors', target: '< 1% | 30 days' }] }),
    );

    expect(md).toContain('| Errors | < 1% \\| 30 days |');
  });

  it('omits empty sections instead of printing bare headings, and surfaces a notice', () => {
    const md = renderBlueprintMarkdown(
      blueprint({ tradeoffs: [], risks: [], source: 'baseline', model: null, notice: 'Rate limited.' }),
    );

    expect(md).not.toContain('## Trade-offs');
    expect(md).not.toContain('## Risks');
    expect(md).not.toContain(' with `');
    expect(md).toContain('> **Note:** Rate limited.');
  });
});
