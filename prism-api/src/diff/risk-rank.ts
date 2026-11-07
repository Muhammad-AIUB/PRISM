import type { RiskAssessment } from './risk-radar';
import type { RiskRank } from './batch-pack';

/**
 * How early a file should be reviewed when the change is too big for the call
 * cap: the weight of every Risk Radar signal that names it, plus one per
 * reliability question that does. Risk Radar names files by their new path and
 * at most a handful per signal, so a renamed file or one outside the lists
 * ranks 0 and keeps diff order. That is accepted: the rank only decides who is
 * left out past the cap, and a tie keeps the diff's own order.
 */
export function riskRankOf(risk: RiskAssessment | null): RiskRank {
  const weight = new Map<string, number>();

  for (const signal of risk?.signals ?? []) {
    for (const path of signal.files) {
      weight.set(path, (weight.get(path) ?? 0) + signal.weight);
    }
  }

  for (const check of risk?.checklist ?? []) {
    for (const path of check.files) {
      weight.set(path, (weight.get(path) ?? 0) + 1);
    }
  }

  return (path) => weight.get(path) ?? 0;
}
