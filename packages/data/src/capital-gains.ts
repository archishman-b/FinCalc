/**
 * Typed shape of the `rules` object inside a capital-gains pack. Covers the
 * Tier 1 scope from the brief: equity, debt funds, property (including the
 * post-23-July-2024 transitional 12.5%-no-indexation vs 20%-with-indexation
 * choice), listed REIT/InvIT units, Sections 54 / 54F / 54EC, and (Phase 10)
 * other non-equity-oriented fund units for the SIP & SWP planner. The
 * four-component REIT distribution model itself (dividend/interest/rental/
 * return-of-capital) is a Phase 3 Position concern; this pack only carries
 * the capital-gains *rate* an REIT/InvIT unit sale is taxed at.
 */

import { z } from 'zod';

export const EquityGainsRules = z.object({
  /** New-Act (2025) section numbers, where known — informational. */
  actSections: z.object({ stcg: z.string().optional(), ltcg: z.string().optional() }),
  holdingPeriodMonthsForLtcg: z.number().positive(),
  ltcgRate: z.number().min(0).max(1),
  ltcgExemptionPerYear: z.number().nonnegative(),
  stcgRate: z.number().min(0).max(1),
});
export type EquityGainsRules = z.infer<typeof EquityGainsRules>;

export const DebtFundGainsRules = z.object({
  actSection: z.string().optional(),
  /** Units acquired on/after this date are taxed entirely at slab rate as short-term, regardless of holding period (Finance Act 2023). */
  slabTaxationAppliesFrom: z.string(),
  /** A fund counts as a "Specified Mutual Fund" (slab-taxed) once its debt/money-market allocation is at or above this share. */
  specifiedFundDebtShareThreshold: z.number().min(0).max(1),
  /** Grandfathered units (acquired before slabTaxationAppliesFrom) held longer than this qualify for LTCG treatment instead of slab rate. */
  grandfatheredHoldingPeriodMonthsForLtcg: z.number().positive(),
  /** Grandfathered LTCG rate — no indexation benefit (removed by Budget 2024 even for this category). */
  grandfatheredLtcgRate: z.number().min(0).max(1),
});
export type DebtFundGainsRules = z.infer<typeof DebtFundGainsRules>;

export const PropertyGainsRules = z.object({
  actSections: z.object({ stcg: z.string().optional(), ltcg: z.string().optional() }),
  holdingPeriodMonthsForLtcg: z.number().positive(),
  /** Default LTCG rate, no indexation — applies to every property LTCG regardless of acquisition date. */
  ltcgRateNoIndexation: z.number().min(0).max(1),
  /** STCG is taxed at the household's ordinary slab rate — no separate flat rate. */
  stcgTaxedAtSlabRate: z.literal(true),
  /**
   * The one-time transitional choice (Finance (No.2) Act 2024): a resident individual/HUF
   * selling land or a building acquired before `transitionalOption.acquiredBefore` may instead
   * pay `transitionalOption.rateWithIndexation` on the indexed gain, if that's lower. Not
   * available to non-individuals/non-HUFs, or to property acquired on/after that date.
   */
  transitionalOption: z.object({
    acquiredBefore: z.string(),
    rateWithIndexation: z.number().min(0).max(1),
    eligibleTaxpayers: z.array(z.enum(['resident_individual', 'resident_huf'])),
  }),
});
export type PropertyGainsRules = z.infer<typeof PropertyGainsRules>;

export const ReitGainsRules = z.object({
  holdingPeriodMonthsForLtcg: z.number().positive(),
  ltcgRate: z.number().min(0).max(1),
  /** null when the equity-style annual exemption does not (yet) extend to REIT/InvIT units for this FY — see the pack's citations for why. */
  ltcgExemptionPerYear: z.number().nonnegative().nullable(),
  stcgRate: z.number().min(0).max(1),
});
export type ReitGainsRules = z.infer<typeof ReitGainsRules>;

/**
 * Units of a non-equity-oriented mutual fund scheme not otherwise covered above — hybrid funds,
 * gold/silver fund-of-funds, international equity fund-of-funds, unlisted non-equity ETF units —
 * added for the SIP & SWP planner's "other" holding category (Phase 10). Distinct from both
 * `EquityGainsRules` (no annual exemption here, and no separate flat short-term rate — short-term
 * gains are ordinary slab-taxed income) and `DebtFundGainsRules` (that category's post-2023 units
 * are *always* slab-taxed regardless of holding period; this one gets flat LTCG treatment once held
 * long enough). Confirmed as the correct 24-month threshold for *unlisted* fund units specifically —
 * a *listed* gold/silver ETF instead gets the shorter 12-month listed-securities threshold, per this
 * pack's own citation — so this shape is for FoF/unlisted-unit holdings, matching the SIP & SWP
 * planner's own "other" holdings (hybrid, gold, international funds), not a literal listed ETF.
 */
export const OtherAssetGainsRules = z.object({
  actSections: z.object({ stcg: z.string().optional(), ltcg: z.string().optional() }).optional(),
  holdingPeriodMonthsForLtcg: z.number().positive(),
  /** No indexation benefit (removed by Finance (No.2) Act 2024). */
  ltcgRate: z.number().min(0).max(1),
  /** Short-term gains in this category have no separate flat rate — they're ordinary income at the household's slab rate. */
  stcgTaxedAtSlabRate: z.literal(true),
});
export type OtherAssetGainsRules = z.infer<typeof OtherAssetGainsRules>;

const ReinvestmentExemption = z.object({
  actSection: z.string().optional(),
  capOnGainsConsidered: z.number().positive().nullable(),
  purchaseWindowMonthsBefore: z.number().nonnegative(),
  purchaseWindowMonthsAfter: z.number().nonnegative(),
  constructionWindowMonthsAfter: z.number().nonnegative(),
});

export const Section54Rules = ReinvestmentExemption.extend({
  /** A once-in-a-lifetime exception lets the exemption span two houses when total LTCG is at or below this figure; otherwise only one house qualifies. */
  twoHouseExceptionGainsCap: z.number().positive(),
});
export type Section54Rules = z.infer<typeof Section54Rules>;

export const Section54FRules = ReinvestmentExemption.extend({
  /** Disqualified if the taxpayer owns more than this many other residential houses on the transfer date. */
  maxOtherResidentialHousesOwned: z.number().int().nonnegative(),
});
export type Section54FRules = z.infer<typeof Section54FRules>;

export const Section54ECRules = z.object({
  actSection: z.string().optional(),
  investmentCap: z.number().positive(),
  lockInMonths: z.number().positive(),
  investmentWindowMonths: z.number().positive(),
  eligibleBonds: z.array(z.string()),
});
export type Section54ECRules = z.infer<typeof Section54ECRules>;

export const CapitalGainsRules = z.object({
  equity: EquityGainsRules,
  debtFunds: DebtFundGainsRules,
  property: PropertyGainsRules,
  reit: ReitGainsRules,
  otherAssets: OtherAssetGainsRules,
  section54: Section54Rules,
  section54F: Section54FRules,
  section54EC: Section54ECRules,
});
export type CapitalGainsRules = z.infer<typeof CapitalGainsRules>;
