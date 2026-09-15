/**
 * Reducing-balance loan amortisation. This is the one function every loan
 * Position (home loan, plot loan, refinance comparison) is built on — the
 * brief is explicit that a plot loan's shorter tenure, a mid-tenure rate
 * change, a step-up EMI and a prepayment are all variations in the *inputs*
 * to one mechanism, never separate calculators.
 *
 * Convention: nominal monthly rate (annual ÷ 12, see rates.ts) — matches
 * every Indian bank's own EMI calculator, so a hand-checked figure from one
 * will match this engine to the rupee.
 */

import { nominalMonthlyRate } from './rates';
import type { AnnualRate, Month } from './types';

export interface AmortizationRow {
  month: Month;
  openingBalance: number;
  interest: number;
  /** Principal repaid via the scheduled instalment (excludes any prepayment). */
  scheduledPrincipal: number;
  /** Extra principal repaid this month beyond the scheduled instalment. */
  prepayment: number;
  closingBalance: number;
  /** interest + scheduledPrincipal + prepayment: what actually left the household this month. */
  totalPayment: number;
}

export interface AmortizationInput {
  principal: number;
  /** Nominal annual rate in effect for this month. Supports a rate change mid-tenure by returning a different value at some month. */
  annualRate: (month: Month) => number;
  /**
   * The scheduled instalment for this month, given the balance outstanding
   * at the start of it. A level EMI is `() => emi(...)`; a step-up EMI
   * returns a larger figure in later months. If the amount would overpay
   * the balance, only the balance is charged (the loan closes early).
   */
  scheduledPayment: (month: Month, openingBalance: number) => number;
  /** Extra principal beyond the scheduled instalment, e.g. a lump prepayment at one month or a recurring one every month. Defaults to none. */
  extraPrepayment?: (month: Month, openingBalance: number) => number;
  /**
   * How many months to emit. If the loan pays off before this many months,
   * the schedule stops there. If the loan would outlive this horizon
   * (a Position asked for fewer months than the loan's own tenure), the
   * schedule simply stops with a positive closing balance still outstanding
   * — the caller decides what a truncated horizon means.
   */
  months: number;
}

/**
 * The standard EMI formula for a level (unchanging) instalment on a
 * reducing-balance loan: EMI = P·r·(1+r)^n / ((1+r)^n − 1), r = nominal
 * monthly rate, n = tenure in months. Falls back to a straight-line P/n when
 * the rate is zero, since the standard formula divides by zero there.
 */
export function emi(principal: number, annualRate: AnnualRate, tenureMonths: number): number {
  if (tenureMonths <= 0) throw new RangeError(`emi: tenureMonths must be positive, got ${tenureMonths}`);
  const r = nominalMonthlyRate(annualRate);
  if (r === 0) return principal / tenureMonths;
  const factor = Math.pow(1 + r, tenureMonths);
  return (principal * r * factor) / (factor - 1);
}

/**
 * The inverse of {@link emi}: given a target monthly instalment, the
 * principal a reducing-balance loan at this rate and tenure can support.
 * Used wherever a household states an affordable monthly payment first and
 * the loan size is the derived quantity — e.g. Layer 1's "given this
 * housing budget, what property can it support" flow — rather than the
 * more common direction of stating the principal and deriving the EMI.
 * Falls back to the same straight-line P = EMI × n the zero-rate branch of
 * `emi()` uses, so `principalForEmi(emi(P, r, n), r, n) === P` holds at
 * both zero and non-zero rates (verified by property test).
 */
export function principalForEmi(emiAmount: number, annualRate: AnnualRate, tenureMonths: number): number {
  if (tenureMonths <= 0) throw new RangeError(`principalForEmi: tenureMonths must be positive, got ${tenureMonths}`);
  if (emiAmount < 0) throw new RangeError(`principalForEmi: emiAmount must be non-negative, got ${emiAmount}`);
  const r = nominalMonthlyRate(annualRate);
  if (r === 0) return emiAmount * tenureMonths;
  const factor = Math.pow(1 + r, tenureMonths);
  return (emiAmount * (factor - 1)) / (r * factor);
}

/** Runs a reducing-balance amortisation, month by month, against whatever rate, payment and prepayment schedule is supplied. */
export function amortize(input: AmortizationInput): AmortizationRow[] {
  const { principal, annualRate, scheduledPayment, extraPrepayment, months } = input;
  if (principal < 0) throw new RangeError(`amortize: principal must be non-negative, got ${principal}`);
  if (months <= 0) throw new RangeError(`amortize: months must be positive, got ${months}`);

  const rows: AmortizationRow[] = [];
  let balance = round2(principal);

  for (let month = 1; month <= months && balance > 0; month++) {
    const r = nominalMonthlyRate(annualRate(month));
    const interest = round2(balance * r);

    const rawInstalment = Math.max(0, scheduledPayment(month, balance));
    const rawExtra = Math.max(0, extraPrepayment?.(month, balance) ?? 0);

    // Principal implied by the instalment, then any extra prepayment — both
    // capped so the loan can never be paid below zero, whatever the caller asks for.
    let scheduledPrincipal = round2(Math.max(0, rawInstalment - interest));
    scheduledPrincipal = Math.min(scheduledPrincipal, balance);
    const remainingAfterScheduled = round2(balance - scheduledPrincipal);
    const prepayment = round2(Math.min(rawExtra, remainingAfterScheduled));

    const closingBalance = round2(remainingAfterScheduled - prepayment);

    rows.push({
      month,
      openingBalance: balance,
      interest,
      scheduledPrincipal,
      prepayment,
      closingBalance,
      totalPayment: round2(interest + scheduledPrincipal + prepayment),
    });

    balance = closingBalance;
  }

  return rows;
}

/** A level-EMI amortisation with no prepayments — the plain case most loans start from. */
export function levelEmiSchedule(
  principal: number,
  annualRate: AnnualRate,
  tenureMonths: number,
  months: number = tenureMonths,
): AmortizationRow[] {
  const instalment = emi(principal, annualRate, tenureMonths);
  return amortize({
    principal,
    annualRate: () => annualRate,
    scheduledPayment: () => instalment,
    months,
  });
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
