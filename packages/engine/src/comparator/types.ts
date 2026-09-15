/**
 * The Comparator (Phase 4): runs 2-4 Scenarios over the same timeline
 * against the same MarketContext, equalises their monthly outflow (brief
 * principle 1), reinvests every rupee of surplus and of a scenario's own
 * net cash income into a sweep vehicle (principle 10), taxes accruing
 * income annually (principle 11), and applies exit economics — brokerage,
 * illiquidity haircut, capital-gains tax — at each requested horizon.
 *
 * A Position emits raw monthly streams only (Phase 3's design). Everything
 * that needs cross-position or cross-scenario knowledge — which capital-
 * gains route a position's exit uses, what its cost of acquisition was,
 * which growth assumption to compare for parity — is metadata the
 * Scenario builder (this module's caller) declares alongside the
 * Position, never introspected from it.
 */

import type { CapitalGainsRules, CostInflationIndexRules, IncomeTaxRules } from '@fincalc/data';

import type { AgeBand, HraInput, Section80DInput, TaxRegime } from '../tax/income-tax';
import type { MarketContext, Month, MonthlyRow, Position, SeriesId } from '../types';

/** Which capital-gains route a position's exit proceeds are taxed under (capital-gains.ts). 'none' models an asset with no gain at all — a bare loan (assetValue is always 0) or a refundable rental deposit. */
export type ExitCapitalGainsTreatment = 'equity' | 'reit' | 'debt_fund' | 'property' | 'none';

export interface ExitConfig {
  positionId: string;
  capitalGainsTreatment: ExitCapitalGainsTreatment;
  /**
   * Brokerage on sale, as a fraction of gross sale (assetValue) proceeds.
   * The brief treats brokerage as deal-specific, so this has no engine
   * default beyond 0 — the Scenario builder supplies the figure it wants
   * modelled. Ignored for 'none'.
   */
  exitBrokerageRate?: number;
  /**
   * Illiquidity haircut on top of brokerage, as a fraction of sale
   * proceeds — the brief's own suggested defaults are 0 for a city flat,
   * 0.05 for a plot in a deep market, 0.10-0.15 for a thin
   * investor-dominated layout; this module applies none of them silently,
   * the Scenario builder chooses. Ignored for 'none'.
   */
  illiquidityHaircut?: number;
  /**
   * Cost of acquisition for capital-gains purposes. Required for
   * 'property' (purchase price + entry costs — Positions don't expose
   * their construction inputs, so this is declared here); for 'equity' /
   * 'reit' / 'debt_fund' it defaults to the position's own cumulative
   * cashOut (contributions) up to the horizon, which is almost always
   * what's wanted and rarely needs overriding.
   */
  costOfAcquisition?: number;
  /**
   * FY the position was acquired, for holding-period/indexation purposes.
   * Defaults to the comparison's startFy (i.e. acquired at month 1) —
   * override for a position that enters the scenario partway through the
   * horizon.
   */
  acquisitionFy?: string;
  /** 'property' treatment only — passed through to computePropertyGains. Defaults to 'resident_individual'. */
  taxpayerType?: 'resident_individual' | 'resident_huf' | 'other';
}

/**
 * Diagnostic metadata the Parity Auditor uses — never consulted by the
 * cashflow/tax computation itself. Declares which MarketContext series a
 * position's headline growth assumption reads from, so the Auditor can
 * compare assumptions across scenarios without introspecting Positions
 * (which deliberately don't expose their construction inputs).
 */
export interface GrowthAssumption {
  positionId: string;
  seriesId: SeriesId;
  /** Human-readable label for a parity warning, e.g. "Khopoli plot appreciation". */
  label: string;
}

export interface Scenario {
  id: string;
  name: string;
  /** This scenario's own dedicated Positions — never includes the equalisation sweep, which the Comparator builds and owns internally. */
  positions: Position[];
  /** Exit-tax configuration per position. A position with no entry exits with 'none' treatment. */
  exitConfigs?: ExitConfig[];
  /** See GrowthAssumption. Optional — omitting it just means the Parity Auditor can't compare this scenario's growth assumptions against others. */
  growthAssumptions?: GrowthAssumption[];
  /** MarketContext series the equalisation/sweep surplus for this scenario is invested into (brief principle 1 & 10 — "a user-specified default instrument"). */
  sweepGrowthSeries: SeriesId;
  /** Exit treatment for the sweep position itself at each horizon. Defaults to `{ capitalGainsTreatment: 'equity' }` — the sweep is, by construction, an index-fund-style SIP. */
  sweepExitConfig?: Omit<ExitConfig, 'positionId'>;
}

