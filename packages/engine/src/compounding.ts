/**
 * Growth of money placed into the market: a one-time lumpsum, or a stream of
 * contributions (a plain SIP, or a step-up SIP where the instalment itself
 * grows). Every equity/REIT/PPF/EPF Position in the comparator is built from
 * one of these two primitives, the same way every loan Position is built
 * from amortize() in amortization.ts.
 *
 * Convention: nominal monthly rate (annual ÷ 12, see rates.ts) — the same
 * convention every AMC's SIP illustration and lumpsum calculator uses, so a
 * hand-checked figure from one will match this engine to the rupee.
 *
 * Contributions compound annuity-due: `balance = (balance + contribution) *
 * (1 + monthlyRate)`, i.e. the month's contribution lands *before* that
 * month's growth is applied. This matches the convention AMC SIP
 * illustrations use (a SIP debited on the 1st of the month earns that whole
 * month's growth), and is verified against a hand-checked figure in the
 * test suite.
 */

import { nominalMonthlyRate } from './rates';
import type { AnnualRate, Month } from './types';

/** Future value of a one-time lumpsum invested for `months` at a nominal annual rate, compounded monthly. FV = P·(1+r)^n. */
export function compoundLumpsum(principal: number, annualRate: AnnualRate, months: number): number {
  if (months < 0) throw new RangeError(`compoundLumpsum: months must be non-negative, got ${months}`);
  const r = nominalMonthlyRate(annualRate);
  return principal * Math.pow(1 + r, months);
}

export interface ContributionRow {
  month: Month;
  contribution: number;
  /** Balance after this month's contribution and growth are applied. */
  closingValue: number;
}

/**
 * Runs a general contribution-compounding schedule — the SIP / step-up SIP
 * building block. `contribution` and `annualRate` are read per month, so a
 * step-up SIP (a larger instalment from month 13 onward) or a rate that
 * changes mid-horizon are both just different callbacks over the same
 * mechanism, never a separate calculator.
 */
export function compoundContributions(
  contribution: (month: Month) => number,
  annualRate: (month: Month) => number,
  months: number,
  openingBalance = 0,
): ContributionRow[] {
  if (months < 0) throw new RangeError(`compoundContributions: months must be non-negative, got ${months}`);
  const rows: ContributionRow[] = [];
  let balance = openingBalance;

  for (let month = 1; month <= months; month++) {
    const c = contribution(month);
    const r = nominalMonthlyRate(annualRate(month));
    balance = (balance + c) * (1 + r);
    rows.push({ month, contribution: c, closingValue: balance });
  }

  return rows;
}

/** Convenience wrapper for the plain constant-SIP case: the same instalment, at the same rate, every month. */
export function sipFutureValue(monthlyContribution: number, annualRate: AnnualRate, months: number): number {
  if (months === 0) return 0;
  const rows = compoundContributions(() => monthlyContribution, () => annualRate, months);
  const last = rows[rows.length - 1];
  return last ? last.closingValue : 0;
}
