'use client';

import { useEffect } from 'react';

/**
 * Last-resort boundary. Next strips the message in production builds, so this
 * shows a fixed line rather than pretending to explain what went wrong — the
 * cases we can explain (401, 403, 404) are handled in apiGetAuthed before they
 * ever reach here.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center p-6 text-center"
      style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
    >
      <p
        className="font-mono text-sm uppercase tracking-widest"
        style={{ color: 'var(--danger)' }}
      >
        Error
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="mt-2 max-w-md text-sm" style={{ color: 'var(--text-secondary)' }}>
        The page could not be loaded. Trying again often works.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
          {error.digest}
        </p>
      )}
      <button type="button" onClick={reset} className="btn btn-primary mt-6 min-h-[44px]">
        Try again
      </button>
    </div>
  );
}
