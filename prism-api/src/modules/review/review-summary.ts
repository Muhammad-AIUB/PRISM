/**
 * Two facts about the review itself, folded into the text every surface shows.
 *
 * `reviews.summary` is rendered verbatim by the web views, the GitHub comment,
 * the PDF export, the MCP client, email and Slack. Writing here reaches all of
 * them at once, and needs no schema change and no new API field — which matters
 * on a database whose schema is applied by hand and whose response shapes are a
 * contract with clients that were deployed before this codebase existed.
 *
 * They lead rather than trail because a reader who stops after one line should
 * stop having read the caveat, not the verdict.
 */
export function composeSummary(
  modelSummary: string | null,
  coverage: string | null,
  dropped: number,
): string | null {
  const notes: string[] = [];

  if (coverage) {
    notes.push(coverage);
  }

  if (dropped > 0) {
    // Deliberately not phrased as "no issues". An empty result after validation
    // means we could not confirm what the model claimed, which is the opposite
    // message from a clean review and must not read like one.
    notes.push(
      dropped === 1
        ? '1 reported issue could not be traced to a changed line and was not shown.'
        : `${dropped} reported issues could not be traced to a changed line and were not shown.`,
    );
  }

  // PHP's `?:` treated an empty summary as absent, and the comment builder still
  // does. Same rule here so the two agree about what "no summary" means.
  const body = modelSummary && modelSummary.trim() !== '' ? modelSummary : null;

  if (notes.length === 0) {
    return body;
  }

  return body === null ? notes.join(' ') : `${notes.join(' ')}\n\n${body}`;
}
