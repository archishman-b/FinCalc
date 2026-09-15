/**
 * Capital-gains computation: equity/REIT LTCG & STCG, debt-fund gains
 * (post-2023 slab taxation, with the pre-2023 grandfathered LTCG carve-out),
 * property LTCG — including the post-23-July-2024 transitional 12.5%-no-
 * indexation vs 20%-with-indexation choice — and the Section 54/54F/54EC
 * reinvestment exemptions.
 *
 * `rules` is whichever FY's `CapitalGainsRules` pack (`@fincalc/data`) the
 * caller resolved via `getCapitalGainsRules(fy)`; `cii` is the shared,
 * FY-spanning `CostInflationIndexRules` table via `getCostInflationIndexRules()`.
 *
 * Two results a gain can settle into:
 *  - `{ kind: 'slab' }`: taxed as ordinary income at the household's slab
 *    rate (short-term debt-fund/property/equity/REIT gains, and post-2023
 *    debt-fund gains regardless of holding period). The caller folds
 *    `amount` into `otherSourcesIncome` before calling `computeIncomeTax` —
 *    this module never guesses a slab rate itself.
 *  - `{ kind: 'flat' }`: taxed at its own special rate, independent of the
 *    household's slab income (equity/REIT/property LTCG, grandfathered debt
 *    LTCG).
 *
 * A loss (gain <= 0) always taxes as zero — this module doesn't model
 * inter-head/inter-year loss set-off; that's a Phase 3 Position concern.
 */

import type {
  CapitalGainsRules,
  CostInflationIndexRules,
  Section54ECRules,
  Section54FRules,
  Section54Rules,
} from '@fincalc/data';
import { lookupCII } from '@fincalc/data';

export interface SlabTaxableGain {
  kind: 'slab';
  /** Add this to the household's otherSourcesIncome before computing income tax. */
  amount: number;
}

export interface FlatTaxedGain {
  kind: 'flat';
  taxableAmount: number;
  rate: number;
  tax: number;
}

export type GainTaxResult = SlabTaxableGain | FlatTaxedGain;

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function slab(amount: number): SlabTaxableGain {
  return { kind: 'slab', amount: Math.max(0, round2(amount)) };
}

function flat(taxableAmount: number, rate: number): FlatTaxedGain {
  const taxable = Math.max(0, round2(taxableAmount));
  return { kind: 'flat', taxableAmount: taxable, rate, tax: round2(taxable * rate) };
}

/** Indexed cost = original cost × CII(saleFy) / CII(acquisitionFy) — Section 48's indexation formula. */
export function indexedCost(originalCost: number, acquisitionFy: string, saleFy: string, cii: CostInflationIndexRules): number {
  const acquisitionCii = lookupCII(acquisitionFy, cii);
  const saleCii = lookupCII(saleFy, cii);
  return round2(originalCost * (saleCii / acquisitionCii));
}

export interface EquityLikeGainInput {
  gain: number;
  holdingMonths: number;
}

/** Equity shares/mutual-fund units taxed under the equity STCG/LTCG regime (111A/112A old Act, 196/198 new Act). */
export function equityGainsTax(input: EquityLikeGainInput, rules: CapitalGainsRules['equity']): GainTaxResult {
  if (input.gain <= 0) return flat(0, rules.ltcgRate);
  if (input.holdingMonths < rules.holdingPeriodMonthsForLtcg) return flat(input.gain, rules.stcgRate);
  return flat(Math.max(0, input.gain - rules.ltcgExemptionPerYear), rules.ltcgRate);
}

/** Listed REIT/InvIT units — same shape as equity, but the annual LTCG exemption may not (yet) apply for the FY (`ltcgExemptionPerYear: null`). */
export function reitGainsTax(input: EquityLikeGainInput, rules: CapitalGainsRules['reit']): GainTaxResult {
  if (input.gain <= 0) return flat(0, rules.ltcgRate);
  if (input.holdingMonths < rules.holdingPeriodMonthsForLtcg) return flat(input.gain, rules.stcgRate);
  const exemption = rules.ltcgExemptionPerYear ?? 0;
  return flat(Math.max(0, input.gain - exemption), rules.ltcgRate);
}

