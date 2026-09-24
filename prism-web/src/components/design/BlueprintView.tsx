'use client';

import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Copy,
  FileDown,
  ListChecks,
  Network,
  Plus,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { loadDesignMarkdown } from '@/app/design/actions';
import AuthenticatedLayout from '@/components/layouts/AuthenticatedLayout';
import { absoluteTime } from '@/lib/time';
import type { Blueprint, SessionUser } from '@/lib/types';

/**
 * One blueprint, in the order a reviewer of a design reads it: what it is,
 * how a request moves through it, how it breaks, how it grows, what was
 * traded away, and what has to be true before launch.
 *
 * Failure modes sit high on purpose. They are the section generic design
 * advice leaves out and the one that pays for itself first.
 */
const SCALE_LABELS: Record<Blueprint['brief']['scale'], string> = {
  prototype: 'Prototype',
  startup: 'Startup',
  growth: 'Growth',
  enterprise: 'Enterprise',
};

function Section({
  title,
  hint,
  children,
  empty,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  empty: boolean;
}) {
  if (empty) {
    return null;
  }

  return (
    <section className="card-flat p-4 sm:p-6">
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      {hint && (
        <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
          {hint}
        </p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  if (!children) {
    return null;
  }

  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
        {label}
      </dt>
      <dd className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
        {children}
      </dd>
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
      {items.map((item, index) => (
        <li key={`${index}-${item}`}>{item}</li>
      ))}
    </ul>
  );
}

/**
 * The launch checklist's ticks are this reader's own working state, kept in
 * this browser only. Storage can be unavailable (private windows, blocked
 * site data), so every access is guarded and the page works without it.
 */
function useChecklist(id: string) {
  const key = `prism:design-checklist:${id}`;
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(key);

      if (saved) {
        setDone(JSON.parse(saved) as Record<string, boolean>);
      }
    } catch {
      // No storage: the checklist simply starts empty each visit.
    }
  }, [key]);

  const toggle = (item: string) => {
    setDone((current) => {
      const next = { ...current, [item]: !current[item] };

      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Ticks still work for this visit.
      }

      return next;
    });
  };

  return { done, toggle };
}

