/**
 * Typed shape of the `rules` object inside the (single, not-FY-cyclical)
 * stamp-duty pack. Unlike income-tax/capital-gains, stamp duty is set by
 * state notification on no fixed annual cycle — this pack's `fy` field just
 * marks "current as of" the verification date, not a Union Budget cycle.
 *
 * Scope: only the states/local-body classes the founding scenario and
 * current @data needs actually cover are shipped. A lookup for an
 * unshipped state/locality throws rather than guessing — see
 * `getStampDutyRateSet` in index.ts.
 */

import { z } from 'zod';

export const LocalBodyClass = z.enum(['municipal_corporation', 'municipal_council', 'gram_panchayat']);
export type LocalBodyClass = z.infer<typeof LocalBodyClass>;

export const StampDutyRateSet = z.object({
  /** Stamp duty as a fraction of the higher of consideration value or government-notified (ready-reckoner/market) value. */
  stampDutyRateMale: z.number().min(0).max(1),
  /** Some states (e.g. Maharashtra) give a lower rate to a sole female buyer; equal to the male rate where no such concession exists (e.g. Telangana). */
  stampDutyRateFemale: z.number().min(0).max(1),
  /** Telangana-specific: a separate "transfer duty" charged on top of stamp duty within municipal/corporation limits. 0 where not applicable. */
  transferDuty: z.number().min(0).max(1).default(0),
  /** A local surcharge (e.g. Mumbai's metro cess) charged on top of stamp duty in some corporation areas. 0 where not applicable. */
  metroCess: z.number().min(0).max(1).default(0),
  registrationFeeRate: z.number().min(0).max(1),
  /** Rupee ceiling on the registration fee, if any; null means uncapped. */
  registrationFeeCap: z.number().positive().nullable(),
});
export type StampDutyRateSet = z.infer<typeof StampDutyRateSet>;

export const StateStampDutyRules = z.object({
  state: z.string(),
  /**
   * Keyed by `LocalBodyClass` value, but a plain string record rather than
   * `z.record(LocalBodyClass, ...)` deliberately — Zod treats an enum-keyed
   * record as needing every key present, and states ship only the classes
   * they actually have sourced data for (e.g. Telangana has no shipped
   * `municipal_council` entry, Maharashtra no shipped `municipal_corporation`
   * one — see the pack's citations for why).
   */
  byLocalBody: z.record(z.string(), StampDutyRateSet),
  /** Named localities mapped to which local-body class applies to them, since this isn't obvious from the place name alone (e.g. "Karjat" -> municipal_council, not gram_panchayat). */
  localityNotes: z.record(z.string(), z.string()).optional(),
  /** Whether a vacant plot/land purchase is charged the same rate as a built property in this state. */
  plotVsBuiltPropertySameRate: z.boolean(),
});
export type StateStampDutyRules = z.infer<typeof StateStampDutyRules>;

export const GstOnUnderConstructionRules = z.object({
  affordableHousingRate: z.number().min(0).max(1),
  affordableHousingCriteria: z.string(),
  nonAffordableRate: z.number().min(0).max(1),
  inputTaxCreditAllowed: z.boolean(),
  /** A ready-to-move property with an Occupancy/Completion Certificate is not a "supply" for GST purposes at all. */
  readyToMoveWithOccupancyCertificateRate: z.literal(0),
});
export type GstOnUnderConstructionRules = z.infer<typeof GstOnUnderConstructionRules>;

export const StampDutyRules = z.object({
  /** Keyed by state code, e.g. "TG" (Telangana), "MH" (Maharashtra). */
  states: z.record(z.string(), StateStampDutyRules),
  gstOnUnderConstruction: GstOnUnderConstructionRules,
});
export type StampDutyRules = z.infer<typeof StampDutyRules>;

/**
 * Total upfront transaction cost (stamp duty + transfer duty + metro cess +
 * registration fee, registration capped where applicable) as a rupee amount
 * for a given property value. Does not include brokerage, which the brief
 * treats as a separate, deal-specific input rather than a state-set rate.
 */
export function stampDutyAndRegistrationCost(
  propertyValue: number,
  rates: StampDutyRateSet,
  buyer: 'male' | 'female' | 'joint_or_other' = 'male',
): number {
  const stampDutyRate = buyer === 'female' ? rates.stampDutyRateFemale : rates.stampDutyRateMale;
  const stampDuty = propertyValue * (stampDutyRate + rates.transferDuty + rates.metroCess);
  const uncappedRegistration = propertyValue * rates.registrationFeeRate;
  const registration = rates.registrationFeeCap === null ? uncappedRegistration : Math.min(uncappedRegistration, rates.registrationFeeCap);
  return Math.round((stampDuty + registration + Number.EPSILON) * 100) / 100;
}
