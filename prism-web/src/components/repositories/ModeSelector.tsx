'use client';

import { GitCommit, GitPullRequest, Settings as SettingsIcon } from 'lucide-react';
import type { ComponentType } from 'react';

/**
 * The review-mode radio group, shared by the connect modal and the settings
 * screen. Those two screens carry slightly different descriptions — the modal
 * explains the choice to someone seeing it for the first time, settings just
 * reminds them — so the copy is passed in rather than hardcoded here.
 */
export interface ModeOption {
  value: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  sub: string;
}

/** Wording from Repositories/Index.jsx's connect modal. */
export const CONNECT_MODE_OPTIONS: ModeOption[] = [
  {
    value: 'pr_only',
    icon: GitPullRequest,
    title: 'Pull Requests only',
    sub: 'Recommended for teams. Reviews fire when a PR is opened or updated.',
  },
  {
    value: 'commit_only',
    icon: GitCommit,
    title: 'Direct commits to main/master',
    sub: 'For solo developers. Reviews fire on every push to your watched branches.',
  },
  {
    value: 'both',
    icon: SettingsIcon,
    title: 'Both PRs and commits',
    sub: 'Maximum coverage. Reviews both events.',
  },
];

/** Wording from Repositories/Settings.jsx. */
export const SETTINGS_MODE_OPTIONS: ModeOption[] = [
  {
    value: 'pr_only',
    icon: GitPullRequest,
    title: 'Pull Requests only',
    sub: 'Recommended for teams.',
  },
  {
    value: 'commit_only',
    icon: GitCommit,
    title: 'Direct commits to main/master',
    sub: 'For solo developers.',
  },
  {
    value: 'both',
    icon: SettingsIcon,
    title: 'Both PRs and commits',
    sub: 'Maximum coverage.',
  },
];

export default function ModeSelector({
  options,
  value,
  onChange,
}: {
  options: ModeOption[];
  value: string;
  onChange: (mode: string) => void;
}) {
  return (
    <div className="space-y-2">
      {options.map(({ value: option, icon: Icon, title, sub }) => {
        const active = value === option;

        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className="flex w-full items-start gap-3 rounded-md p-3 text-left transition active:scale-[0.99]"
            style={{
              backgroundColor: active ? 'rgba(99,102,241,0.10)' : 'var(--bg-secondary)',
              border: `1px solid ${active ? 'rgba(99,102,241,0.45)' : 'var(--border)'}`,
            }}
          >
            <span
              className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-md"
              style={{
                color: active ? 'var(--accent)' : 'var(--text-secondary)',
                backgroundColor: active ? 'rgba(99,102,241,0.15)' : 'var(--bg-hover)',
                border: '1px solid var(--border)',
              }}
            >
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span
                className="block text-sm font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                {title}
              </span>
              <span className="mt-0.5 block text-xs" style={{ color: 'var(--text-secondary)' }}>
                {sub}
              </span>
            </span>
            <span
              className="mt-1 h-4 w-4 shrink-0 rounded-full border-2 transition"
              style={{
                borderColor: active ? 'var(--accent)' : 'var(--border-hover)',
                backgroundColor: active ? 'var(--accent)' : 'transparent',
                boxShadow: active ? 'inset 0 0 0 3px var(--bg-card)' : 'none',
              }}
            />
          </button>
        );
      })}
    </div>
  );
}