export default function BlueprintView({ user, design }: { user: SessionUser; design: Blueprint }) {
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle');
  const { done, toggle } = useChecklist(design.id);
  const ready = design.readiness_checklist.filter((item) => done[item.id]).length;

  const copyMarkdown = async () => {
    const markdown = await loadDesignMarkdown(design.id);

    try {
      if (!markdown) {
        throw new Error('empty');
      }

      await navigator.clipboard.writeText(markdown);
      setCopied('copied');
    } catch {
      setCopied('failed');
    }

    setTimeout(() => setCopied('idle'), 2000);
  };

  return (
    <AuthenticatedLayout
      user={user}
      header={
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/design"
            className="btn btn-ghost min-h-[44px] transition active:scale-95"
            style={{ padding: '0.375rem 0.625rem' }}
            aria-label="Back to Design Studio"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Design Studio</span>
          </Link>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={copyMarkdown}
              className="btn btn-secondary min-h-[44px] transition active:scale-95"
            >
              {copied === 'copied' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              <span className="hidden sm:inline">
                {copied === 'copied' ? 'Copied' : copied === 'failed' ? 'Copy failed' : 'Copy Markdown'}
              </span>
            </button>
            {/* A plain anchor: a file download served by a route handler. */}
            <a
              href={`/design/${design.id}/markdown`}
              className="btn btn-secondary min-h-[44px] transition active:scale-95"
            >
              <FileDown className="h-4 w-4" />
              <span className="hidden sm:inline">Download .md</span>
            </a>
            <Link href="/design" className="btn btn-primary min-h-[44px] transition active:scale-95">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New design</span>
            </Link>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="card-flat p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <Network className="h-4 w-4" style={{ color: 'var(--accent)' }} />
            <span>{SCALE_LABELS[design.brief.scale]} scale</span>
            {design.architecture_style && <span>· {design.architecture_style}</span>}
            <span>· {absoluteTime(design.created_at)}</span>
          </div>
          <h1 className="mt-1 break-words text-2xl font-semibold tracking-tight sm:text-3xl">
            {design.title}
          </h1>
          {design.summary && (
            <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {design.summary}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <span
              className="badge"
              style={{
                backgroundColor: 'var(--bg-hover)',
                color: 'var(--text-secondary)',
                borderColor: 'var(--border)',
              }}
            >
              {design.source === 'ai' ? design.model : 'PRism baseline'}
            </span>
          </div>
          {design.notice && (
            <div
              className="mt-4 flex items-start gap-2 rounded-md p-3 text-sm"
              style={{
                backgroundColor: 'rgba(245,158,11,0.10)',
                color: 'var(--text-primary)',
                border: '1px solid rgba(245,158,11,0.30)',
              }}
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--warning)' }} />
              {design.notice}
            </div>
          )}
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-xs" style={{ color: 'var(--text-muted)' }}>
              Your brief
            </summary>
            <p className="mt-2 whitespace-pre-line" style={{ color: 'var(--text-secondary)' }}>
              {design.brief.product}
            </p>
            {design.brief.constraints && (
              <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                Constraints: {design.brief.constraints}
              </p>
            )}
          </details>
        </div>

        <Section title="Components" empty={design.components.length === 0}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {design.components.map((component, index) => (
              <div
                key={`${index}-${component.name}`}
                className="rounded-md border p-3"
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{component.name}</span>
                  {component.technology && (
                    <code className="font-mono text-[11px]" style={{ color: 'var(--accent)' }}>
                      {component.technology}
                    </code>
                  )}
                </div>
                <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {component.responsibility}
                </p>
                {component.why && (
                  <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                    Why: {component.why}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Section>

        <Section title="Main request flow" empty={design.request_flow.length === 0}>
          <ol className="space-y-2">
            {design.request_flow.map((step, index) => (
              <li key={`${index}-${step}`} className="flex gap-3 text-sm">
                <span
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full font-mono text-xs"
                  style={{ backgroundColor: 'var(--accent-bg)', color: 'var(--accent)' }}
                >
                  {index + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </Section>

        <Section
          title="Failure modes"
          hint="How this breaks in production, and what stops it. Read this section first."
          empty={design.failure_modes.length === 0}
        >
          <div className="space-y-3">
            {design.failure_modes.map((mode, index) => (
              <div
                key={`${index}-${mode.failure}`}
                className="rounded-md border p-3"
                style={{ borderColor: 'color-mix(in srgb, var(--danger) 25%, var(--border))' }}
              >
                <p className="flex items-start gap-2 font-medium">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--danger)' }} />
                  {mode.failure}
                </p>
                <dl className="mt-2 grid gap-2 sm:grid-cols-3">
                  <Field label="Impact">{mode.impact}</Field>
                  <Field label="Mitigation">{mode.mitigation}</Field>
                  <Field label="Detection">{mode.detection}</Field>
                </dl>
              </div>
            ))}
          </div>
        </Section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Section title="Data stores" empty={design.data_stores.length === 0}>
            <dl className="space-y-3">
              {design.data_stores.map((store, index) => (
                <div key={`${index}-${store.name}`}>
                  <dt className="text-sm font-medium">
                    {store.name}{' '}
                    <span className="font-normal" style={{ color: 'var(--text-muted)' }}>
                      · {store.kind}
                    </span>
                  </dt>
                  <dd className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {store.holds}
                    {store.why && (
                      <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>
                        {store.why}
                      </span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section title="Reliability patterns" empty={design.reliability.length === 0}>
            <dl className="space-y-3">
              {design.reliability.map((pattern, index) => (
                <div key={`${index}-${pattern.pattern}`}>
                  <dt className="text-sm font-medium">
                    {pattern.pattern}
                    {pattern.where && (
                      <span className="font-normal" style={{ color: 'var(--text-muted)' }}>
                        {' '}
                        · {pattern.where}
                      </span>
                    )}
                  </dt>
                  <dd className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {pattern.why}
                  </dd>
                </div>
              ))}
            </dl>
          </Section>
        </div>

        <Section title="Service level objectives" empty={design.slos.length === 0}>
          <div className="flex flex-wrap gap-3">
            {design.slos.map((slo, index) => (
              <div
                key={`${index}-${slo.name}`}
                className="rounded-md border px-3 py-2"
                style={{ borderColor: 'var(--border)' }}
              >
                <span className="block text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  {slo.name}
                </span>
                <span className="text-sm font-medium">{slo.target}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="Scaling plan"
          hint="What to change, and the number that tells you it is time."
          empty={design.scaling_stages.length === 0}
        >
          <ol className="relative space-y-4 border-l pl-5" style={{ borderColor: 'var(--border)' }}>
            {design.scaling_stages.map((stage, index) => (
              <li key={`${index}-${stage.stage}`} className="relative">
                <span
                  className="absolute -left-[1.6rem] top-1 h-3 w-3 rounded-full"
                  style={{ backgroundColor: 'var(--accent)' }}
                />
                <p className="text-sm font-medium">{stage.stage}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  When: {stage.trigger}
                </p>
                <p className="mt-0.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {stage.changes}
                </p>
              </li>
            ))}
          </ol>
        </Section>

        <Section title="Trade-offs" empty={design.tradeoffs.length === 0}>
          <div className="space-y-3">
            {design.tradeoffs.map((tradeoff, index) => (
              <div key={`${index}-${tradeoff.decision}`} className="text-sm">
                <p className="font-medium">{tradeoff.decision}</p>
                <p style={{ color: 'var(--text-secondary)' }}>
                  <span style={{ color: 'var(--success)' }}>Chose</span> {tradeoff.chosen}
                  {tradeoff.alternative && (
                    <>
                      {' '}
                      <span style={{ color: 'var(--text-muted)' }}>over</span> {tradeoff.alternative}
                    </>
                  )}
                </p>
                {tradeoff.why && (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {tradeoff.why}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Section title="Security" empty={design.security.length === 0}>
            <Bullets items={design.security} />
          </Section>
          <Section title="Observability" empty={design.observability.length === 0}>
            <Bullets items={design.observability} />
          </Section>
          <Section title="Risks" empty={design.risks.length === 0}>
            <Bullets items={design.risks} />
          </Section>
        </div>

        <Section title="First milestones" empty={design.first_milestones.length === 0}>
          <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed">
            {design.first_milestones.map((milestone, index) => (
              <li key={`${index}-${milestone}`}>{milestone}</li>
            ))}
          </ol>
        </Section>

        <section className="card-flat p-4 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
              <ListChecks className="h-5 w-5" style={{ color: 'var(--accent)' }} />
              Production readiness
            </h2>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {ready}/{design.readiness_checklist.length} ready
            </span>
          </div>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
            Sized to your scale and priorities. Not generated: this list is the same every time and
            true every time.
          </p>
          <ul className="mt-3 space-y-1">
            {design.readiness_checklist.map((item) => (
              <li key={item.id}>
                <label className="flex cursor-pointer gap-3 rounded-md p-2 transition hover:bg-[var(--bg-hover)]">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
                    checked={done[item.id] ?? false}
                    onChange={() => toggle(item.id)}
                  />
                  <span>
                    <span
                      className="block text-sm"
                      style={{
                        color: done[item.id] ? 'var(--text-muted)' : 'var(--text-primary)',
                        textDecoration: done[item.id] ? 'line-through' : 'none',
                      }}
                    >
                      {item.item}
                    </span>
                    <span className="block text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {item.why}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AuthenticatedLayout>
  );
}
