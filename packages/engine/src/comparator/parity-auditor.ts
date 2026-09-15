/**
 * Assumption Parity Auditor — brief §3: "runs automatically on every
 * comparison... the single most differentiating feature in the product."
 *
 * Most of what the brief's canonical failure case (§1A) calls out is
 * guaranteed by the Comparator's own construction rather than something
 * this module needs to detect after the fact: equal outflow and symmetric
 * reinvestment (defects #1, #6) are structural — every scenario's surplus
 * and net position income is swept into its own reinvestment vehicle by
 * comparator.ts's own mechanism, not something a Scenario builder could
 * forget. Annual accrual taxation (defect #6/principle 11) is likewise
 * structural — computeAnnualTax runs identically for every scenario.
 * Return-of-capital cost-basis tracking (defect #5) is correct by
 * construction because exit.ts's 'reit' treatment always reads
 * `ReitDistributionRow.costBasisRemaining`.
 *
 * What genuinely needs auditing — because it depends on what the Scenario
 * builder declared, not on the Comparator's mechanism — is exactly the
 * other two defects: asymmetric growth-rate assumptions (#2) and omitted
 * transaction-cost/capital-gains modelling (#4).
 */

import type { MarketContext, SeriesId } from '../types';

import type { GrowthAssumption, ParityWarning, Scenario } from './types';

function round2Pct(value: number): number {
  return Math.round(value * 10000) / 100; // percentage points, 2dp
}

/** Average annualised rate for a series across evenly-spaced sample months over the horizon — fair to a flat rate, a bear/base/bull step path, or a Monte Carlo leg alike. */
export function effectiveAnnualRate(ctx: MarketContext, seriesId: SeriesId, horizonMonths: number): number {
  const sampleCount = Math.min(12, horizonMonths);
  const step = Math.max(1, Math.floor(horizonMonths / sampleCount));
  let sum = 0;
  let count = 0;
  for (let month = 1; month <= horizonMonths; month += step) {
    sum += ctx.rate(seriesId, month);
    count++;
  }
  return count > 0 ? sum / count : 0;
}

function pairKey(a: SeriesId, b: SeriesId): string {
  return [a, b].sort().join('::');
}

export function checkGrowthRateSymmetry(
  scenarios: readonly Scenario[],
  ctx: MarketContext,
  horizonMonths: number,
  thresholdPct: number,
  acknowledged: readonly (readonly [SeriesId, SeriesId])[],
): ParityWarning[] {
  const acknowledgedKeys = new Set(acknowledged.map(([a, b]) => pairKey(a, b)));
  const entries: Array<{ scenario: Scenario; assumption: GrowthAssumption; rate: number }> = [];
  for (const scenario of scenarios) {
    for (const assumption of scenario.growthAssumptions ?? []) {
      entries.push({ scenario, assumption, rate: effectiveAnnualRate(ctx, assumption.seriesId, horizonMonths) });
    }
  }

  const warnings: ParityWarning[] = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i]!;
      const b = entries[j]!;
      if (a.scenario.id === b.scenario.id) continue; // only cross-scenario comparisons are asymmetry risks
      if (acknowledgedKeys.has(pairKey(a.assumption.seriesId, b.assumption.seriesId))) continue;
      const diff = Math.abs(a.rate - b.rate);
      if (diff > thresholdPct) {
        warnings.push({
          kind: 'growth_asymmetry',
          message:
            `"${a.assumption.label}" (${a.scenario.name}) assumes ${round2Pct(a.rate)}% p.a. vs ` +
            `"${b.assumption.label}" (${b.scenario.name}) at ${round2Pct(b.rate)}% p.a. — a ${round2Pct(diff)}pp gap with no ` +
            `acknowledged reason. If this is intentional (different asset classes with genuinely different expected ` +
            `returns), add the series pair to acknowledgedGrowthAsymmetries; otherwise the comparison may be measuring ` +
            `optimism rather than the assets themselves (brief principle 9).`,
        });
      }
    }
  }
  return warnings;
}

const REAL_ESTATE_KINDS = new Set(['owned_property', 'rented_property', 'plot']);
const MARKET_LINKED_KINDS = new Set(['sip', 'lumpsum']);

/** Flags a position whose kind clearly implies a real capital-gains route (real estate, REIT, SIP/lumpsum) but whose ExitConfig is missing or set to 'none' — exactly the shape of the brief's defect #4 (acquisition costs/capital gains omitted for one path but not another). */
export function checkExitTreatmentCompleteness(scenarios: readonly Scenario[]): ParityWarning[] {
  const warnings: ParityWarning[] = [];
  for (const scenario of scenarios) {
    const configByPositionId = new Map((scenario.exitConfigs ?? []).map((c) => [c.positionId, c]));
    for (const position of scenario.positions) {
      const config = configByPositionId.get(position.id);
      const treatment = config?.capitalGainsTreatment ?? 'none';
      const expectsRealTreatment =
        REAL_ESTATE_KINDS.has(position.kind) || position.kind === 'reit' || MARKET_LINKED_KINDS.has(position.kind);
      if (expectsRealTreatment && treatment === 'none') {
        warnings.push({
          kind: 'missing_exit_treatment',
          message:
            `${scenario.name}: position "${position.id}" (kind '${position.kind}') has no capital-gains exit treatment ` +
            `configured — its exit value will be reported gross of tax, understating the tax this scenario actually owes ` +
            `relative to any scenario in this comparison that does model its exit tax.`,
        });
      }
      if (REAL_ESTATE_KINDS.has(position.kind) && treatment === 'property' && !config?.costOfAcquisition) {
        warnings.push({
          kind: 'missing_exit_treatment',
          message:
            `${scenario.name}: position "${position.id}" is exited via the 'property' route but declares no ` +
            `costOfAcquisition — its capital gain will be computed against a ₹0 cost base, overstating its exit tax.`,
        });
      }
    }
  }
  return warnings;
}

export function runParityAuditor(
  scenarios: readonly Scenario[],
  ctx: MarketContext,
  horizonMonths: number,
  thresholdPct: number,
  acknowledged: readonly (readonly [SeriesId, SeriesId])[],
): ParityWarning[] {
  return [
    ...checkGrowthRateSymmetry(scenarios, ctx, horizonMonths, thresholdPct, acknowledged),
    ...checkExitTreatmentCompleteness(scenarios),
  ];
}
