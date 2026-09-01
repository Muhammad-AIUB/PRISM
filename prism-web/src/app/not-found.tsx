import Link from 'next/link';

/**
 * Shown for a review, commit or repository that does not exist — or that
 * belongs to someone else. See apiGetAuthed for why 403 lands here too.
 */
export default function NotFound() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center p-6 text-center"
      style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
    >
      <p
        className="font-mono text-sm uppercase tracking-widest"
        style={{ color: 'var(--text-muted)' }}
      >
        404
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Not found</h1>
      <p className="mt-2 max-w-md text-sm" style={{ color: 'var(--text-secondary)' }}>
        This page does not exist, or it belongs to another account.
      </p>
      <Link href="/dashboard" className="btn btn-primary mt-6 min-h-[44px]">
        Back to dashboard
      </Link>
    </div>
  );
}
