/**
 * Shown while a page waits for prism-api. Without it the browser shows a blank
 * page for the whole wait, which on a cold start is long enough to look broken.
 */
export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen items-center justify-center px-4"
    >
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        Loading…
      </p>
    </div>
  );
}
