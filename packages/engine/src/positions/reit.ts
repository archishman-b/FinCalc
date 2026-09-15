/**
 * REIT/InvIT holding Position — the module the brief calls "the credibility
 * marker": a distribution is not one number but four components (interest,
 * dividend, rental, return-of-capital), each taxed differently, with
 * return-of-capital reducing the cost of acquisition rather than being
 * taxed on receipt (until cumulative return-of-capital exceeds that cost
 * basis, at which point the excess is taxed as Other Sources — see
 * @fincalc/data's reit-distributions.ts for the exact rule and its
 * citations). NAV growth and distribution yield are deliberately modelled
 * as two independent MarketContext series — the brief's own words, "model
 * NAV growth separately from distribution yield" — so a volatile
 * (non-smooth) unit-price path and a separate yield assumption compose
 * freely rather than being derived from one blended CAGR.
 *
 * What this Position does NOT do, by design, matching the rest of Phase 3:
 * apply the household's actual marginal tax rate to the taxable components
 * (that needs the whole household's income and regime — a Phase 4 /
 * income-tax-engine concern), or apply exit LTCG when the holding is sold
 * (also Phase 4, using capital-gains.ts's `reit` rules and the cost basis
 * this Position tracks via `distributions()`). It emits the correct gross
 * cashIn and the correct taxable-by-head amount every month, and exposes
 * the running cost-basis/component breakdown for those later stages to use
 * — the same "raw stream now, aggregate computation later" split as every
 * other Position in this engine.
 */

import type { ReitDistributionRules } from '@fincalc/data';

import { compoundContributions } from '../compounding';
import type { LiquidityTier, MarketContext, Month, MonthlyRow, Position, SeriesId, TaxableByHead } from '../types';

export interface ReitComponentSplit {
  /** Fractions of the gross monthly distribution attributable to each component — must sum to 1 (within rounding tolerance). Real REITs' actual disclosed split varies filing to filing; this models the expected long-run mix, not a literal quarterly schedule. */
  interest: number;
  dividend: number;
  rental: number;
  returnOfCapital: number;
}

export interface ReitPositionInput {
  /** Capital allocated at month 1 — the initial cost of acquisition for basis-tracking (and, at Phase 4, exit CGT) purposes. */
  initialInvestment: number;
  /** Recurring monthly purchase beyond the initial investment (a REIT SIP), if any — each month's contribution adds to cost basis the same way the initial investment does. Defaults to none. */
  monthlyContribution?: (month: Month) => number;
  /** MarketContext series for unit-price/NAV growth — a flat rate, a bear/base/bull path, or (Phase 7) one Monte Carlo leg are all the same plug, and are never required to be a smooth CAGR. */
  navGrowthSeries: SeriesId;
  /** MarketContext series for the trailing annualised distribution yield — deliberately a separate series from navGrowthSeries. */
  distributionYieldSeries: SeriesId;
  componentSplit: ReitComponentSplit;
  /**
   * Whether the SPV backing this instrument opted into the concessional
   * corporate regime (Section 115BAA / new-Act Section 200) — only
   * consulted for an FY where the dividend exemption still depends on it
   * (see distributionRules.dividend.dependsOnSpvConcessionalRegimeElection;
   * from FY2026-27 this no longer matters at all — TOLA 2026). Per the
   * brief, a user-settable per-instrument flag with a conservative
   * default: true (assume opted in, i.e. dividend taxable, whenever the
   * election still matters) — the default that never understates tax.
   */
  spvOptedIntoConcessionalRegime?: boolean;
  /** Resolved by the caller from @fincalc/data's getReitDistributionRules(fy) — never hardcoded here. */
  distributionRules: ReitDistributionRules;
  /** 1 for a listed REIT/InvIT unit (sells in days) — see LiquidityTier. Defaults to 1. */
  liquidityTier?: LiquidityTier;
}

export interface ReitDistributionRow {
  month: Month;
  interest: number;
  dividend: number;
  rental: number;
  returnOfCapital: number;
  /** Portion of this month's returnOfCapital that exceeded the remaining cost basis and was therefore taxed immediately as Other Sources, rather than deferred into a larger gain at exit. */
  returnOfCapitalExcessTaxed: number;
  /** Running cost-of-acquisition balance after this month's return-of-capital is applied — what a Phase 4 exit-CGT calculation should use as the acquisition cost if the holding is sold at the end of this month. */
  costBasisRemaining: number;
  grossDistribution: number;
}

