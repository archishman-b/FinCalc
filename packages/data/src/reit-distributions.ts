/**
 * Typed shape of the `rules` object inside a reit-distributions pack.
 * Covers how a listed REIT/InvIT's monthly cash distribution — split into
 * interest, dividend, rental and return-of-capital components — is taxed in
 * a resident unit-holder's hands. This is distinct from `capital-gains.ts`'s
 * `reit` rules, which cover the tax on *selling* the units, not the
 * distributions received while holding them.
 */

import { z } from 'zod';

/** Interest the SPV passes through to unit-holders — always taxable at slab rate as "Income from Other Sources," both FYs. */
export const InterestComponentRule = z.object({
  taxable: z.literal(true),
  head: z.literal('other_sources'),
  tdsRateResident: z.number().min(0).max(1),
});
export type InterestComponentRule = z.infer<typeof InterestComponentRule>;

/**
 * Dividend the SPV declares and passes through. FY2025-26: taxability
 * depends on whether the SPV opted into the concessional corporate regime
 * (old Act Section 115BAA / new Act Section 200) — taxable if it did,
 * exempt if it didn't. FY2026-27: the Taxation and Other Laws (Amendment)
 * Act 2026 removed this dependency — exempt either way.
 */
export const DividendComponentRule = z.object({
  dependsOnSpvConcessionalRegimeElection: z.boolean(),
  /** Only meaningful when dependsOnSpvConcessionalRegimeElection is true. */
  taxableIfSpvOptedIntoConcessionalRegime: z.boolean(),
  tdsNote: z.string(),
});
export type DividendComponentRule = z.infer<typeof DividendComponentRule>;

/** Rental/lease income the SPV earns, passed through — taxable at slab rate as "Income from Other Sources" (not house property, since the unit-holder doesn't directly own the real estate), both FYs. */
export const RentalComponentRule = z.object({
  taxable: z.literal(true),
  head: z.literal('other_sources'),
  tdsRateResident: z.number().min(0).max(1),
});
export type RentalComponentRule = z.infer<typeof RentalComponentRule>;

/**
 * Return of capital / SPV-debt-repayment (amortisation) component — not
 * taxed on receipt; instead reduces the unit-holder's cost of acquisition,
 * deferring the amount into a larger capital gain at exit. If cumulative
 * "other" (non-interest/dividend/rental) distributions ever exceed the
 * original cost of acquisition, the excess is taxed each year it arises —
 * as ordinary "Income from Other Sources" at slab rate, *not* as a capital
 * gain, under old Act Section 56(2)(xii) / new Act Section 92(2)(k).
 */
export const ReturnOfCapitalComponentRule = z.object({
  taxableOnReceipt: z.literal(false),
  reducesCostOfAcquisition: z.literal(true),
  excessOverCostBasisTaxedAs: z.literal('other_sources_slab_rate'),
});
export type ReturnOfCapitalComponentRule = z.infer<typeof ReturnOfCapitalComponentRule>;

export const ReitDistributionRules = z.object({
  interest: InterestComponentRule,
  dividend: DividendComponentRule,
  rental: RentalComponentRule,
  returnOfCapital: ReturnOfCapitalComponentRule,
});
export type ReitDistributionRules = z.infer<typeof ReitDistributionRules>;
