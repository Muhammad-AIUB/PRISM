type Param = string | string[] | undefined;

/**
 * The query string for GET /repositories/:id/reviews, built only from values
 * that endpoint accepts. Anything else in the page's URL is left out, so the
 * API's defaults apply instead of its 422.
 */
export function reviewsQuery(params: { kind?: Param; page?: Param }): string {
  const query = new URLSearchParams();

  if (params.kind === 'prs' || params.kind === 'commits') {
    query.set('kind', params.kind);
  }

  // Six digits keeps it under the API's ceiling of 1,000,000.
  if (typeof params.page === 'string' && /^[1-9]\d{0,5}$/.test(params.page)) {
    query.set('page', params.page);
  }

  const text = query.toString();

  return text ? `?${text}` : '';
}