function validateSplit(split: ReitComponentSplit): void {
  const total = split.interest + split.dividend + split.rental + split.returnOfCapital;
  if (Math.abs(total - 1) > 1e-6) {
    throw new RangeError(`ReitComponentSplit must sum to 1, got ${total} (interest=${split.interest}, dividend=${split.dividend}, rental=${split.rental}, returnOfCapital=${split.returnOfCapital})`);
  }
  for (const [k, v] of Object.entries(split)) {
    if (v < 0) throw new RangeError(`ReitComponentSplit.${k} must be non-negative, got ${v}`);
  }
}

/** Whether the dividend component is taxable this month, per the resolved pack's rule and the per-instrument SPV-election flag — see the doc comment on ReitDistributionRules.dividend in @fincalc/data for the exact FY2025-26/FY2026-27 mechanics. */
function isDividendTaxable(rules: ReitDistributionRules['dividend'], spvOptedIn: boolean): boolean {
  if (!rules.dependsOnSpvConcessionalRegimeElection) return false; // FY2026-27 onward: exempt regardless (TOLA 2026)
  return spvOptedIn && rules.taxableIfSpvOptedIntoConcessionalRegime;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function reitPosition(id: string, input: ReitPositionInput): ReitPosition {
  if (input.initialInvestment < 0) throw new RangeError(`reitPosition: initialInvestment must be non-negative, got ${input.initialInvestment}`);
  validateSplit(input.componentSplit);
  const spvOptedIn = input.spvOptedIntoConcessionalRegime ?? true; // conservative default: assume taxable
  const liquidityTier = input.liquidityTier ?? 1;
  const contribution = (month: Month): number => (month === 1 ? input.initialInvestment : 0) + (input.monthlyContribution?.(month) ?? 0);

  function distributions(months: number, ctx: MarketContext): ReitDistributionRow[] {
    const navRows = compoundContributions(contribution, (month) => ctx.rate(input.navGrowthSeries, month), months);
    let costBasis = 0;
    const rows: ReitDistributionRow[] = [];

    for (let month = 1; month <= months; month++) {
      costBasis += contribution(month);

      // Distribution yield is applied to the value held coming into this month — the prior
      // month's closing NAV, or the month-1 initial investment/contribution for month 1 itself
      // (a lumpsum deployed at the start of a month starts earning that month's yield).
      const holdingBase = month === 1 ? contribution(1) : navRows[month - 2]!.closingValue;
      const yieldRate = ctx.rate(input.distributionYieldSeries, month) / 12;
      const grossDistribution = round2(holdingBase * yieldRate);

      const interest = round2(grossDistribution * input.componentSplit.interest);
      const dividend = round2(grossDistribution * input.componentSplit.dividend);
      const rental = round2(grossDistribution * input.componentSplit.rental);
      const returnOfCapital = round2(grossDistribution - interest - dividend - rental); // remainder, so components sum exactly to grossDistribution

      const appliedToBasis = Math.min(returnOfCapital, Math.max(0, costBasis));
      const returnOfCapitalExcessTaxed = round2(returnOfCapital - appliedToBasis);
      costBasis = round2(costBasis - appliedToBasis);

      rows.push({ month, interest, dividend, rental, returnOfCapital, returnOfCapitalExcessTaxed, costBasisRemaining: costBasis, grossDistribution });
    }
    return rows;
  }

  return {
    id,
    kind: 'reit',
    distributions,
    project(months: number, ctx: MarketContext): MonthlyRow[] {
      const navRows = compoundContributions(contribution, (month) => ctx.rate(input.navGrowthSeries, month), months);
      const distRows = distributions(months, ctx);

      return distRows.map((d, i): MonthlyRow => {
        const taxableOtherSources = round2(
          d.interest + (isDividendTaxable(input.distributionRules.dividend, spvOptedIn) ? d.dividend : 0) + d.rental + d.returnOfCapitalExcessTaxed,
        );
        const taxable: TaxableByHead = taxableOtherSources !== 0 ? { other_sources: taxableOtherSources } : {};

        return {
          month: d.month,
          cashOut: round2(contribution(d.month)),
          cashIn: d.grossDistribution,
          taxable,
          assetValue: navRows[i]!.closingValue,
          liabilityBalance: 0,
          liquidityTier,
        };
      });
    },
  };
}

export interface ReitPosition extends Position {
  /** The raw four-component distribution breakdown and running cost-basis, for a Phase 4 exit-CGT calculation or an attribution waterfall — see the module doc comment for the project()/distributions() split. */
  distributions(months: number, ctx: MarketContext): ReitDistributionRow[];
}
