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
            },
            colors: {
                brand: {
                    50:  '#eef2ff',
                    100: '#e0e7ff',
                    200: '#c7d2fe',
                    300: '#a5b4fc',
                    400: '#818cf8',
                    500: '#6366f1',
                    600: '#4f46e5',
                    700: '#4338ca',
                    800: '#3730a3',
                    900: '#312e81',
                },
                ink: {
                    bg:     '#0f0f13',
                    card:   '#1a1a24',
                    border: '#262635',
                    muted:  '#2d2d3d',
                    text:   '#e2e8f0',
                    dim:    '#94a3b8',
                    faint:  '#64748b',
                },
                ok:   '#22c55e',
                warn: '#f59e0b',
                bad:  '#ef4444',
            },
            borderRadius: {
                card: '8px',
                btn:  '6px',
            },
            boxShadow: {
                card: '0 1px 2px 0 rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04)',
                glow: '0 0 0 3px rgba(99,102,241,0.25)',
            },
            keyframes: {
                'fade-in':  { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
                'score-in': { '0%': { transform: 'scale(0.6)', opacity: 0 }, '100%': { transform: 'scale(1)', opacity: 1 } },
            },
            animation: {
                'fade-in':  'fade-in 200ms ease-out',
                'score-in': 'score-in 400ms cubic-bezier(0.16, 1, 0.3, 1)',
            },
        },
    },
    plugins: [forms],
};