/** Ordinary (slab-taxed) household inputs held constant across every scenario in a comparison — a household files one return (decisions-and-workflow.md). Each figure is a function of FY so it can grow/change year to year; pass `() => constant` for a flat figure. */
export interface HouseholdTaxConfig {
  regime: TaxRegime;
  age: AgeBand;
  grossSalaryAnnual?: (fy: string) => number;
  /** rentPaidAnnual is supplied here, not derived from a rental_expense Position's cashOut, since a Position's month-1 cashOut mixes in its security deposit — see the module doc comment in household-tax.ts. */
  hraTemplate?: Omit<HraInput, 'rentPaidAnnual'> & { rentPaidAnnual: (fy: string) => number };
  section80c?: (fy: string) => number;
  section80d?: (fy: string) => Section80DInput | undefined;
  /** Non-Position other-sources income (e.g. FD interest not modelled as a Position). */
  otherSourcesIncomeAnnual?: (fy: string) => number;
  /** Resolves the IncomeTaxRules pack for a given FY. Defaults to `getIncomeTaxRules(fy)`, falling back to the latest shipped FY's rules for any FY @data doesn't ship — see comparator.ts's module doc comment for why this is a deliberate, documented simplification rather than a guess at unreleased budgets. */
  resolveIncomeTaxRules?: (fy: string) => IncomeTaxRules;
  /** Resolves the CapitalGainsRules pack for a given FY, with the same fallback behaviour. */
  resolveCapitalGainsRules?: (fy: string) => CapitalGainsRules;
}

export interface CompareOptions {
  scenarios: Scenario[];
  ctx: MarketContext;
  /** Horizons to evaluate exit economics at, in months — e.g. [60, 120, 180, 300] for 5/10/15/25 years. */
  horizonsMonths: number[];
  /** FY month 1 of every scenario's timeline falls in — e.g. "2026-27". */
  startFy: string;
  household: HouseholdTaxConfig;
  cii: CostInflationIndexRules;
  /**
   * A floor on the equalised monthly target outflow, if the household has
   * a stated budget that might exceed every scenario's own required cost
   * in some months — e.g. "we can allocate up to ₹1.5-1.6L/month" even in
   * a month where every scenario's own positions need less than that.
   * Omit to equalise purely at the most expensive scenario's own cost
   * each month (the brief's default rule).
   */
  minimumMonthlyBudget?: (month: Month) => number;
  /** Parity Auditor: growth-rate spread beyond which a pair of declared assumptions is flagged. Defaults to 0.02 (2 percentage points). */
  growthParityThresholdPct?: number;
  /** Pairs of GrowthAssumption seriesIds the caller has explicitly acknowledged as intentionally asymmetric (e.g. comparing a risk-free FD against equities) — suppresses the corresponding parity warning. */
  acknowledgedGrowthAsymmetries?: readonly [SeriesId, SeriesId][];
}

export interface HorizonResult {
  horizonMonths: number;
  /** After-tax, after-exit-cost proceeds from this scenario's own dedicated positions. */
  ownPositionsValueAfterTax: number;
  /** After-tax, after-exit-cost proceeds from the equalisation sweep. */
  sweepValueAfterTax: number;
  /** Sum of the two — the headline number. */
  terminalNetWorth: number;
  /** Cumulative net cash the household put into this scenario's own dedicated positions (cashOut − cashIn, floored at 0 each month, including that year's income tax) — see the module doc comment in comparator.ts for why this excludes the sweep. */
  capitalDeployedIntoOwnPositions: number;
  /** XIRR of the dedicated positions' own cashflows plus their after-tax exit value. `null` if XIRR could not be reliably solved for this cashflow shape (xirr.ts fails closed rather than return an unreliable rate). */
  xirrOwnPositions: number | null;
  /** XIRR of the scenario's full cashflow (dedicated positions + sweep) plus total after-tax exit value. */
  xirrTotal: number | null;
  /** Income tax (annual, on accrual) plus exit capital-gains tax, summed over the horizon. */
  totalTaxPaidCumulative: number;
}

export interface ScenarioComparisonResult {
  scenarioId: string;
  scenarioName: string;
  /** This scenario's own pre-equalisation required net monthly outflow (cashOut − cashIn from dedicated positions, plus that month's income tax where due) — for transparency, not used by callers directly. */
  ownMonthlyOutflow: number[];
  /** The equalised target every scenario in this comparison was actually charged that month (identical across scenarios by construction — reported per scenario for convenience). */
  equalisedMonthlyOutflow: number[];
  /** Amount swept into the reinvestment vehicle each month — `equalisedMonthlyOutflow − ownMonthlyOutflow`, always ≥ 0. */
  sweepContribution: number[];
  perHorizon: HorizonResult[];
}

export interface ParityWarning {
  kind: 'growth_asymmetry' | 'missing_exit_treatment';
  message: string;
}

export interface ComparisonResult {
  scenarios: ScenarioComparisonResult[];
  parityWarnings: ParityWarning[];
}

/** Re-exported for convenience — callers building a Scenario need these without a separate import from '../types'. */
export type { MarketContext, Month, MonthlyRow, Position, SeriesId };
