import type { ReviewStatus } from '@/lib/types';

/**
 * The status and score chips used across the dashboard, review and commit
 * screens. Thresholds match the rest of the app: above 70 is green, 40 and up
 * amber, below that red — the same split the PDF export and the Slack colour
 * use.
 */
const STATUS: Record<string, { label: string; color: string; pulse?: boolean }> = {
  pending: { label: 'Pending', color: 'var(--warning)' },
  analyzing: { label: 'Analyzing', color: 'var(--info)', pulse: true },
  completed: { label: 'Completed', color: 'var(--success)' },
  failed: { label: 'Failed', color: 'var(--danger)' },
};

export function StatusPill({ status }: { status: ReviewStatus | string }) {
  const entry = STATUS[status] ?? { label: status, color: 'var(--text-muted)' };

  return (
    <span
      className="inline-flex items-center gap-2 text-xs font-medium"
      style={{ color: 'var(--text-primary)' }}
    >
      {entry.pulse ? (
        <span className="pulse-dot" />
      ) : (
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: entry.color }}
        />
      )}
      {entry.label}
    </span>
  );
}

export function scoreColor(score: number): string {
  if (score > 70) {
    return 'var(--success)';
  }

  return score >= 40 ? 'var(--warning)' : 'var(--danger)';
}

export function ScorePill({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) {
    return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  }

  const color = scoreColor(score);

  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 font-mono text-xs font-semibold"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 28%, transparent)`,
      }}
    >
      {score}
    </span>
  );
}

/** GitHub serves an avatar for any login at /{login}.png — no API call needed. */
export function AuthorAvatar({ login }: { login: string | null | undefined }) {
  if (!login) {
    return null;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://github.com/${login}.png?size=40`}
      alt={login}
      className="h-6 w-6 rounded-full ring-1"
      style={{ ['--tw-ring-color' as string]: 'var(--border)' }}
      loading="lazy"
    />
  );
}
