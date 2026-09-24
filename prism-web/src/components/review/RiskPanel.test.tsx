import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RiskAssessment, RiskBasis } from '@/lib/types';
import RiskPanel from './RiskPanel';

vi.mock('@/app/reviews/actions', () => ({ loadRisk: vi.fn() }));

const { loadRisk } = await import('@/app/reviews/actions');
const loadRiskMock = vi.mocked(loadRisk);

function assessment(overrides: Partial<RiskAssessment> = {}): RiskAssessment {
  return {
    level: 'high',
    score: 72,
    stats: { files: 4, additions: 120, deletions: 8, sourceFiles: 3, testFiles: 1 },
    signals: [
      { id: 'auth', label: 'Touches authentication', weight: 30, detail: 'Auth code', files: ['auth.ts'] },
    ],
    checklist: [
      { id: 'rollback', question: 'Can this be rolled back?', why: 'Migrations', files: [] },
      { id: 'tests', question: 'Is the new path tested?', why: 'No tests', files: [] },
    ],
    ...overrides,
  };
}

function resolveWith(risk: RiskAssessment, basis: RiskBasis = 'reviewed') {
  loadRiskMock.mockResolvedValue({ risk, basis, error: null });
}

beforeEach(() => {
  loadRiskMock.mockReset();
});

describe('RiskPanel', () => {
  it('says risk is unavailable when the server action rejects, instead of loading forever', async () => {
    loadRiskMock.mockRejectedValue(new TypeError('Failed to fetch'));

    render(<RiskPanel kind="pull-request" id={1} revision="a" />);

    expect(screen.getByText(/Assessing change risk/)).toBeInTheDocument();
    expect(
      await screen.findByText('Change risk unavailable: could not reach the server'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Assessing change risk/)).not.toBeInTheDocument();
  });

  it('shows the error the action returned when there is no assessment', async () => {
    loadRiskMock.mockResolvedValue({ risk: null, basis: null, error: 'GitHub is unavailable' });

    render(<RiskPanel kind="commit" id={9} revision="a" />);

    expect(
      await screen.findByText('Change risk unavailable: GitHub is unavailable'),
    ).toBeInTheDocument();
    expect(loadRiskMock).toHaveBeenCalledWith('commit', 9);
  });

  it('renders the level and score', async () => {
    resolveWith(assessment());

    render(<RiskPanel kind="pull-request" id={1} revision="a" />);

    expect(await screen.findByText('High risk')).toBeInTheDocument();
    expect(screen.getByText('72/100')).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Change risk score' })).toHaveAttribute(
      'aria-valuenow',
      '72',
    );
    expect(screen.queryByText(/current head/)).not.toBeInTheDocument();
  });

  it('warns when the assessment is of the current head, not the reviewed diff', async () => {
    resolveWith(assessment({ level: 'low', score: 10 }), 'current');

    render(<RiskPanel kind="pull-request" id={1} revision="a" />);

    expect(await screen.findByText('Low risk')).toBeInTheDocument();
    expect(screen.getByText(/Assessed against the pull request.s current head/)).toBeInTheDocument();
  });

  it('resets the checklist when the revision changes', async () => {
    const user = userEvent.setup();
    resolveWith(assessment());

    const { rerender } = render(<RiskPanel kind="pull-request" id={1} revision="a" />);
    const box = await screen.findByRole('checkbox', { name: /Can this be rolled back/ });

    await user.click(box);
    expect(box).toBeChecked();
    expect(screen.getByText('1/2')).toBeInTheDocument();

    rerender(<RiskPanel kind="pull-request" id={1} revision="b" />);

    const fresh = await screen.findByRole('checkbox', { name: /Can this be rolled back/ });
    expect(fresh).not.toBeChecked();
    expect(screen.getByText('0/2')).toBeInTheDocument();
    expect(loadRiskMock).toHaveBeenCalledTimes(2);
  });

  it('ignores a result that arrives after the revision moved on', async () => {
    let resolveStale: (value: Awaited<ReturnType<typeof loadRisk>>) => void = () => {};
    loadRiskMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStale = resolve;
      }),
    );
    resolveWith(assessment({ level: 'medium', score: 40 }));

    const { rerender } = render(<RiskPanel kind="pull-request" id={1} revision="a" />);
    rerender(<RiskPanel kind="pull-request" id={1} revision="b" />);

    expect(await screen.findByText('Medium risk')).toBeInTheDocument();

    await act(async () => {
      resolveStale({ risk: assessment({ level: 'high', score: 90 }), basis: 'reviewed', error: null });
    });

    expect(screen.getByText('Medium risk')).toBeInTheDocument();
    expect(screen.queryByText('High risk')).not.toBeInTheDocument();
  });
});
