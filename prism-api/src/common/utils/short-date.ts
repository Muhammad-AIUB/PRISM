const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Carbon's format('M d, Y') — "Aug 30, 2026".
 *
 * Used on the Security → My Data screen, which shows dates to people rather
 * than to machines. Note the zero-padded day: PHP's `d` is 2-digit, so the 5th
 * renders as "05", not "5".
 *
 * Formatted in UTC, matching Laravel's app timezone.
 */
export function formatShortDate(date: Date | null | undefined): string | null {
  if (!date) {
    return null;
  }

  const day = String(date.getUTCDate()).padStart(2, '0');

  return `${MONTHS[date.getUTCMonth()]} ${day}, ${date.getUTCFullYear()}`;
}
