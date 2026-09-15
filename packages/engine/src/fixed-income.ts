/**
 * Growth primitives for India's small-savings and provident-fund products
 * (PPF, SSY, NSC, KVP, SCSS, POMIS, Post Office TD/RD, EPF/VPF, bank FD/RD).
 *
 * Deliberately data-agnostic: this module knows how each *category* of
 * product compounds, never what today's PPF rate is — that's
 * `@fincalc/data`'s `fixed-income` pack (Phase 6), looked up by the caller
 * and passed in as `annualRate`, matching the same boundary every other
 * engine module in this codebase already keeps (`stampDutyAndRegistrationCost`
 * takes a resolved rate set rather than looking one up itself).
 *
 * Two genuinely different compounding conventions are modelled, and mixing
 * them up is a real correctness bug, not a style choice: PPF/SSY/NSC/KVP/
 * SCSS/EPF/VPF compound **annually** by rule (interest is credited once a
 * year, even though PPF's contribution-timing nuance affects which month's
 * balance earns that year's interest — see `compoundAnnualContributions`'s
 * doc comment). A recurring deposit (RD, VPF's monthly top-up, EPF's monthly
 * contribution) is compounded **monthly** since the contribution itself is
 * monthly. Using the engine's existing monthly-nominal-rate SIP machinery
 * (`compoundContributions` in `compounding.ts`) for the monthly-contribution
 * products would silently apply monthly compounding to an annually-compounded
 * statutory rate — this module's `compoundAnnualContributions` exists
 * specifically so a PPF/SSY projection isn't quietly overstated by treating
 * an annual-rate product as if it compounded monthly like a mutual-fund SIP.
 */

import type { AnnualRate } from './types';

/** Future value of a one-time lumpsum invested for `years` at a rate that compounds annually. FV = P·(1+r)^n — the NSC/KVP/bank-FD-at-annual-compounding shape, distinct from `compoundLumpsum`'s monthly-compounding convention in compounding.ts. */
export function compoundAnnually(principal: number, annualRate: AnnualRate, years: number): number {
  if (years < 0) throw new RangeError(`compoundAnnually: years must be non-negative, got ${years}`);
  if (principal < 0) throw new RangeError(`compoundAnnually: principal must be non-negative, got ${principal}`);
  return principal * Math.pow(1 + annualRate, years);
}

export interface AnnualContributionRow {
  year: number;
  contribution: number;
  /** Balance after this year's contribution and that year's interest are applied. */
  closingValue: number;
}

/**
 * PPF/SSY-shape growth: one contribution a year, interest credited once a
 * year on the year-end balance. Annuity-due, same convention as
 * `compoundContributions`: `balance = (balance + contribution) * (1 + r)`,
 * i.e. this year's contribution earns this year's full interest — the
 * standard simplifying assumption every PPF calculator uses (matching the
 * real-world advice to deposit before the 5th of April each year, so the
 * whole year's contribution earns interest for the whole year) rather than
 * modelling PPF's true monthly-minimum-balance mechanics, which depend on
 * exactly which day of which month each deposit lands and would need a
 * deposit *schedule*, not just an annual total, as an input. Documented
 * simplification, not a guess: a user who deposits later in the year, or in
 * instalments, earns slightly less than this projects.
 */
export function compoundAnnualContributions(
  contribution: (year: number) => number,
  annualRate: (year: number) => number,
  years: number,
  openingBalance = 0,
): AnnualContributionRow[] {
  if (years < 0) throw new RangeError(`compoundAnnualContributions: years must be non-negative, got ${years}`);
  const rows: AnnualContributionRow[] = [];
  let balance = openingBalance;

  for (let year = 1; year <= years; year++) {
    const c = contribution(year);
    const r = annualRate(year);
    balance = (balance + c) * (1 + r);
    rows.push({ year, contribution: c, closingValue: balance });
  }

  return rows;
}

/** Convenience wrapper: the same annual contribution, at the same rate, every year — the plain PPF/SSY case. */
export function annualContributionFutureValue(contributionPerYear: number, annualRate: AnnualRate, years: number): number {
  if (years === 0) return 0;
  const rows = compoundAnnualContributions(() => contributionPerYear, () => annualRate, years);
  const last = rows[rows.length - 1];
  return last ? last.closingValue : 0;
}

/**
 * Years (fractional) for a lumpsum to double at a given annually-compounded
 * rate — how KVP's "doubles in N months" figure is itself derived (rather
 * than shipping a separately-sourced maturity period that could silently
 * drift out of sync with the shipped rate). FV = 2P ⇒ (1+r)^n = 2 ⇒
 * n = ln(2) / ln(1+r).
 */
export function yearsToDouble(annualRate: AnnualRate): number {
  if (annualRate <= 0) throw new RangeError(`yearsToDouble: annualRate must be positive, got ${annualRate}`);
  return Math.log(2) / Math.log(1 + annualRate);
}

/**
 * Future value of a one-time lumpsum compounded `periodsPerYear` times a
 * year at a nominal annual rate — the general form `compoundAnnually`
 * (periodsPerYear = 1) is a special case of. Needed for the Post Office
 * Time Deposit / bank-FD convention of quarterly compounding on a
 * nominal annual rate (periodsPerYear = 4): FV = P·(1 + r/n)^(n·years).
 */
export function compoundAtFrequency(principal: number, annualRate: AnnualRate, years: number, periodsPerYear: number): number {
  if (years < 0) throw new RangeError(`compoundAtFrequency: years must be non-negative, got ${years}`);
  if (principal < 0) throw new RangeError(`compoundAtFrequency: principal must be non-negative, got ${principal}`);
  if (periodsPerYear <= 0) throw new RangeError(`compoundAtFrequency: periodsPerYear must be positive, got ${periodsPerYear}`);
  return principal * Math.pow(1 + annualRate / periodsPerYear, periodsPerYear * years);
}

