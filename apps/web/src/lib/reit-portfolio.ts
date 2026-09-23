/**
 * Turns the REIT Portfolio Builder's form inputs (a lumpsum, a monthly SIP,
 * a 5-way weight split, and per-REIT forward yield/NAV-growth assumptions)
 * into 5 weighted `reitPosition()` legs and blends their monthly output into
 * one portfolio series — the same "UI inputs -> engine Positions" role
 * scenario-builder.ts plays for the Comparator, scoped to this one module.
 *
 * Deliberately NOT a `Scenario`/`compare()` run: this module doesn't model
 * exit capital-gains tax (selling the units) or fold into a household's
 * full annual income-tax computation — see ReitPortfolioBuilder.tsx's own
 * doc comment for that scope call. It shows distribution income (already
 * split and, where the FY's rules say so, taxable) plus mark-to-market NAV,
 * the direct analogue of "rental yield plus a house's paper appreciation."
 * Composing 5 positions' MonthlyRow streams by summing month-by-month is
 * the same thing `projectAllPositions` does inside the engine's own
 * comparator.ts, just without that module's tax/exit machinery attached.
 */
import {
  LATEST_SHIPPED_FY,
  reitPosition,
  type MarketContext,
  type MonthlyRow,
  type Provenance,
  type ReitComponentSplit,
  type ReitPosition,
  type SeriesId,
} from '@fincalc/engine';
import {
  computeHistoricalComponentSplit,
  getReitDistributionHistory,
  getReitDistributionRules,
  getReitInstruments,
  REIT_IDS,
  type ReitDistributionRecord,
  type ReitId,
  type ReitInstrument,
} from '@fincalc/data';

export { REIT_IDS };
export type { ReitId };

export interface ReitDisplayMeta {
  id: ReitId;
  shortLabel: string;
  /** Key into theme.ts's Palette — the 5 REITs cycle through the app's existing accent colors plus its two ink tones rather than inventing new hues. */
  colorKey: 'rust' | 'moss' | 'ochre' | 'ink' | 'inkMuted';
}

/** Display order and color assignment for the 5 REITs — stable across the weight allocator, the composition bar, and every chart legend. */
export const REIT_DISPLAY: readonly ReitDisplayMeta[] = [
  { id: 'embassy', shortLabel: 'Embassy', colorKey: 'rust' },
  { id: 'mindspace', shortLabel: 'Mindspace', colorKey: 'moss' },
  { id: 'brookfield', shortLabel: 'Brookfield', colorKey: 'ochre' },
  { id: 'nexus', shortLabel: 'Nexus', colorKey: 'ink' },
  { id: 'knowledge-realty', shortLabel: 'Knowledge Realty', colorKey: 'inkMuted' },
];

/** Equal-weight starting allocation — the least opinionated default, and the one the "Split evenly" reset returns to. */
export function equalWeights(): Record<ReitId, number> {
  const each = round1(100 / REIT_IDS.length);
  const weights = Object.fromEntries(REIT_IDS.map((id) => [id, each])) as Record<ReitId, number>;
  // Assign the rounding remainder to the first REIT so the total is exactly 100.
  const total = REIT_IDS.reduce((s, id) => s + weights[id], 0);
  weights[REIT_IDS[0]!] = round1(weights[REIT_IDS[0]!] + (100 - total));
  return weights;
}

export function sumWeights(weights: Record<ReitId, number>): number {
  return round1(REIT_IDS.reduce((s, id) => s + (weights[id] ?? 0), 0));
}

/** Whether the weights sum to 100% within a tolerance tight enough to catch a typo but loose enough to forgive one-decimal rounding across 5 fields. */
export function weightsAreValid(weights: Record<ReitId, number>): boolean {
  return Math.abs(sumWeights(weights) - 100) <= 0.2;
}

/**
 * A conservative forward NAV-growth default: the most recent trailing price
 * CAGR the instrument actually reports (3-year preferred as the least
 * noisy single window shorter than the full history, falling back to
 * 1-year then 5-year), haircut to `HAIRCUT_FACTOR` of that trailing figure.
 * Brief §3's own words: "the module's default forward blended total return
 * should sit below the historical average blend... the user must raise it
 * deliberately." A REIT with no CAGR on record at all (Knowledge Realty —
 * newly listed) falls back to `FALLBACK_NAV_GROWTH_PCT`, a deliberately
 * modest placeholder rather than borrowing another REIT's figure.
 */
