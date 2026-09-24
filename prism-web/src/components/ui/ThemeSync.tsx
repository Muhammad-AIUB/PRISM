'use client';

import { useLayoutEffect } from 'react';

/**
 * Re-applies the saved theme after React has rendered <html> itself.
 *
 * The inline script in layout.tsx sets the class before first paint. That is
 * enough for a normal page, which hydrates and leaves the attribute alone. But
 * when a page calls notFound() or throws, React renders the root layout on the
 * client instead of hydrating it, writes className="dark" from the JSX, and a
 * light-theme user gets a dark error page. This runs after that render,
 * before paint, and puts the saved theme back.
 */
export default function ThemeSync() {
  useLayoutEffect(() => {
    try {
      const theme = localStorage.getItem('prism-theme') === 'light' ? 'light' : 'dark';
      const root = document.documentElement;

      if (!root.classList.contains(theme)) {
        root.classList.remove('light', 'dark');
        root.classList.add(theme);
      }
    } catch {
      // Storage disabled: the server default stands.
    }
  }, []);

  return null;
}
