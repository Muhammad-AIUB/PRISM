import { useEffect, useState } from 'react';

/**
 * Light/dark theme toggle. Persists preference in localStorage and applies
 * the corresponding class to <html>. Defaults to dark when unset.
 *
 * SECURITY: The only value PRism writes to localStorage is the theme string
 * ('light' | 'dark'). No tokens, no PII, no auth data is ever stored
 * client-side. Auth lives in HTTP-only cookies managed by Laravel.
 */
export default function ThemeToggle() {
    const [theme, setTheme] = useState(() => {
        if (typeof window === 'undefined') return 'dark';
        // Safe: UI preference only, no PII or auth data.
        return localStorage.getItem('prism-theme') === 'light' ? 'light' : 'dark';
    });

    useEffect(() => {
        const root = document.documentElement;
        root.classList.remove('light', 'dark');
        root.classList.add(theme);
        // Safe: UI preference only, no PII or auth data.
        localStorage.setItem('prism-theme', theme);
    }, [theme]);

    return (
        <button
            type="button"
            aria-label="Toggle theme"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="rounded-btn p-2 text-ink-dim hover:bg-ink-card hover:text-ink-text"
        >
            {theme === 'dark' ? (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="4"/>
                    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
                </svg>
            ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
            )}
        </button>
    );
}