export interface DebtFundGainInput {
  gain: number;
  holdingMonths: number;
  /** Units acquired on/after `rules.slabTaxationAppliesFrom` are always slab-taxed, whatever the holding period (Finance Act 2023). */
  acquiredOnOrAfterSlabTaxationDate: boolean;
}

/** Debt/money-market mutual funds: post-2023 units are always slab-taxed; pre-2023 (grandfathered) units held long enough get flat LTCG with no indexation. */
export function debtFundGainsTax(input: DebtFundGainInput, rules: CapitalGainsRules['debtFunds']): GainTaxResult {
  if (input.gain <= 0) return slab(0);
  if (input.acquiredOnOrAfterSlabTaxationDate) return slab(input.gain);
  if (input.holdingMonths >= rules.grandfatheredHoldingPeriodMonthsForLtcg) {
    return flat(input.gain, rules.grandfatheredLtcgRate);
  }
  return slab(input.gain);
}

export interface PropertyRouteOptions {
  /** Always available: 12.5% flat, no indexation. */
  noIndexation: FlatTaxedGain;
  /** Only present when the transitional choice applies (eligible taxpayer + acquired before the cutoff date) — 20% on the indexed gain. */
  withIndexation: FlatTaxedGain | null;
}

export interface PropertyGainInput {
  saleValue: number;
  costOfAcquisition: number;
  costOfImprovement?: number;
  acquisitionFy: string;
  saleFy: string;
  holdingMonths: number;
  taxpayerType: 'resident_individual' | 'resident_huf' | 'other';
}

/** Property held short of the LTCG holding period: slab-taxed, no indexation or route choice. */
export function isPropertyShortTerm(holdingMonths: number, rules: CapitalGainsRules['property']): boolean {
  return holdingMonths < rules.holdingPeriodMonthsForLtcg;
}

/**
 * The two LTCG route options for a property sale, each priced (pre-exemption)
 * in isolation. `withIndexation` is null when the transitional choice isn't
 * available (a non-individual/HUF, or the property was acquired on/after the
 * cutoff date) — in that case only the default 12.5%-no-indexation route
 * exists at all.
 */
export function propertyLtcgRouteOptions(
  input: PropertyGainInput,
  rules: CapitalGainsRules['property'],
  cii: CostInflationIndexRules,
): PropertyRouteOptions {
  const totalCost = input.costOfAcquisition + (input.costOfImprovement ?? 0);
  const gainNoIndexation = input.saleValue - totalCost;
  const noIndexation = flat(gainNoIndexation, rules.ltcgRateNoIndexation);

  // The cutoff is a calendar date (23 July 2024), not a clean FY boundary — a caller who only
  // knows the acquisition FY (not the exact date) gets the transitional option only when the
  // whole acquisition FY predates the cutoff FY (2024-25). Property bought during FY2024-25
  // itself straddles the cutoff and needs its own exact-date check, which this FY-granular
  // helper deliberately doesn't attempt — it conservatively treats that FY as ineligible
  // rather than guessing which side of 23 July the purchase fell on.
  const eligibleTaxpayerTypes: readonly string[] = rules.transitionalOption.eligibleTaxpayers;
  const cutoffYear = Number(rules.transitionalOption.acquiredBefore.slice(0, 4));
  const acquisitionStartYear = Number(input.acquisitionFy.slice(0, 4));
  const eligible = eligibleTaxpayerTypes.includes(input.taxpayerType) && acquisitionStartYear < cutoffYear;

  const withIndexation = eligible
    ? flat(input.saleValue - indexedCost(totalCost, input.acquisitionFy, input.saleFy, cii), rules.transitionalOption.rateWithIndexation)
    : null;

  return { noIndexation, withIndexation };
}

/**
 * Section 54: LTCG on a residential house, reinvested into another residential
 * house. Only the amount — not the statutory purchase/construction window
 * (`purchaseWindowMonthsBefore/After`, `constructionWindowMonthsAfter`) or the
 * once-in-a-lifetime two-house exception — is checked here; a caller must
 * confirm the reinvestment falls within that window before relying on this.
 */
export function section54Exemption(gain: number, amountReinvested: number, rules: Section54Rules): number {
  if (gain <= 0 || amountReinvested <= 0) return 0;
  const eligibleGain = Math.min(gain, rules.capOnGainsConsidered ?? Infinity);
  return round2(Math.min(eligibleGain, amountReinvested));
}