const HAIRCUT_FACTOR = 0.75;
const FALLBACK_NAV_GROWTH_PCT = 0.05;

export function defaultNavGrowthPct(instrument: ReitInstrument): number {
  const trailing = instrument.priceCagr3y ?? instrument.priceCagr1y ?? instrument.priceCagr5y;
  const base = trailing ?? FALLBACK_NAV_GROWTH_PCT;
  return round3(base * HAIRCUT_FACTOR);
}

/** The default forward distribution-yield assumption: the midpoint of the instrument's own reported trailing yield range — already a current, not historical-peak, figure, so it isn't separately haircut the way price CAGR is. */
export function defaultYieldPct(instrument: ReitInstrument): number {
  return round3((instrument.distributionYieldRangeMinPct + instrument.distributionYieldRangeMaxPct) / 2);
}

/** The historical (all-time) four-component distribution split for a REIT, computed fresh from the shipped distribution-history records — never hardcoded. See reit-reference.ts's computeHistoricalComponentSplit for the "all-time, not trailing" rationale. */
export function defaultComponentSplit(reitId: ReitId, history: readonly ReitDistributionRecord[] = getReitDistributionHistory()): ReitComponentSplit {
  const split = computeHistoricalComponentSplit(history, reitId);
  return { interest: split.interest, dividend: split.dividend, rental: split.rental, returnOfCapital: split.returnOfCapital };
}

/**
 * A "wide" row of per-REIT, point-in-time distribution data: one row per
 * actual disclosure date across the requested REITs, with per-REIT keys
 * populated only for the REIT(s) that actually disclosed a distribution on
 * that exact date:
 *   `${reitId}_indexed`            — the indexed payout level (100 at the
 *                                     REIT's own FY2026-27 base record),
 *                                     what the chart's line actually plots
 *   `${reitId}_totalDpuInr`        — that payout, in rupees per unit, unindexed
 *   `${reitId}_priceInr`           — the unit's price on the record date
 *   `${reitId}_grossYieldPct`      — annualized gross (pre-tax) yield, %
 *   `${reitId}_postTaxYieldPct`    — annualized effective post-tax yield, %
 *                                     (both annualized, not the bare
 *                                     per-quarter figure, so the two are a
 *                                     fair pre-tax/post-tax comparison —
 *                                     annualizedYieldPct and
 *                                     effectivePostTaxYieldPct on the
 *                                     underlying record are both already
 *                                     annualized; grossQtrYieldPct is not
 *                                     used here for that reason)
 *   `${reitId}_interestInr` / `_dividendInr` / `_rentalInr` / `_returnOfCapitalInr`
 *                                   — the four-component rupee breakdown of
 *                                     that one payout (unindexed)
 * `date` is always present; every other key is dynamic, so this is typed
 * loosely rather than as a fixed shape — see reitIndexedDistributionSeries()'s
 * doc comment.
 */
export interface ReitIndexedDistributionRow {
  date: string;
  [key: string]: number | string;
}

/** India's fiscal year runs April to March — "start of FY2026-27" is 1 April 2026, the rebase date reitIndexedDistributionSeries() indexes every REIT to 100 against. */
const REBASE_ON_OR_AFTER = '2026-04-01';

