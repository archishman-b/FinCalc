/**
 * Rate-convention helpers. Two different conventions are legitimate and the
 * codebase uses both deliberately — mixing them up is a classic source of
 * silently-wrong money:
 *
 * - `nominalMonthlyRate` (annual ÷ 12): what every Indian bank, EMI
 *   calculator and SIP illustration uses. The engine's amortisation and SIP
 *   compounding use this convention so a hand-checked figure from a bank's
 *   own calculator or an AMC's SIP illustration will match this engine.
 * - `effectiveMonthlyRate` (geometric, (1+annual)^(1/12) − 1): true monthly
 *   compounding of a stated annual rate. Provided for contexts that ask for
 *   genuine compounding rather than the market's nominal convention.
 *
 * An `AnnualRate` is always a decimal (0.085 = 8.5%), never a percentage.
 */

import type { AnnualRate } from './types';

/** annual ÷ 12 — the convention behind every EMI and SIP formula in this engine. */
export function nominalMonthlyRate(annualRate: AnnualRate): number {
  return annualRate / 12;
}

/** (1+annual)^(1/12) − 1 — true geometric monthly compounding. */
export function effectiveMonthlyRate(annualRate: AnnualRate): number {
  return Math.pow(1 + annualRate, 1 / 12) - 1;
}

/** Converts an effective monthly rate back to its equivalent nominal annual rate (× 12). */
export function annualizeNominal(monthlyRate: number): AnnualRate {
  return monthlyRate * 12;
}

/** Converts an effective monthly rate to the annual rate it geometrically compounds to. */
export function annualizeEffective(monthlyRate: number): AnnualRate {
  return Math.pow(1 + monthlyRate, 12) - 1;
}
