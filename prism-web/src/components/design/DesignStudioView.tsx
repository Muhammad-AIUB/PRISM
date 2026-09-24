'use client';

import { Network, Sparkles, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { createDesign, deleteDesign } from '@/app/design/actions';
import AuthenticatedLayout from '@/components/layouts/AuthenticatedLayout';
import { relativeTime } from '@/lib/time';
import type {
  BlueprintSummary,
  DesignBrief,
  DesignPriority,
  DesignScale,
  SessionUser,
} from '@/lib/types';

/**
 * Design Studio: describe what you are building, get a design you can start
 * on today — components, failure modes, a scaling plan, trade-offs and a
 * production-readiness checklist — and commit it to the repo as Markdown.
 *
 * The form asks for the three things that change a design the most: the
 * load, what matters most, and what is already decided. Everything else a
 * generic design tool asks for is noise at this stage.
 */
const SCALES: { value: DesignScale; label: string; load: string }[] = [
  { value: 'prototype', label: 'Prototype', load: '< 1k users' },
  { value: 'startup', label: 'Startup', load: '~10k daily users' },
  { value: 'growth', label: 'Growth', load: '~1M daily users' },
  { value: 'enterprise', label: 'Enterprise', load: '10M+, multi-region' },
];

const PRIORITIES: { value: DesignPriority; label: string }[] = [
  { value: 'high_availability', label: 'High availability' },
  { value: 'low_latency', label: 'Low latency' },
  { value: 'strong_consistency', label: 'Strong consistency' },
  { value: 'low_cost', label: 'Low cost' },
  { value: 'fast_delivery', label: 'Ship fast' },
  { value: 'security_compliance', label: 'Security & compliance' },
  { value: 'offline_first', label: 'Offline-first' },
];

const MAX_PRIORITIES = 4;

/** One click to a filled form, so the first run takes seconds, not a blank page. */
const EXAMPLES: { label: string; brief: DesignBrief }[] = [
  {
    label: 'Food delivery',
    brief: {
      product:
        'A food delivery app: customers order from nearby restaurants, restaurants accept and prepare orders, couriers get assigned and share live location until delivery. Payments by card.',
      scale: 'growth',
      priorities: ['high_availability', 'low_latency'],
      constraints: 'TypeScript team of 8, AWS, PCI scope must stay minimal',
    },
  },
  {
    label: 'SaaS analytics',
    brief: {
      product:
        'A multi-tenant B2B analytics dashboard. Customers send events through an SDK, we aggregate them, and they explore charts and set alerts on thresholds.',
      scale: 'startup',
      priorities: ['low_cost', 'fast_delivery'],
      constraints: 'Two engineers, Python and Postgres, want to stay on one managed platform',
    },
  },
  {
    label: 'Webhook relay',
    brief: {
      product:
        'A service that receives webhooks from third parties, verifies signatures, and reliably fans them out to customer endpoints with retries and a replay UI.',
      scale: 'startup',
      priorities: ['high_availability', 'security_compliance'],
      constraints: 'Go, must never drop an event, customers are in the EU',
    },
  },
];

/** Shown while the model works, so a 20-second wait reads as progress. */
const STEPS = [
  'Reading your brief…',
  'Sizing the system to your load…',
  'Choosing components and data stores…',
  'Stress-testing failure modes…',
  'Planning how it scales…',
  'Writing up trade-offs…',
];

export default function DesignStudioView({
  user,
  designs,
}: {
  user: SessionUser;
  designs: BlueprintSummary[];
}) {
  const router = useRouter();
  const [brief, setBrief] = useState<DesignBrief>({
    product: '',
    scale: 'startup',
    priorities: [],
    constraints: '',
  });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();
  const [deleting, startDelete] = useTransition();

  useEffect(() => {
    if (!pending) {
      setStep(0);

      return;
    }

    const timer = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 3500);

    return () => clearInterval(timer);
  }, [pending]);

  const togglePriority = (value: DesignPriority) => {
    setBrief((current) => {
      if (current.priorities.includes(value)) {
        return { ...current, priorities: current.priorities.filter((p) => p !== value) };
      }

      return current.priorities.length >= MAX_PRIORITIES
        ? current
        : { ...current, priorities: [...current.priorities, value] };
    });
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setErrors({});
    setMessage(null);

    startTransition(async () => {
      // A rejected server action (network drop, a deploy mid-request) would
      // otherwise leave the form with no message at all.
      const result = await createDesign(brief).catch(() => ({
        ok: false as const,
        id: undefined,
        message: 'Could not reach the server. Check your connection and try again.',
        errors: undefined,
      }));

      if (result.ok && result.id) {
        router.push(`/design/${result.id}`);

        return;
      }

      setErrors(result.errors ?? {});
      setMessage(result.message);
    });
  };

  const remove = (id: string) => {
    setListError(null);

    startDelete(async () => {
      const result = await deleteDesign(id).catch(() => ({
        ok: false,
        message: 'Could not reach the server.',
      }));

      // A failed delete must not look like a successful one: say so, and
      // leave the list as it is rather than refreshing it into the same state.
      if (!result.ok) {
        setListError(`Could not delete that design. ${result.message}`);

        return;
      }

      router.refresh();
    });
  };

  const tooShort = brief.product.trim().length < 20;

  return (
    <AuthenticatedLayout
      user={user}
      header={
        <div className="flex items-center gap-2">
          <Network className="h-5 w-5" style={{ color: 'var(--accent)' }} />
          <h1 className="text-lg font-semibold tracking-tight">Design Studio</h1>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <form onSubmit={submit} className="card-flat space-y-6 p-4 sm:p-6">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">What are you building?</h2>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
              Get an architecture sized to your load, the ways it will fail and how to stop them,
              a scaling plan and a production-readiness checklist. Export it as Markdown and commit
              it next to the code.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Try:
              </span>
              {EXAMPLES.map((example) => (
                <button
                  key={example.label}
                  type="button"
                  className="badge min-h-[32px] px-3 transition hover:opacity-80"
                  style={{
                    backgroundColor: 'var(--accent-bg)',
                    color: 'var(--accent)',
                    borderColor: 'transparent',
                  }}
                  onClick={() => setBrief(example.brief)}
                >
                  {example.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="product" className="text-sm font-medium">
              The product
            </label>
            <textarea
              id="product"
              className="input mt-1.5 min-h-[140px] w-full"
              placeholder="Who uses it, what they do with it, and the one thing it must never get wrong."
              value={brief.product}
              maxLength={4000}
              onChange={(event) => setBrief({ ...brief, product: event.target.value })}
            />
            {errors.product?.map((error) => (
              <p key={error} className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>
                {error}
              </p>
            ))}
          </div>

          <fieldset>
            <legend className="text-sm font-medium">Expected scale</legend>
            <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {SCALES.map((scale) => {
                const active = brief.scale === scale.value;

                return (
                  <button
                    key={scale.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setBrief({ ...brief, scale: scale.value })}
                    className="rounded-md border p-3 text-left transition active:scale-[0.98]"
                    style={{
                      borderColor: active ? 'var(--accent)' : 'var(--border)',
                      backgroundColor: active ? 'var(--accent-bg)' : 'transparent',
                    }}
                  >
                    <span className="block text-sm font-medium">{scale.label}</span>
                    <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>
                      {scale.load}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium">
              What matters most{' '}
              <span className="font-normal" style={{ color: 'var(--text-muted)' }}>
                (up to {MAX_PRIORITIES}, in order)
              </span>
            </legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {PRIORITIES.map((priority) => {
                const position = brief.priorities.indexOf(priority.value);
                const active = position !== -1;
                const full = !active && brief.priorities.length >= MAX_PRIORITIES;

                return (
                  <button
                    key={priority.value}
                    type="button"
                    aria-pressed={active}
                    disabled={full}
                    onClick={() => togglePriority(priority.value)}
                    className="btn btn-secondary text-xs"
                    style={{
                      borderColor: active ? 'var(--accent)' : undefined,
                      color: active ? 'var(--accent)' : undefined,
                    }}
                  >
                    {active && <span className="font-mono">{position + 1}.</span>}
                    {priority.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div>
            <label htmlFor="constraints" className="text-sm font-medium">
              Constraints{' '}
              <span className="font-normal" style={{ color: 'var(--text-muted)' }}>
                (optional)
              </span>
            </label>
            <input
              id="constraints"
              className="input mt-1.5 w-full"
              placeholder="Team size, language, cloud, budget, regulation…"
              value={brief.constraints}
              maxLength={1500}
              onChange={(event) => setBrief({ ...brief, constraints: event.target.value })}
            />
          </div>

          {message && (
            <p
              className="rounded-md p-3 text-sm"
              style={{
                backgroundColor: 'rgba(239,68,68,0.10)',
                color: 'var(--danger)',
                border: '1px solid rgba(239,68,68,0.30)',
              }}
            >
              {message}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="btn btn-primary min-h-[44px]"
              disabled={pending || tooShort}
            >
              <Sparkles className={`h-4 w-4 ${pending ? 'animate-pulse' : ''}`} />
              {pending ? 'Designing…' : 'Generate design'}
            </button>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }} aria-live="polite">
              {pending
                ? STEPS[step]
                : tooShort
                  ? 'Describe the product in a sentence or two to start.'
                  : 'Usually 10–30 seconds.'}
            </span>
          </div>
        </form>

        <aside className="card-flat h-fit p-4">
          <h2
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}
          >
            Your designs
          </h2>
          {listError && (
            <p
              role="alert"
              className="mt-3 rounded-md p-2 text-xs"
              style={{
                backgroundColor: 'rgba(239,68,68,0.10)',
                color: 'var(--danger)',
                border: '1px solid rgba(239,68,68,0.30)',
              }}
            >
              {listError}
            </p>
          )}
          {designs.length === 0 ? (
            <p className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
              Nothing yet. Designs are kept for 30 days; export the ones you want to keep.
            </p>
          ) : (
            <ul className="mt-2 divide-y" style={{ borderColor: 'var(--border)' }}>
              {designs.map((design) => (
                <li key={design.id} className="flex items-center gap-2 py-2">
                  <Link
                    href={`/design/${design.id}`}
                    className="min-w-0 flex-1 hover:opacity-80"
                  >
                    <span className="block truncate text-sm font-medium">{design.title}</span>
                    <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>
                      {design.scale} · {relativeTime(design.created_at)}
                      {design.source === 'baseline' ? ' · baseline' : ''}
                    </span>
                  </Link>
                  <button
                    type="button"
                    className="btn btn-ghost min-h-[44px] min-w-[44px]"
                    style={{ padding: '0.5rem' }}
                    aria-label={`Delete ${design.title}`}
                    disabled={deleting}
                    onClick={() => remove(design.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </AuthenticatedLayout>
  );
}