/**
 * Per-REIT, point-in-time distribution history — one column per actual
 * disclosed payout date (not bucketed into calendar quarters or blended
 * across REITs), replacing historicalDistributionSeries (a prior revision
 * that blended all 5 REITs into one bucketed line) after explicit user
 * correction: the chart needed to show each selected REIT's own actual
 * payout events, at their own dates, individually — with the yield rate
 * alongside — and let the user choose which REIT(s) to look at.
 *
 * A REIT's indexed level (`${reitId}_indexed`) is that record's own total
 * distribution-per-unit (totalDpuInr) expressed against a common base:
 * that REIT's own total DPU at the first record on or after
 * REBASE_ON_OR_AFTER is set to index value 100, and every other record for
 * that REIT — before or after the base date — is (that record's total ÷
 * the base record's total) × 100. That's what makes REITs trading at very
 * different absolute unit prices (₹110 for Knowledge Realty vs ₹400+ for
 * Embassy) comparable on one shared scale: their payout *levels relative
 * to their own start* sit together, even though their rupee amounts never
 * would. Earlier quarters typically read below 100 (REIT payouts have
 * generally grown over time) — the full listed history is indexed and
 * returned, not just the months after the base date. For all 5 shipped
 * REITs the base record lands on each one's ~May 2026 disclosure, since
 * every REIT — including Knowledge Realty, listed Aug 2025 — already has a
 * record by then; a REIT with no record on/after REBASE_ON_OR_AFTER has no
 * defined base and is skipped entirely rather than dividing by zero.
 *
 * Everything else on the row (the rupee payout, unit price, both yield
 * %s, and the four-component rupee split) is carried unindexed, straight
 * from the record — it's tooltip/hover detail for one real disclosed
 * payout, not something that needs to sit on the shared indexed scale.
 */