/** Section 54F: LTCG on any asset other than a residential house, reinvested into a residential house — exemption is proportional to the share of net sale consideration reinvested. */
export function section54FExemption(
  gain: number,
  netSaleConsideration: number,
  amountReinvested: number,
  otherResidentialHousesOwned: number,
  rules: Section54FRules,
): number {
  if (gain <= 0 || amountReinvested <= 0 || netSaleConsideration <= 0) return 0;
  if (otherResidentialHousesOwned > rules.maxOtherResidentialHousesOwned) return 0;
  const eligibleGain = Math.min(gain, rules.capOnGainsConsidered ?? Infinity);
  const investedShare = Math.min(1, amountReinvested / netSaleConsideration);
  return round2(Math.min(eligibleGain, eligibleGain * investedShare));
}

/** Section 54EC: LTCG on land/building, invested in specified bonds (NHAI/REC/PFC/IRFC/HUDCO) within the investment window, capped at `investmentCap`. */
export function section54ECExemption(gain: number, amountInvestedInBonds: number, rules: Section54ECRules): number {
  if (gain <= 0 || amountInvestedInBonds <= 0) return 0;
  return round2(Math.min(gain, amountInvestedInBonds, rules.investmentCap));
}

export interface PropertyLtcgResolution {
  chosenRoute: 'noIndexation' | 'withIndexation';
  preExemption: FlatTaxedGain;
  exemptionApplied: number;
  result: FlatTaxedGain;
}

/**
 * Resolves the property LTCG regime choice *after* applying a reinvestment
 * exemption to each route's own gain figure, then picks whichever route
 * gives the lower final tax. This is the correct order: a route with a
 * higher pre-exemption rate/gain can still win once a reinvestment shelters
 * a larger share of its (smaller) indexed gain than of the other route's
 * (larger) unindexed one — comparing headline pre-exemption tax and picking
 * the "obviously" cheaper route can silently pick the wrong one.
 */
export function resolvePropertyLtcgWithExemption(
  routes: PropertyRouteOptions,
  exemption: (gain: number) => number,
): PropertyLtcgResolution {
  const noIndexationExemption = exemption(routes.noIndexation.taxableAmount);
  const noIndexationFinal = flat(routes.noIndexation.taxableAmount - noIndexationExemption, routes.noIndexation.rate);

  if (!routes.withIndexation) {
    return {
      chosenRoute: 'noIndexation',
      preExemption: routes.noIndexation,
      exemptionApplied: noIndexationExemption,
      result: noIndexationFinal,
    };
  }

  const withIndexationExemption = exemption(routes.withIndexation.taxableAmount);
  const withIndexationFinal = flat(routes.withIndexation.taxableAmount - withIndexationExemption, routes.withIndexation.rate);

  if (withIndexationFinal.tax < noIndexationFinal.tax) {
    return {
      chosenRoute: 'withIndexation',
      preExemption: routes.withIndexation,
      exemptionApplied: withIndexationExemption,
      result: withIndexationFinal,
    };
  }
  return {
    chosenRoute: 'noIndexation',
    preExemption: routes.noIndexation,
    exemptionApplied: noIndexationExemption,
    result: noIndexationFinal,
  };
}

/**
 * Full property-sale computation: routes to slab taxation for a short-term
 * holding, otherwise prices both available LTCG routes and — if an
 * `exemption` function is supplied (e.g. wrapping `section54Exemption` with
 * the reinvestment amount already bound) — resolves the regime choice after
 * exemption per `resolvePropertyLtcgWithExemption`. Without an `exemption`
 * argument, the exemption is treated as zero on both routes (still picking
 * whichever route's pre-exemption tax is lower).
 */
export function computePropertyGains(
  input: PropertyGainInput,
  rules: CapitalGainsRules['property'],
  cii: CostInflationIndexRules,
  exemption: (gain: number) => number = () => 0,
): GainTaxResult | PropertyLtcgResolution {
  if (isPropertyShortTerm(input.holdingMonths, rules)) {
    return slab(input.saleValue - input.costOfAcquisition - (input.costOfImprovement ?? 0));
  }
  const routes = propertyLtcgRouteOptions(input, rules, cii);
  return resolvePropertyLtcgWithExemption(routes, exemption);
}
