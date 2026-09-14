/**
 * Turning nominal money into real (inflation-adjusted) terms — the whole
 * reason the comparator leads with a hurdle-rate sentence instead of a
 * point forecast (brief §1): a scenario that "wins" only in nominal rupees
 * can still be a loser once inflation is netted out.
 */

import { nominalMonthlyRate } from './rates';
import type { AnnualRate } from './types';

/**
 * The Fisher equation: the annual rate of return above (or below) inflation.
 * realRate = (1+nominal)/(1+inflation) − 1 — deliberately NOT `nominal −
 * inflation`, which is only a first-order approximation and drifts
 * noticeably at the rate levels Indian households actually see; both the
 * positive- and negative-real-return cases are hand-checked in the test
 * suite against the exact form.
 */
export function realRate(nominalAnnualRate: AnnualRate, inflationAnnualRate: AnnualRate): AnnualRate {
  return (1 + nominalAnnualRate) / (1 + inflationAnnualRate) - 1;
}

/** Discounts a future rupee amount back to its value `months` earlier, at a nominal annual rate. PV = FV / (1+r)^months. */
export function presentValue(futureValue: number, annualRate: AnnualRate, months: number): number {
  if (months < 0) throw new RangeError(`presentValue: months must be non-negative, got ${months}`);
  const r = nominalMonthlyRate(annualRate);
  return futureValue / Math.pow(1 + r, months);
}

/**
 * Expresses a future nominal rupee amount in today's purchasing power — the
 * same discounting as `presentValue`, named for its most common use in this
 * engine: turning a nominal projection (a flat's price in year 10, a SIP
 * corpus at redemption) into what it is actually worth today once inflation
 * has eroded it.
 */
export function deflateToToday(nominalFutureValue: number, annualInflationRate: AnnualRate, months: number): number {
  return presentValue(nominalFutureValue, annualInflationRate, months);
}
