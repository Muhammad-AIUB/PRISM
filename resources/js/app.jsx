import '../css/app.css';
import './bootstrap';

import { createInertiaApp } from '@inertiajs/react';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { createRoot } from 'react-dom/client';

const appName = import.meta.env.VITE_APP_NAME || 'PRism';

createInertiaApp({
    title: (title) => {
        if (!title) return appName;
        // Don't append the app name if the page title already mentions it
        // (avoids "Sign in to PRism - PRism" duplication).
        return title.toLowerCase().includes(appName.toLowerCase())
            ? title
            : `${title} · ${appName}`;
    },
    resolve: (name) =>
        resolvePageComponent(
            `./Pages/${name}.jsx`,
            import.meta.glob('./Pages/**/*.jsx'),
        ),
    setup({ el, App, props }) {
        const root = createRoot(el);

        root.render(<App {...props} />);
    },
    progress: {
        color: '#4B5563',
    },
});
