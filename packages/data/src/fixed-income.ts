/**
 * Typed shape of the `rules` object inside the (single, not-FY-cyclical —
 * same reasoning as stamp-duty.ts) fixed-income pack: India's government
 * small-savings schemes, EPF/VPF, and the Post Office time-deposit/RD
 * ladder used as the calculator's sourced default for bank FD/RD (a real
 * bank's own FD rate varies by bank and changes independently of the
 * quarterly small-savings notification, so there is no single "the" FD
 * rate to ship — the Post Office Time Deposit is the nearest
 * government-backed, centrally-notified benchmark, and the UI must let the
 * user override it with their own bank's rate rather than presenting it as
 * universal).
 */

import { z } from 'zod';

export const FixedIncomeCompounding = z.enum(['annual', 'quarterly', 'monthly']);
export type FixedIncomeCompounding = z.infer<typeof FixedIncomeCompounding>;

export const FixedIncomeContributionMode = z.enum(['lumpsum', 'recurring_monthly', 'recurring_annual', 'flexible']);
export type FixedIncomeContributionMode = z.infer<typeof FixedIncomeContributionMode>;

export const FixedIncomeTaxTreatment = z.enum([
  /** Exempt-Exempt-Exempt: contribution, accrual and maturity all tax-free (subject to any stated conditions in `notes`). */
  'eee',
  /** Interest/return is fully taxable at slab rate every year (or at maturity, for a lumpsum instrument), no special exemption. */
  'interest_taxable',
  /** EEE up to a threshold; interest on contributions above `taxableInterestThresholdPerYear` is taxable — the EPF/VPF ₹2.5L rule. */
  'interest_taxable_above_threshold',
]);
export type FixedIncomeTaxTreatment = z.infer<typeof FixedIncomeTaxTreatment>;

export const FixedIncomeProduct = z.object({
  label: z.string(),
  /** Annual rate as a fraction, e.g. 0.071 for 7.1%. */
  rate: z.number().min(0).max(1),
  compounding: FixedIncomeCompounding,
  contributionMode: FixedIncomeContributionMode,
  /** Statutory/typical tenure in years; null for an open-ended account (e.g. Post Office Savings Account, EPF while employed). */
  tenureYears: z.number().positive().nullable(),
  /** Years before the instrument may be closed/withdrawn without a penalty or special-circumstance exception; null if there is none. */
  lockInYears: z.number().min(0).nullable(),
  minContribution: z.number().min(0).nullable(),
  /** Cap per year on contribution; null means uncapped. */
  maxContributionPerYear: z.number().min(0).nullable(),
  taxTreatment: FixedIncomeTaxTreatment,
  /** Only set when taxTreatment is 'interest_taxable_above_threshold'. */
  taxableInterestThresholdPerYear: z.number().positive().optional(),
  section80C: z.boolean(),
  eligibility: z.string().optional(),
  notes: z.string().optional(),
});
export type FixedIncomeProduct = z.infer<typeof FixedIncomeProduct>;

export const FixedIncomeRules = z.object({
  /** Keyed by product id (e.g. "ppf", "ssy", "nsc", "kvp", "scss", "pomis", "potd_1y".."potd_5y", "pord", "posa", "epf", "vpf"). A plain string record, not an enum-keyed one — same reasoning as StateStampDutyRules.byLocalBody: not every future product needs to ship on day one. */
  products: z.record(z.string(), FixedIncomeProduct),
});
export type FixedIncomeRules = z.infer<typeof FixedIncomeRules>;
