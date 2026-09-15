/**
 * Typed shape of the `rules` object inside an income-tax pack. The envelope
 * (schema.ts) only guarantees identity and provenance; this is what
 * `packages/engine`'s income-tax functions actually consume.
 */

import { z } from 'zod';

/** One slab of a progressive tax table. `upTo` is the upper bound in rupees; null marks the top (unbounded) slab. */
export const TaxSlab = z.object({
  upTo: z.number().positive().nullable(),
  rate: z.number().min(0).max(1),
});
export type TaxSlab = z.infer<typeof TaxSlab>;

export const Rebate87A = z.object({
  /** Total (taxable) income at or below which the rebate can zero out the tax entirely. */
  thresholdIncome: z.number().nonnegative(),
  /** The rebate never exceeds this amount, even when income is comfortably under the threshold. */
  maxRebate: z.number().nonnegative(),
  /**
   * Whether tax is tapered for income just above the threshold rather than jumping straight to
   * the full slab amount (true for the new regime's marginal relief; false for the old regime's
   * cliff, where crossing ₹5L loses the whole rebate at once).
   */
  marginalRelief: z.boolean(),
});
export type Rebate87A = z.infer<typeof Rebate87A>;

export const Section80DLimits = z.object({
  selfAndFamilyUnder60: z.number().nonnegative(),
  selfAndFamily60OrAbove: z.number().nonnegative(),
  parentsUnder60: z.number().nonnegative(),
  parents60OrAbove: z.number().nonnegative(),
});
export type Section80DLimits = z.infer<typeof Section80DLimits>;

export const RegimeRules = z.object({
  /** New-Act (2025) section number this regime's computation now sits under, where known — informational, for the Assumptions panel. */
  actSection: z.string().optional(),
  slabs: z.array(TaxSlab).min(1),
  /**
   * Slabs for resident senior (60-79) and super-senior (80+) citizens, keyed by the lower age
   * bound as a string ("60", "80"). Old regime only — the new regime is age-blind, so this is
   * omitted there.
   */
  seniorSlabs: z.record(z.string(), z.array(TaxSlab)).optional(),
  standardDeduction: z.number().nonnegative(),
  rebate87A: Rebate87A,
  hraExemptionAllowed: z.boolean(),
  /** null means the deduction does not exist under this regime. */
  section80cLimit: z.number().nonnegative().nullable(),
  section80dLimits: Section80DLimits.nullable(),
  /** Section 24(b)/22 interest cap for a self-occupied property; null means disallowed under this regime. Let-out property interest is uncapped under both regimes and isn't modelled here. */
  section24bSelfOccupiedCap: z.number().nonnegative().nullable(),
});
export type RegimeRules = z.infer<typeof RegimeRules>;

export const SurchargeSlab = z.object({
  /** Surcharge applies to total income strictly above this rupee figure. */
  above: z.number().nonnegative(),
  rate: z.number().min(0).max(1),
});
export type SurchargeSlab = z.infer<typeof SurchargeSlab>;

/**
 * Section 24(a) [old Act, IT Act 1961] / Section 22 [new Act, IT Act 2025]
 * standard deduction against a let-out property's Net Annual Value — a flat
 * 30%, identical under both regimes and both Acts, so it lives at the
 * top level rather than inside `regimes.old`/`regimes.new`. Not available
 * against a self-occupied property (nil annual value has no NAV to deduct
 * from) — see `section24bSelfOccupiedCap` for that case instead.
 */
export const HousePropertyRules = z.object({
  standardDeductionRate: z.number().min(0).max(1),
});
export type HousePropertyRules = z.infer<typeof HousePropertyRules>;

export const IncomeTaxRules = z.object({
  regimes: z.object({ new: RegimeRules, old: RegimeRules }),
  houseProperty: HousePropertyRules,
  surcharge: z.object({
    /** Same slabs apply to both regimes' ordinary (slab-rate) income. */
    slabs: z.array(SurchargeSlab),
    /** Surcharge on capital-gains income taxed under 111A/112/112A (old) / 196/197/198 (new) is capped at this rate regardless of the ordinary-income slab it would otherwise fall in. */
    capitalGainsCap: z.number().min(0).max(1),
    /** The new regime caps surcharge at this rate even for ordinary income above the highest slab (₹5Cr+); null if no such cap applies. */
    newRegimeCap: z.number().min(0).max(1).nullable(),
  }),
  /** Health & Education Cess, applied to (tax + surcharge). */
  cess: z.number().min(0).max(1),
  hra: z.object({
    metroCities: z.array(z.string()),
    metroRate: z.number().min(0).max(1),
    nonMetroRate: z.number().min(0).max(1),
  }),
});
export type IncomeTaxRules = z.infer<typeof IncomeTaxRules>;
