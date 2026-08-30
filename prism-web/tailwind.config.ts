import type { Config } from 'tailwindcss';
import defaultTheme from 'tailwindcss/defaultTheme';
import forms from '@tailwindcss/forms';

/**
 * Carried over from the Laravel app's tailwind.config.js unchanged apart from
 * `content`. The token names (bg-card, fg-muted, border-base, accent…) are used
 * throughout the ported pages, so renaming any of them would mean editing all
 * 40 of them.
 */
export default {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Inter var', ...defaultTheme.fontFamily.sans],
        mono: ['JetBrains Mono', ...defaultTheme.fontFamily.mono],
      },
      colors: {
        // Mapped to the CSS variables in globals.css so `bg-primary`,
        // `text-secondary` and friends respect light/dark theming.
        'bg-primary': 'var(--bg-primary)',
        'bg-secondary': 'var(--bg-secondary)',
        'bg-card': 'var(--bg-card)',
        'bg-hover': 'var(--bg-hover)',
        'fg-primary': 'var(--text-primary)',
        'fg-secondary': 'var(--text-secondary)',
        'fg-muted': 'var(--text-muted)',
        'border-base': 'var(--border)',
        'border-hover': 'var(--border-hover)',
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
        },
        success: 'var(--success)',
        warning: 'var(--warning)',
        danger: 'var(--danger)',
        info: 'var(--info)',
      },
      borderRadius: {
        'sm-token': 'var(--radius-sm)',
        'md-token': 'var(--radius-md)',
        'lg-token': 'var(--radius-lg)',
      },
    },
  },
  plugins: [forms],
} satisfies Config;
