/**
 * Small helpers shared by more than one Position factory. Nothing here is a
 * Position itself — just plumbing that would otherwise be duplicated.
 */

import type { AmortizationRow } from '../amortization';
import { compoundContributions } from '../compounding';
import type { AnnualRate, Month, MarketContext, SeriesId } from '../types';

/**
 * `Position.project()` must emit one row per month for the full requested
 * horizon (see the interface doc in types.ts) — but `amortize()` stops
 * early once a loan pays off, which is exactly what happens whenever a
 * loan's own tenure is shorter than the Scenario horizon (a 15-year plot
 * loan inside a 25-year comparison, say). This pads the tail with
 * zero-cashflow, zero-balance rows so the stream stays the requested length.
 */
export function padAmortizationRows(rows: readonly AmortizationRow[], months: number): AmortizationRow[] {
  if (rows.length >= months) return rows.slice(0, months);
  const padded = rows.slice();
  for (let month = rows.length + 1; month <= months; month++) {
    padded.push({ month, openingBalance: 0, interest: 0, scheduledPrincipal: 0, prepayment: 0, closingBalance: 0, totalPayment: 0 });
  }
  return padded;
}

/**
 * Compounds `initialValue` forward for `months` months at a per-month rate
 * looked up from a MarketContext series — the shared mechanism behind
 * property appreciation and REIT/InvIT NAV growth. Reuses
 * `compoundContributions` with a zero contribution stream: growth-only
 * compounding is just the contribution case with nothing contributed.
 * Nominal-monthly convention (annual ÷ 12), matching every other compounding
 * calculation in this engine (see rates.ts).
 */
export function appreciateSeries(initialValue: number, months: number, ctx: MarketContext, series: SeriesId): number[] {
  if (months <= 0) return [];
  const rows = compoundContributions(() => 0, (month: Month): AnnualRate => ctx.rate(series, month), months, initialValue);
  return rows.map((r) => r.closingValue);
}
