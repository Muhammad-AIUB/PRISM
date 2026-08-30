'use client';

import Link from 'next/link';
import { useState } from 'react';

/**
 * The collapsible "wondering about permissions?" panel on the sign-in screen.
 *
 * Worth keeping verbatim: it is the only place a visitor is told what the
 * `repo` scope will and will not be used for, and it is shown before they
 * authorise anything.
 */
export default function PermissionsDisclosure() {
  const [open, setOpen] = useState(false);

  const code = (text: string) => (
    <code
      className="rounded px-1 font-mono"
      style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)' }}
    >
      {text}
    </code>
  );

  return (
    <div
      className="mt-6 overflow-hidden rounded-md transition"
      style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition hover:bg-hover"
      >
        <span className="flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <span aria-hidden>🔒</span> Wondering about permissions?
        </span>
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5 transition-transform"
          style={{
            color: 'var(--text-muted)',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {/* grid-template-rows 0fr → 1fr animates height without a fixed value. */}
      <div
        className="grid transition-all duration-300 ease-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div
            className="border-t px-3 py-3 text-[12px] leading-relaxed"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            <p>
              PRism asks for {code('repo')} + {code('read:user')}.
            </p>
            <ul className="mt-2 space-y-1">
              <li>
                <span style={{ color: 'var(--success)' }}>✓</span> Install a webhook on the
                repos you choose
              </li>
              <li>
                <span style={{ color: 'var(--success)' }}>✓</span> Read PR diffs &amp; post
                review comments
              </li>
              <li>
                <span style={{ color: 'var(--danger)' }}>✗</span> We never push code or modify
                files
              </li>
              <li>
                <span style={{ color: 'var(--danger)' }}>✗</span> Your source code is never
                stored
              </li>
            </ul>
            <p className="mt-2">
              Read our full{' '}
              <Link
                href="/security"
                className="font-semibold underline-offset-2 hover:underline"
                style={{ color: 'var(--accent)' }}
              >
                Security &amp; Privacy
              </Link>{' '}
              policy before you sign in.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
