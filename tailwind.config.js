import defaultTheme from 'tailwindcss/defaultTheme';
import forms from '@tailwindcss/forms';

/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class',
    content: [
        './vendor/laravel/framework/src/Illuminate/Pagination/resources/views/*.blade.php',
        './storage/framework/views/*.php',
        './resources/views/**/*.blade.php',
        './resources/js/**/*.jsx',
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'Inter var', ...defaultTheme.fontFamily.sans],
                mono: ['JetBrains Mono', ...defaultTheme.fontFamily.mono],
            },
            colors: {
                // Map Tailwind tokens to the CSS variables so `bg-primary`,
                // `text-secondary`, etc. respect light/dark theming.
                'bg-primary':   'var(--bg-primary)',
                'bg-secondary': 'var(--bg-secondary)',
                'bg-card':      'var(--bg-card)',
                'bg-hover':     'var(--bg-hover)',
                'fg-primary':   'var(--text-primary)',
                'fg-secondary': 'var(--text-secondary)',
                'fg-muted':     'var(--text-muted)',
                'border-base':  'var(--border)',
                'border-hover': 'var(--border-hover)',
                accent: {
                    DEFAULT: 'var(--accent)',
                    hover:   'var(--accent-hover)',
                },
                success: 'var(--success)',
                warning: 'var(--warning)',
                danger:  'var(--danger)',
                info:    'var(--info)',
            },
            borderRadius: {
                'sm-token': 'var(--radius-sm)',
                'md-token': 'var(--radius-md)',
                'lg-token': 'var(--radius-lg)',
            },
        },
    },
    plugins: [forms],
};
