import type { Metadata, Viewport } from 'next';
import './globals.css';

const TITLE = 'PRism · AI Code Review';
const DESCRIPTION =
  'AI-powered code review for GitHub pull requests and commits. Get instant security, performance, and code-quality feedback on every PR — free, open-source, and self-hostable.';

export const metadata: Metadata = {
  // Needed to turn the relative OG image path into an absolute URL; without
  // it Next falls back to localhost and shares link previews nobody can load.
  metadataBase: new URL(process.env.APP_URL ?? 'http://localhost:3001'),
  title: { default: TITLE, template: '%s · PRism' },
  description: DESCRIPTION,
  icons: { icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }] },
  openGraph: {
    type: 'website',
    siteName: 'PRism',
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: '/og-image.svg',
        width: 1200,
        height: 630,
        alt: 'PRism — AI-powered code review',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/og-image.svg'],
  },
};

export const viewport: Viewport = { themeColor: '#6366f1' };

/**
 * Applies the saved theme before first paint. Anything later — an effect, a
 * client component — repaints after the browser has already shown the default,
 * which is the flash of the wrong theme this exists to prevent.
 *
 * `prism-theme` ('light' | 'dark') is the only thing PRism puts in
 * localStorage. No tokens, no PII: the session is an httpOnly cookie.
 */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('prism-theme');var r=document.documentElement;r.classList.remove('light','dark');r.classList.add(t==='light'?'light':'dark');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
