import { GitCommit, GitPullRequest, Layers } from 'lucide-react';
import type { ComponentType } from 'react';

const MODE_BADGE: Record<
  string,
  { icon: ComponentType<{ className?: string }>; label: string; tone: string; color: string }
> = {
  pr_only: {
    icon: GitPullRequest,
    label: 'Pull Requests',
    tone: 'rgba(99,102,241,0.10)',
    color: 'var(--accent)',
  },
  commit_only: {
    icon: GitCommit,
    label: 'Commits',
    tone: 'rgba(59,130,246,0.10)',
    color: 'var(--info)',
  },
  both: { icon: Layers, label: 'Both', tone: 'rgba(34,197,94,0.10)', color: 'var(--success)' },
};

export default function ModeBadge({ mode }: { mode: string }) {
  const badge = MODE_BADGE[mode] ?? MODE_BADGE.pr_only!;
  const Icon = badge.icon;

  return (
    <span
      className="badge"
      style={{ backgroundColor: badge.tone, color: badge.color, borderColor: badge.color }}
      title={`Review mode: ${badge.label}`}
    >
      <Icon className="h-3 w-3" />
      {badge.label}
    </span>
  );
}
