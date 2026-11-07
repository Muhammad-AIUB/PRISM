import { riskRankOf } from './risk-rank';
import type { RiskAssessment } from './risk-radar';

const assessment = (): RiskAssessment =>
  ({
    level: 'high',
    score: 60,
    stats: { files: 3, additions: 1, deletions: 0, sourceFiles: 3, testFiles: 0 },
    signals: [
      { id: 'auth_touched', label: 'Auth', weight: 20, detail: '', files: ['auth.ts'] },
      { id: 'sql_touched', label: 'SQL', weight: 10, detail: '', files: ['auth.ts', 'db.ts'] },
    ],
    checklist: [{ id: 'timeouts', question: 'q', why: 'w', files: ['db.ts'] }],
  }) as unknown as RiskAssessment;

describe('riskRankOf', () => {
  it('sums signal weights and checklist hits per file', () => {
    const rank = riskRankOf(assessment());

    expect(rank('auth.ts')).toBe(30);
    expect(rank('db.ts')).toBe(11);
    expect(rank('readme.md')).toBe(0);
  });

  it('ranks everything 0 when the scan failed', () => {
    expect(riskRankOf(null)('auth.ts')).toBe(0);
  });
});