export function reitIndexedDistributionSeries(
  reitIds: readonly ReitId[],
  history: readonly ReitDistributionRecord[] = getReitDistributionHistory(),
): readonly ReitIndexedDistributionRow[] {
  const byDate = new Map<string, ReitIndexedDistributionRow>();

  for (const reitId of reitIds) {
    const records = history.filter((r) => r.reitId === reitId).sort((a, b) => a.date.localeCompare(b.date));
    const base = records.find((r) => r.date >= REBASE_ON_OR_AFTER);
    if (!base || base.totalDpuInr <= 0) continue;

    for (const r of records) {
      const dividendInr = r.dividendExemptInr + r.dividendTaxableInr;
      const row: ReitIndexedDistributionRow = byDate.get(r.date) ?? { date: r.date };
      row[`${reitId}_indexed`] = round1((r.totalDpuInr / base.totalDpuInr) * 100);
      row[`${reitId}_totalDpuInr`] = round2(r.totalDpuInr);
      row[`${reitId}_priceInr`] = round2(r.recordPriceInr);
      row[`${reitId}_grossYieldPct`] = round3(r.annualizedYieldPct * 100);
      row[`${reitId}_postTaxYieldPct`] = round3(r.effectivePostTaxYieldPct * 100);
      row[`${reitId}_interestInr`] = round2(r.interestInr);
      row[`${reitId}_dividendInr`] = round2(dividendInr);
      row[`${reitId}_rentalInr`] = round2(r.otherIncomeInr);
      row[`${reitId}_returnOfCapitalInr`] = round2(r.debtRepaymentCapReturnInr);
      byDate.set(r.date, row);
    }
  }

  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export interface ReitAssumption {
  navGrowthPct: number;
  yieldPct: number;
}

/** Every REIT's default assumption bundle, seeded from the shipped reference data — the form's starting point before the user overrides anything. */
export function defaultAssumptions(): Record<ReitId, ReitAssumption> {
  const instruments = getReitInstruments();
  const byId = new Map(instruments.map((i) => [i.id, i]));
  return Object.fromEntries(
    REIT_IDS.map((id) => {
      const instrument = byId.get(id)!;
      return [id, { navGrowthPct: defaultNavGrowthPct(instrument), yieldPct: defaultYieldPct(instrument) }];
    }),
  ) as Record<ReitId, ReitAssumption>;
}

function resolveDistributionRules() {
  try {
    return getReitDistributionRules(currentFy());
  } catch {
    return getReitDistributionRules(LATEST_SHIPPED_FY);
  }
}

/** FY string (e.g. "2026-27") for the given date — India's fiscal year runs April to March. */
function currentFy(date: Date = new Date()): string {
  const y = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}
function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

export interface ReitPortfolioInput {
  lumpsum: number;
  monthlySip: number;
  /** Total months to project every leg forward — the evaluation horizon. NAV growth and distributions are simulated through this full length regardless of contributionMonths. */
  months: number;
  /**
   * Months during which the lumpsum + monthly SIP are actually contributed.
   * May be shorter than `months` — contributions stop, but each leg's NAV
   * keeps compounding and keeps paying distributions on what's already
   * invested, the same as a real REIT holding after you stop adding new
   * money (the ask behind letting contribution and evaluation horizons
   * differ: "I contribute for 15 years, but want to check the value in
   * year 20"). May also exceed `months` (an interim check partway through
   * an ongoing SIP) — `months` already caps how far anything is actually
   * simulated, so a contributionMonths beyond it is simply never reached.
   * Defaults to `months` (contribute for the whole horizon — prior
   * behaviour) when omitted.
   */
  contributionMonths?: number;
  weights: Record<ReitId, number>;
  assumptions: Record<ReitId, ReitAssumption>;
  componentSplits?: Partial<Record<ReitId, ReitComponentSplit>>;
  /** Per-instrument SPV-concessional-regime-election flag (brief §3: conservative default true, i.e. assume dividend taxable whenever the FY's rules still make that depend on the election). Applied uniformly across all 5 legs unless overridden. */
  spvOptedIntoConcessionalRegime?: boolean;
}

export interface ReitPortfolioLeg {
  reitId: ReitId;
  weightPct: number;
  allocatedLumpsum: number;
  allocatedMonthlySip: number;
  position: ReitPosition;
  navGrowthProvenance: Provenance;
  yieldProvenance: Provenance;
}

export interface ReitPortfolioResult {
  legs: readonly ReitPortfolioLeg[];
  /** One row per month, summed across all 5 legs. */
  rows: readonly MonthlyRow[];
  /** Cumulative invested vs. blended portfolio value, one point per year, plus that year's own gross distributions — feeds GrowthWithIncomeChart's dual-axis view (cumulative lines against annual distribution bars). */
  yearlyRows: readonly { year: number; invested: number; value: number; distributions: number }[];
  totalInvested: number;
  finalValue: number;
  /** Sum of every month's gross distribution across the whole horizon, all 5 legs. */
  totalGrossDistributions: number;
  /** The final year's gross distributions averaged to a monthly figure — the direct rental-yield-equivalent number: "what this portfolio would be paying out per month" at the selected horizon, in nominal (that year's) rupees. */
  monthlyIncomeAtHorizonNominal: number;
  /** The four-component split of totalGrossDistributions, blended across all 5 legs by how much each actually paid out (not by starting weight) — the true realised mix, not the target allocation. */
  blendedComponentTotals: { interest: number; dividend: number; rental: number; returnOfCapital: number };
}

/** Builds the 5 weighted REIT positions and projects+blends them into one portfolio result. Throws if `weights` doesn't sum to ~100% — callers should check `weightsAreValid` before calling this so the error surfaces as a form validation message, not an exception. */
export function buildReitPortfolio(input: ReitPortfolioInput): ReitPortfolioResult {
  if (!weightsAreValid(input.weights)) {
    throw new RangeError(`buildReitPortfolio: weights must sum to ~100%, got ${sumWeights(input.weights)}`);
  }
  const distributionRules = resolveDistributionRules();
  const history = getReitDistributionHistory();
  const contributionMonths = input.contributionMonths ?? input.months;

  const seriesRates = new Map<SeriesId, number>();
  const legs: ReitPortfolioLeg[] = REIT_IDS.map((reitId) => {
    const weightPct = input.weights[reitId] ?? 0;
    const fraction = weightPct / 100;
    const allocatedLumpsum = round2(input.lumpsum * fraction);
    const allocatedMonthlySip = round2(input.monthlySip * fraction);
    const assumption = input.assumptions[reitId];
    const navSeries: SeriesId = `reit.${reitId}.nav`;
    const yieldSeries: SeriesId = `reit.${reitId}.yield`;
    seriesRates.set(navSeries, assumption.navGrowthPct);
    seriesRates.set(yieldSeries, assumption.yieldPct);

    const position = reitPosition(reitId, {
      initialInvestment: allocatedLumpsum,
      ...(allocatedMonthlySip > 0 ? { monthlyContribution: (month: number) => (month <= contributionMonths ? allocatedMonthlySip : 0) } : {}),
      navGrowthSeries: navSeries,
      distributionYieldSeries: yieldSeries,
      componentSplit: input.componentSplits?.[reitId] ?? defaultComponentSplit(reitId, history),
      distributionRules,
      ...(input.spvOptedIntoConcessionalRegime !== undefined ? { spvOptedIntoConcessionalRegime: input.spvOptedIntoConcessionalRegime } : {}),
      liquidityTier: 1,
    });

    return {
      reitId,
      weightPct,
      allocatedLumpsum,
      allocatedMonthlySip,
      position,
      navGrowthProvenance: { origin: 'default', label: `${reitId} NAV growth (haircut trailing price CAGR)` },
      yieldProvenance: { origin: 'default', label: `${reitId} distribution yield (trailing range midpoint)` },
    };
  });

  const ctx: MarketContext = {
    rate(series: SeriesId): number {
      const r = seriesRates.get(series);
      if (r === undefined) throw new RangeError(`buildReitPortfolio: no rate configured for series "${series}"`);
      return r;
    },
    provenance(): Provenance {
      return { origin: 'default', label: 'REIT Portfolio Builder assumption' };
    },
  };

  const legRows = legs.map((leg) => ({ leg, rows: leg.position.project(input.months, ctx) }));
  const legDistributions = legs.map((leg) => ({ leg, dist: leg.position.distributions(input.months, ctx) }));

  const rows: MonthlyRow[] = [];
  for (let m = 1; m <= input.months; m++) {
    let cashOut = 0;
    let cashIn = 0;
    let assetValue = 0;
    let otherSources = 0;
    for (const { rows: lr } of legRows) {
      const row = lr[m - 1]!;
      cashOut = round2(cashOut + row.cashOut);
      cashIn = round2(cashIn + row.cashIn);
      assetValue = round2(assetValue + row.assetValue);
      otherSources = round2(otherSources + (row.taxable.other_sources ?? 0));
    }
    rows.push({
      month: m,
      cashOut,
      cashIn,
      taxable: otherSources !== 0 ? { other_sources: otherSources } : {},
      assetValue,
      liabilityBalance: 0,
      liquidityTier: 1,
    });
  }

  const yearlyRows: { year: number; invested: number; value: number; distributions: number }[] = [];
  let cumulativeInvested = 0;
  for (let i = 0; i < rows.length; i += 12) {
    const chunk = rows.slice(i, i + 12);
    cumulativeInvested = round2(cumulativeInvested + chunk.reduce((s, r) => s + r.cashOut, 0));
    const yearDistributions = round2(chunk.reduce((s, r) => s + r.cashIn, 0));
    yearlyRows.push({ year: Math.floor(i / 12) + 1, invested: cumulativeInvested, value: chunk[chunk.length - 1]!.assetValue, distributions: yearDistributions });
  }

  const totalInvested = round2(rows.reduce((s, r) => s + r.cashOut, 0));
  const finalValue = rows[rows.length - 1]?.assetValue ?? 0;
  const totalGrossDistributions = round2(rows.reduce((s, r) => s + r.cashIn, 0));
  // Average of the final 12 months' gross distributions — the "monthly rent-equivalent" figure at the selected horizon, in that final year's nominal rupees.
  const finalYearRows = rows.slice(-12);
  const monthlyIncomeAtHorizonNominal = finalYearRows.length > 0 ? round2(finalYearRows.reduce((s, r) => s + r.cashIn, 0) / finalYearRows.length) : 0;

  const blendedComponentTotals = { interest: 0, dividend: 0, rental: 0, returnOfCapital: 0 };
  for (const { dist } of legDistributions) {
    for (const d of dist) {
      blendedComponentTotals.interest = round2(blendedComponentTotals.interest + d.interest);
      blendedComponentTotals.dividend = round2(blendedComponentTotals.dividend + d.dividend);
      blendedComponentTotals.rental = round2(blendedComponentTotals.rental + d.rental);
      blendedComponentTotals.returnOfCapital = round2(blendedComponentTotals.returnOfCapital + d.returnOfCapital);
    }
  }

  return {
    legs,
    rows,
    yearlyRows,
    totalInvested,
    finalValue,
    totalGrossDistributions,
    monthlyIncomeAtHorizonNominal,
    blendedComponentTotals,
  };
}
