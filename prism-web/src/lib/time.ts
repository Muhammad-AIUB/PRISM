/**
 * Port of the `relative()` helper the Inertia pages used.
 *
 * Deliberately not Intl.RelativeTimeFormat: the thresholds and wording here
 * ("just now", "3m ago", "2d ago", then a plain date) are what the tables show
 * today, and switching formatter would change every timestamp on screen.
 */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) {
    return 'just now';
  }

  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m ago`;
  }

  if (seconds < 86_400) {
    return `${Math.floor(seconds / 3600)}h ago`;
  }

  if (seconds < 604_800) {
    return `${Math.floor(seconds / 86_400)}d ago`;
  }

  return date.toLocaleDateString();
}
