import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ReviewIssue } from '@/lib/types';
import { VerdictPanel } from './parts';

function finding(overrides: Partial<ReviewIssue> = {}): ReviewIssue {
  return {
    file: 'src/app.ts',
    line: 12,
    severity: 'critical',
    comment: 'SQL built from user input',
    ...overrides,
  };
}

describe('VerdictPanel', () => {
  it('never presents not_reviewed as a pass', () => {
    const { container } = render(<VerdictPanel verdict="not_reviewed" findings={[]} />);

    expect(screen.getByText('Not reviewed')).toBeInTheDocument();
    expect(screen.getByText(/nothing was checked/)).toBeInTheDocument();
    // "0 findings" beside it would read as a clean result.
    expect(screen.queryByText(/findings?$/)).not.toBeInTheDocument();
    expect(screen.queryByText('Nothing found')).not.toBeInTheDocument();
    expect(container.innerHTML).not.toContain('var(--success)');
  });

  it('shows nothing_found as the pass, with its count', () => {
    render(<VerdictPanel verdict="nothing_found" findings={[]} />);

    expect(screen.getByText('Nothing found')).toBeInTheDocument();
    expect(screen.getByText('0 findings')).toBeInTheDocument();
  });

  it('renders nothing for reviews written before verdicts existed', () => {
    const { container } = render(<VerdictPanel />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows at most three findings, worst first as sent, and counts the rest', () => {
    const findings = [1, 2, 3, 4, 5].map((n) => finding({ comment: `Finding ${n}`, line: n }));

    render(<VerdictPanel verdict="blocking" findings={findings} />);

    expect(screen.getByText('Blocking')).toBeInTheDocument();
    expect(screen.getByText('5 findings')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      expect.stringContaining('Finding 1'),
      expect.stringContaining('Finding 2'),
      expect.stringContaining('Finding 3'),
    ]);
    expect(screen.getByText(/2 more findings/)).toBeInTheDocument();
  });
});
