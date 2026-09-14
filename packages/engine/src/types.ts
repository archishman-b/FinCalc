/**
 * Core contracts of the FinCalc engine.
 *
 * Everything in this package is pure: no DOM, no React, no I/O. The tsconfig
 * (lib: ES2022 only, types: []) and the ESLint boundary rules enforce that.
 * These types are the draft agreed in the brief (§2); Phases 1–3 refine them.
 */

/** An annualised rate as a decimal: 0.085 means 8.5% per year. Positions convert to monthly themselves. */
export type AnnualRate = number;

/** 1-based month index on the comparison timeline (month 1 = first month after purchase/start). */
export type Month = number;

export type PositionKind =
  | 'owned_property'
  | 'rented_property'
  | 'plot'
  | 'rental_expense'
  | 'loan'
  | 'sip'
  | 'lumpsum'
  | 'reit'
  | 'epf'
  | 'nps'
  | 'ppf'
  | 'custom';

/** Heads of income as the tax engine needs them. House-property rules (30% standard deduction, interest deduction, set-off restrictions) only work if income is reported per head. */
export type IncomeHead = 'salary' | 'house_property' | 'capital_gains' | 'other_sources';

export type TaxableByHead = Partial<Record<IncomeHead, number>>;

/** 1 = can be sold in days (listed units), 2 = weeks to months (a city flat), 3 = up to a year (a plot in a thin market). */
export type LiquidityTier = 1 | 2 | 3;

export interface MonthlyRow {
  month: Month;
  /** EMI, rent paid, maintenance, property tax, tax paid — rupees leaving the household this month. */
  cashOut: number;
  /** Rent received, distributions, maturities — rupees arriving this month, before tax. */
  cashIn: number;
  /** Income arising this month, by head, for the annual tax computation. */
  taxable: TaxableByHead;
  /** Mark-to-market value of the asset at month end (0 for pure expenses and loans). */
  assetValue: number;
  /** Outstanding loan balance at month end (0 when unlevered). */
  liabilityBalance: number;
  liquidityTier: LiquidityTier;
}

/** Identifies a rate series, e.g. 'rates.home_loan', 'property.appreciation', 'equity.index_total_return', 'inflation.cpi'. */
export type SeriesId = string;

export type AssumptionOrigin = 'user' | 'default' | 'live';

/** Where an assumption came from — surfaced verbatim in the Assumptions panel. */
export interface Provenance {
  origin: AssumptionOrigin;
  label: string;
  url?: string;
  /** ISO date (YYYY-MM-DD) on which the value was last verified against its source. */
  verifiedOn?: string;
}

/**
 * The market a scenario runs against. Rates are looked up per month so that
 * bear/base/bull packs, Monte Carlo paths and live feeds are all the same plug:
 * a constant, a path, or a fetched series behind one interface.
 */
export interface MarketContext {
  rate(series: SeriesId, month: Month): AnnualRate;
  provenance(series: SeriesId): Provenance;
}

export interface Position {
  readonly id: string;
  readonly kind: PositionKind;
  /** Emit one row per month for `months` months. Pure: same inputs, same rows. */
  project(months: number, ctx: MarketContext): MonthlyRow[];
}
