/**
 * Typed shape of the `rules` object inside the `nps-rules` pack —
 * contribution/allocation limits, the Auto Choice lifecycle glide path,
 * the December-2025-amended exit withdrawal slabs, and the Section 80CCD
 * tax-benefit limits `nps-simulator.ts` needs.
 *
 * Deliberately does not attempt a sourced Corporate-debt/Government-securities
 * split for the Auto Choice lifecycle funds (LC75/LC50/LC25): only the
 * equity glide path was found from a primary-adjacent source this session
 * (see this pack's own citations) — the non-equity remainder is treated by
 * the simulator as one blended "debt" bucket with its own single return
 * assumption, a documented simplification rather than a guessed C/G split.
 * Active Choice, where the user sets all four asset-class weights directly,
 * is unaffected by this — it needs no sourced split at all.
 */

import { z } from 'zod';

/** Active Choice: the subscriber sets E/C/G/A weights directly, subject to statutory caps. */
export const NpsActiveChoiceRules = z.object({
  /** Maximum equity (E) allocation, non-government ("all citizen"/private-sector) subscribers. */
  maxEquityPctNonGovernment: z.number().min(0).max(100),
  /** Maximum equity (E) allocation, government-sector subscribers — lower-confidence figure, not pinned to a primary source this session (see this pack's provenance note). */
  maxEquityPctGovernment: z.number().min(0).max(100),
  /** Maximum alternative-assets (A) allocation, both sectors. */
  maxAlternativePct: z.number().min(0).max(100),
});
export type NpsActiveChoiceRules = z.infer<typeof NpsActiveChoiceRules>;

/** One age checkpoint of a lifecycle fund's equity glide path; linearly interpolated between checkpoints by the simulator. */
export const NpsLifecycleGlidePoint = z.object({
  age: z.number().positive(),
  equityPct: z.number().min(0).max(100),
});
export type NpsLifecycleGlidePoint = z.infer<typeof NpsLifecycleGlidePoint>;

/** Auto Choice: three preset lifecycle funds, keyed by id, each a glide path of equity share by age (the non-equity remainder is one blended "debt" bucket — see this file's module doc comment). */
export const NpsAutoChoiceRules = z.object({
  lifecycles: z.record(z.string(), z.array(NpsLifecycleGlidePoint).min(2)),
});
export type NpsAutoChoiceRules = z.infer<typeof NpsAutoChoiceRules>;

/**
 * One withdrawal slab at normal exit — PFRDA (Exits and Withdrawals under
 * the NPS) (Amendment) Regulations, 2025, in force 16 Dec 2025. `upToInr`
 * null marks the top (unbounded) slab. `maxLumpSumFixedInr` is set only for
 * the middle slab (₹8-12L: up to ₹6L fixed, not a percentage); the other
 * slabs use `maxLumpSumPct` instead (one of the two is always null).
 */
export const NpsExitSlab = z.object({
  upToInr: z.number().positive().nullable(),
  maxLumpSumPct: z.number().min(0).max(100).nullable(),
  maxLumpSumFixedInr: z.number().positive().nullable(),
  minAnnuityPct: z.number().min(0).max(100),
});
export type NpsExitSlab = z.infer<typeof NpsExitSlab>;

export const NpsExitRules = z.object({
  /** Normal-exit vesting for non-government subscribers: the lesser of this many years' NPS tenure, or `vestingAgeGovernment` — the Dec 2025 amendment's relaxation from a flat age-60 rule. */
  vestingYearsNonGovernment: z.number().positive(),
  /** Normal-exit age for government-sector subscribers (unchanged by the Dec 2025 amendment) — also the age ceiling for non-government vesting above. */
  vestingAgeGovernment: z.number().positive(),
  /** Ascending by upToInr; the last entry's upToInr is null (the >₹12L slab). */
  nonGovernmentSlabs: z.array(NpsExitSlab).min(1),
  governmentSlabs: z.array(NpsExitSlab).min(1),
  /**
   * Section 10(12A)'s lump-sum tax exemption, as a fraction of the total
   * corpus — flagged as a likely conformity gap against the Dec 2025
   * PFRDA amendment's own 80%-for-non-government lump-sum ceiling above:
   * the exemption appears to remain at 60% even where PFRDA now permits a
   * larger lump sum. See this pack's own citations for the sourcing and
   * `claude/pf-nps-research-and-plan.md` for the fuller discussion. The
   * simulator treats any lump sum taken above this fraction as
   * potentially taxable — the conservative default this project applies
   * whenever a tax rule hasn't caught up with a regulatory change (see
   * the REIT/InvIT dividend-TDS-conformity note elsewhere in this
   * project for the same pattern).
   */
  lumpSumTaxExemptFractionOfCorpus: z.number().min(0).max(1),
});
export type NpsExitRules = z.infer<typeof NpsExitRules>;

/** Section 80CCD employer-contribution cap, which differs by regime for non-government subscribers only (government subscribers get the higher figure under both regimes). */
export const Nps80ccd2Rules = z.object({
  nonGovernmentOldRegimePct: z.number().min(0).max(100),
  nonGovernmentNewRegimePct: z.number().min(0).max(100),
  governmentBothRegimesPct: z.number().min(0).max(100),
});
export type Nps80ccd2Rules = z.infer<typeof Nps80ccd2Rules>;

export const NpsTaxBenefitRules = z.object({
  /** Section 80CCD(1): employee's own contribution, % of salary, old regime only — sits inside the shared ₹1.5L 80C/80CCC/80CCD(1) basket. */
  selfContributionPctOfSalaryCapOldRegime: z.number().min(0).max(100),
  /** Section 80CCD(1B): additional employee contribution, old regime only, on top of the ₹1.5L basket. */
  additionalSelfContributionCapInr: z.number().nonnegative(),
  /** Section 80CCD(2): employer's contribution. Survives in both regimes, unlike (1)/(1B) above. */
  employerContribution: Nps80ccd2Rules,
});
export type NpsTaxBenefitRules = z.infer<typeof NpsTaxBenefitRules>;

export const NpsRules = z.object({
  minContributionPerTransactionInr: z.number().positive(),
  minAnnualContributionInr: z.number().positive(),
  entryAgeMin: z.number().positive(),
  entryAgeMax: z.number().positive(),
  activeChoice: NpsActiveChoiceRules,
  autoChoice: NpsAutoChoiceRules,
  exit: NpsExitRules,
  taxBenefits: NpsTaxBenefitRules,
});
export type NpsRules = z.infer<typeof NpsRules>;
