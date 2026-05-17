import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * Light/dark theme toggle. Persists preference in localStorage and applies
 * the corresponding class to <html>. Defaults to dark when unset.
 *
 * Renders as a full-width row using the `.menu-item` class so it can sit
 * directly inside a dropdown menu and be clicked from anywhere on the row
 * (not just the tiny icon — that was the cause of the "toggle not working"
 * report: parent had `cursor: default` and the icon was hard to hit).
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

    const toggle = () => setTheme(theme === 'dark' ? 'light' : 'dark');
    const Icon   = theme === 'dark' ? Sun : Moon;
    const label  = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

    return (
        <button
            type="button"
            onClick={toggle}
            aria-label={label}
            className="menu-item"
        >
            <Icon className="h-4 w-4" />
            <span className="flex-1 text-left">Theme</span>
            <span
                className="rounded-full px-2 py-0.5 text-xs font-medium"
                style={{
                    backgroundColor: 'var(--bg-hover)',
                    color: 'var(--text-secondary)',
                }}
            >
                {theme === 'dark' ? 'Dark' : 'Light'}
            </span>
        </button>
    );
}
