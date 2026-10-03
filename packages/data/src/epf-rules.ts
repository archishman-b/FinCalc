/**
 * Typed shape of the `rules` object inside the `epf-rules` pack. Distinct
 * from `fixed-income.ts`'s existing `epf`/`vpf` product entries (Phase 6),
 * which only model the corpus itself (contribution mode, compounding,
 * interest-taxable-above-threshold) for a generic "fixed income product"
 * comparison. This pack carries the mechanics `epf-vpf-simulator.ts`
 * actually needs and `fixed-income.ts`'s shape has no room for: the
 * employer contribution split between EPS and EPF, the wage ceiling that
 * split is capped against, the EPS pension formula's own constants, and
 * the withdrawal-TDS rules. The EPF/VPF interest rate itself is NOT
 * duplicated here — the simulator pulls it from `getFixedIncomeRules()`
 * (`products.epf.rate`), the one place it's already sourced and cited, so
 * the two packs can't silently drift on that figure.
 */

import { z } from 'zod';

/**
 * How an employer's 12% EPF-side contribution splits between the
 * Employees' Pension Scheme (EPS) and the EPF account itself. The EPS
 * share applies only up to `wageCeilingInr` of (Basic + DA) — wages above
 * the ceiling flow entirely to EPF, which is why `wageCeilingInr` lives
 * here rather than being folded into a single flat rate.
 */
export const EpfContributionRules = z.object({
  /** Mandatory employee contribution, as a fraction of Basic + DA (0.12 = 12%). */
  employeeRate: z.number().min(0).max(1),
  /** Total employer contribution, as a fraction of Basic + DA, before the EPS/EPF split (0.12 = 12%). */
  employerRate: z.number().min(0).max(1),
  /** Share of the employer's contribution diverted to EPS, applied only up to wageCeilingInr of wages (0.0833 = 8.33%). */
  epsShareOfEmployerRate: z.number().min(0).max(1),
  /** The statutory wage ceiling (₹/month) the EPS share is capped against. Raised ₹15,000 → ₹25,000 on 17 Sep 2026 — see this pack's own citations for the dated history. */
  wageCeilingInr: z.number().positive(),
});
export type EpfContributionRules = z.infer<typeof EpfContributionRules>;

/** Section 10(12): the service length after which an EPF/VPF withdrawal is fully tax-exempt, and the TDS that applies before then. */
export const EpfWithdrawalRules = z.object({
  taxFreeAfterYearsContinuousService: z.number().positive(),
  /** Withdrawals at or below this amount attract no TDS regardless of service length. */
  tdsExemptBelowInr: z.number().nonnegative(),
  tdsRateWithPan: z.number().min(0).max(1),
  tdsRateWithoutPan: z.number().min(0).max(1),
});
export type EpfWithdrawalRules = z.infer<typeof EpfWithdrawalRules>;

/**
 * The EPS defined-benefit pension formula's own constants — pensionable
 * salary × pensionable service ÷ pensionDivisor. `pensionableSalaryCeilingInr`
 * not independently confirmed against a primary EPFO source this session
 * (see this pack's own provenance note) — flagged lower-confidence, same
 * convention as this project's Section 80D section-number flag.
 */
export const EpsPensionRules = z.object({
  pensionDivisor: z.number().positive(),
  pensionableSalaryCeilingInr: z.number().positive(),
});
export type EpsPensionRules = z.infer<typeof EpsPensionRules>;

/** Budget 2021: interest on the employee's own EPF+VPF contributions above this threshold, in a year, is taxable at slab rate as "income from other sources." The alternate (higher) threshold applies only when the account receives no employer contribution at all — not reachable by this simulator (a private-sector EPF account always has an employer match by definition) but kept here for completeness rather than narrowing the pack's shape to today's one use. */
export const EpfTaxableInterestRules = z.object({
  thresholdWithEmployerContributionInr: z.number().positive(),
  thresholdWithoutEmployerContributionInr: z.number().positive(),
});
export type EpfTaxableInterestRules = z.infer<typeof EpfTaxableInterestRules>;

export const EpfRules = z.object({
  contribution: EpfContributionRules,
  withdrawal: EpfWithdrawalRules,
  eps: EpsPensionRules,
  taxableInterest: EpfTaxableInterestRules,
});
export type EpfRules = z.infer<typeof EpfRules>;
