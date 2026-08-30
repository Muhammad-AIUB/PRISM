'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * Port of the Inertia ThemeToggle.
 *
 * Rendered as a full-width `.menu-item` row rather than a bare icon: the
 * original was a small icon inside a container with `cursor: default`, which
 * read as broken because the hit area was tiny. The whole row is the target.
 *
 * The only value written to localStorage anywhere in PRism is this theme
 * string. Auth is an httpOnly cookie and never touches client storage.
 */
export default function ThemeToggle() {
  // Starts 'dark' to match the server-rendered <html class="dark">; the real
  // value is read in the effect, after hydration, so the markup cannot mismatch.
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setTheme(localStorage.getItem('prism-theme') === 'light' ? 'light' : 'dark');
    } catch {
      // Private mode or storage disabled: stay on the default.
    }

    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) {
      return;
    }

    const root = document.documentElement;

    root.classList.remove('light', 'dark');
    root.classList.add(theme);

    try {
      localStorage.setItem('prism-theme', theme);
    } catch {
      // Non-fatal: the theme still applies for this page view.
    }
  }, [theme, ready]);

  const Icon = theme === 'dark' ? Sun : Moon;

  return (
    <button
      type="button"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className="menu-item"
    >
      <Icon className="h-4 w-4" />
      <span className="flex-1 text-left">Theme</span>
      <span
        className="rounded-full px-2 py-0.5 text-xs font-medium"
        style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
      >
        {theme === 'dark' ? 'Dark' : 'Light'}
      </span>
    </button>
  );
}
