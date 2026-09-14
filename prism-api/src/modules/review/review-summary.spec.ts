import { composeSummary } from './review-summary';

/**
 * What the reader is told about the review itself, as opposed to about the code.
 *
 * Two facts have nowhere else to live. A partial review must say it is partial,
 * or a developer reads a confident verdict on a PR whose second half was never
 * opened. And when validation drops every finding, an empty result must not
 * read as a clean bill of health: "we found nothing" and "we could not confirm
 * anything we found" are opposite messages.
 *
 * They go in `reviews.summary` because that column is already rendered verbatim
 * by every surface — the web views, the GitHub comment, the PDF, the MCP client,
 * email and Slack. One write reaches all of them.
 */
describe('composeSummary', () => {
  it('leaves a clean full review exactly as the model wrote it', () => {
    expect(composeSummary('Looks good overall.', null, 0)).toBe('Looks good overall.');
  });

  it('leads with coverage when part of the diff was not reviewed', () => {
    expect(composeSummary('Looks good.', 'Reviewed 3 of 9 changed files.', 0)).toBe(
      'Reviewed 3 of 9 changed files.\n\nLooks good.',
    );
  });

  it('says when findings were discarded as unverifiable', () => {
    const summary = composeSummary('Looks good.', null, 4);

    expect(summary).toContain('4');
    expect(summary).toMatch(/could not|not be/i);
    expect(summary).toContain('Looks good.');
  });

  it('reports both facts when both apply', () => {
    const summary = composeSummary('Fine.', 'Reviewed 1 of 5 changed files.', 2);

    expect(summary).toContain('Reviewed 1 of 5 changed files.');
    expect(summary).toContain('2');
    expect(summary?.endsWith('Fine.')).toBe(true);
  });

  it('still carries the notes when the model wrote no summary', () => {
    expect(composeSummary(null, 'Reviewed 1 of 5 changed files.', 0)).toBe(
      'Reviewed 1 of 5 changed files.',
    );
  });

  it('stays null when there is nothing at all to say', () => {
    expect(composeSummary(null, null, 0)).toBeNull();
  });

  it('treats an empty model summary as absent, the way the comment builder does', () => {
    expect(composeSummary('', null, 0)).toBeNull();
  });
});
