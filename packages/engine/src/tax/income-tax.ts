/**
 * Income-tax computation: progressive slabs, the Section 87A rebate
 * (cliff for the old regime, tapered marginal relief for the new regime),
 * surcharge with its own marginal relief, Health & Education Cess, HRA
 * exemption, and the old-regime deduction stack (80C, 80D, self-occupied
 * 24(b)/22 interest).
 *
 * Scope: heads taxed at slab rates only — salary/pension, house property,
 * other sources. Capital gains are taxed at special rates (see
 * capital-gains.ts) and are combined with this module's output by the
 * caller; `computeIncomeTax`'s surcharge calculation covers ordinary
 * (non-capital-gains) income only. `rules` is whichever FY's
 * `IncomeTaxRules` pack (`@fincalc/data`) the caller resolved via
 * `getIncomeTaxRules(fy)` — this module has no FY- or figure-specific
 * knowledge of its own.
 *
 * Rounding follows Sections 288A/288B of the Income-tax Act: taxable
 * income is rounded to the nearest ₹10 before slab tax is computed, and
 * the final tax payable is rounded to the nearest ₹10 too.
 */

import type {
  IncomeTaxRules,
  RegimeRules,
  Rebate87A as Rebate87ARules,
  Section80DLimits,
  SurchargeSlab,
  TaxSlab,
} from '@fincalc/data';

export type TaxRegime = 'new' | 'old';

/** Resident-individual age band. Only the old regime's slabs vary by it (new regime is age-blind). */
export type AgeBand = 'under60' | '60to79' | '80plus';

export interface HraInput {
  /** Basic salary (+ dearness allowance, if any) for the year — the base the 10%/40%/50% shares are computed against. */
  basicSalaryAnnual: number;
  hraReceivedAnnual: number;
  rentPaidAnnual: number;
  isMetro: boolean;
}

export interface Section80DInput {
  /** Health-insurance premium (+ preventive check-up, within the statutory sub-limit — not separately modelled) paid for self and family. */
  selfAndFamilyPremium?: number;
  /** Premium paid for parents, if the taxpayer pays it — a separate, additional limit. */
  parentsPremium?: number;
  parentsAge?: 'under60' | '60orAbove';
}

export interface IncomeTaxInput {
  regime: TaxRegime;
  age: AgeBand;
  /** Gross salary/pension income for the year, before standard deduction and any HRA exemption. */
  grossSalary?: number;
  /**
   * Net income (or loss, negative) from a *let-out* house property — i.e.
   * rent received less municipal taxes, the flat 30% statutory deduction,
   * and that property's own home-loan interest — already computed by the
   * caller. A *self-occupied* property's interest is supplied separately
   * via `selfOccupiedHomeLoanInterest`, since it is capped differently and
   * carries no rental income to net against.
   */
  housePropertyIncome?: number;
  otherSourcesIncome?: number;
  /** Old regime only (`hraExemptionAllowed`) — ignored under the new regime. */
  hra?: HraInput;
  /** Gross qualifying 80C investment/spend for the year; capped internally at the regime's limit (0 under the new regime). */
  section80c?: number;
  section80d?: Section80DInput;
  /** Interest paid on a self-occupied property's home loan; capped internally at `section24bSelfOccupiedCap` (disallowed — 0 — under the new regime). */
  selfOccupiedHomeLoanInterest?: number;
}

export interface IncomeTaxResult {
  regime: TaxRegime;
  grossTotalIncome: number;
  standardDeduction: number;
  hraExemption: number;
  section80cDeduction: number;
  section80dDeduction: number;
  section24bDeduction: number;
  /** Rounded to the nearest ₹10 (Section 288A). */
  taxableIncome: number;
  taxAtSlabRates: number;
  rebate87A: number;
  taxAfterRebate: number;
  surchargeRate: number;
  /** Surcharge before any marginal relief. */
  surchargeBeforeRelief: number;
  surchargeMarginalRelief: number;
  surcharge: number;
  cess: number;
  /** Rounded to the nearest ₹10 (Section 288B). */
  totalTaxPayable: number;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Sections 288A/288B: round to the nearest ₹10, halves rounding up. */
function round10(value: number): number {
  return Math.round(value / 10) * 10;
}

/** Picks the slab table for this regime + age — the old regime's senior (60–79) and super-senior (80+) tables when applicable, else the base table. New regime is age-blind by design. */
export function resolveSlabs(regime: RegimeRules, age: AgeBand): readonly TaxSlab[] {
  if (age === '80plus' && regime.seniorSlabs?.['80']) return regime.seniorSlabs['80'];
  if (age === '60to79' && regime.seniorSlabs?.['60']) return regime.seniorSlabs['60'];
  return regime.slabs;
}

/** Progressive slab tax on a (non-negative) taxable income. `upTo: null` marks the unbounded top slab. */
export function slabTax(taxableIncome: number, slabs: readonly TaxSlab[]): number {
  if (taxableIncome <= 0) return 0;
  let tax = 0;
  let lower = 0;
  for (const slab of slabs) {
    if (taxableIncome <= lower) break;
    const upper = slab.upTo ?? Infinity;
    const sliceTop = Math.min(taxableIncome, upper);
    if (sliceTop > lower) tax += (sliceTop - lower) * slab.rate;
    lower = upper;
  }
  return round2(tax);
}

/**
 * Section 10(13A)/Schedule III three-way minimum: HRA actually received,
 * rent paid less 10% of basic salary, and 50%/40% of basic salary
 * (metro/non-metro). Never negative.
 */
export function hraExemption(input: HraInput, hraRules: IncomeTaxRules['hra']): number {
  const rate = input.isMetro ? hraRules.metroRate : hraRules.nonMetroRate;
  const rentMinusTenPct = Math.max(0, input.rentPaidAnnual - 0.1 * input.basicSalaryAnnual);
  const salaryShare = rate * input.basicSalaryAnnual;
  return round2(Math.max(0, Math.min(input.hraReceivedAnnual, rentMinusTenPct, salaryShare)));
}

/** Section 80C: qualifying spend/investment, capped at the regime's limit (0 if the regime disallows it, i.e. `limit` is null). */
export function section80cDeduction(amount: number | undefined, limit: number | null): number {
  if (!amount || limit === null) return 0;
  return round2(Math.min(amount, limit));
}

/** Section 80D: self+family and parents are separate caps, each keyed by whether that party is a senior citizen. Returns 0 under a regime that disallows it (`limits` null). */
export function section80dDeduction(
  input: Section80DInput | undefined,
  age: AgeBand,
  limits: Section80DLimits | null,
): number {
  if (!input || !limits) return 0;
  const selfLimit = age === 'under60' ? limits.selfAndFamilyUnder60 : limits.selfAndFamily60OrAbove;
  const selfDeduction = Math.min(input.selfAndFamilyPremium ?? 0, selfLimit);

  let parentsDeduction = 0;
  if (input.parentsPremium) {
    const parentsLimit = input.parentsAge === '60orAbove' ? limits.parents60OrAbove : limits.parentsUnder60;
    parentsDeduction = Math.min(input.parentsPremium, parentsLimit);
  }
  return round2(selfDeduction + parentsDeduction);
}

/** Section 24(b)/22: self-occupied home-loan interest, capped at the regime's limit (0 if the regime disallows it, i.e. `cap` is null). */
export function section24bDeduction(interest: number | undefined, cap: number | null): number {
  if (!interest || cap === null) return 0;
  return round2(Math.min(interest, cap));
}

/**
 * Section 71(3A)/109(1)(b): a net house-property loss can only be set off
 * against other heads up to `cap` rupees this year (₹2,00,000 old regime;
 * `0` under the new regime, where inter-head set-off is disallowed
 * entirely — see the `housePropertyLossSetOffCapAgainstOtherHeads` doc
 * comment in @fincalc/data for why this engine doesn't track the excess's
 * 8-year carry-forward). A non-negative `netHouseProperty` (rent income
 * exceeding deductions) passes through unchanged — the cap only bites a
 * loss.
 */
export function capHousePropertyLossSetOff(netHouseProperty: number, cap: number): number {
  if (netHouseProperty >= 0) return netHouseProperty;
  return -round2(Math.min(-netHouseProperty, cap));
}

/**
 * Section 87A rebate. Below/at the threshold income, the rebate zeroes tax
 * up to `maxRebate` (a cliff either way — the old regime's ₹12,500 always
 * fully covers slab tax at ₹5L). Above the threshold: the old regime gets
 * no relief at all (`marginalRelief: false` — crossing ₹5L loses the whole
 * rebate at once); the new regime tapers it so tax payable never exceeds
 * (taxableIncome − threshold), i.e. nobody nets less than someone earning
 * exactly the threshold.
 */
export function rebate87A(taxableIncome: number, taxAtSlabRates: number, rules: Rebate87ARules): number {
  if (taxableIncome <= rules.thresholdIncome) {
    return round2(Math.min(taxAtSlabRates, rules.maxRebate));
  }
  if (!rules.marginalRelief) return 0;
  const marginalCap = taxableIncome - rules.thresholdIncome;
  return round2(Math.max(0, taxAtSlabRates - Math.min(taxAtSlabRates, marginalCap)));
}

function effectiveSurchargeSlabs(slabs: readonly SurchargeSlab[], cap: number | null): SurchargeSlab[] {
  const sorted = [...slabs].sort((a, b) => a.above - b.above);
  return cap === null ? sorted : sorted.map((s) => ({ above: s.above, rate: Math.min(s.rate, cap) }));
}

/** The surcharge rate this income falls into, after applying a regime/income-type cap (e.g. the new regime's 25% ceiling, or the 15% capital-gains cap). */
export function applicableSurchargeRate(
  totalIncome: number,
  slabs: readonly SurchargeSlab[],
  cap: number | null,
): number {
  const eff = effectiveSurchargeSlabs(slabs, cap);
  let rate = 0;
  for (const slab of eff) if (totalIncome > slab.above) rate = slab.rate;
  return rate;
}

export interface SurchargeResult {
  rate: number;
  surchargeBeforeRelief: number;
  marginalRelief: number;
  surcharge: number;
}

/**
 * Surcharge with marginal relief: crossing a surcharge threshold can never
 * cost more in extra (tax + surcharge) than the extra income itself. For
 * whichever threshold the income actually crossed to reach its current
 * rate, relief = (tax+surcharge at the actual income) − (tax+surcharge at
 * the threshold, using the rate that applied just below it) − (income −
 * threshold), floored at 0. `taxAtIncome` recomputes slab tax at a
 * hypothetical income using the same slab table as the actual taxpayer —
 * callers pass `(income) => slabTax(income, slabs)`.
 */
export function surchargeWithMarginalRelief(
  totalIncome: number,
  taxAfterRebate: number,
  slabs: readonly SurchargeSlab[],
  cap: number | null,
  taxAtIncome: (income: number) => number,
): SurchargeResult {
  const eff = effectiveSurchargeSlabs(slabs, cap);
  const rate = applicableSurchargeRate(totalIncome, slabs, cap);
  if (rate === 0) return { rate: 0, surchargeBeforeRelief: 0, marginalRelief: 0, surcharge: 0 };

  const surchargeBeforeRelief = round2(taxAfterRebate * rate);

  let threshold = 0;
  let idx = -1;
  eff.forEach((slab, i) => {
    if (totalIncome > slab.above) {
      threshold = slab.above;
      idx = i;
    }
  });
  const prevRate = idx <= 0 ? 0 : eff[idx - 1]!.rate;

  const taxAtThreshold = taxAtIncome(threshold);
  const taxPlusSurchargeAtThreshold = round2(taxAtThreshold * (1 + prevRate));
  const taxPlusSurchargeActual = round2(taxAfterRebate * (1 + rate));
  const allowedTotal = taxPlusSurchargeAtThreshold + (totalIncome - threshold);

  if (taxPlusSurchargeActual <= allowedTotal) {
    return { rate, surchargeBeforeRelief, marginalRelief: 0, surcharge: surchargeBeforeRelief };
  }
  const marginalRelief = round2(taxPlusSurchargeActual - allowedTotal);
  return { rate, surchargeBeforeRelief, marginalRelief, surcharge: round2(surchargeBeforeRelief - marginalRelief) };
}

/** Full income-tax computation for one financial year's ordinary (slab-taxed) income under one regime. */
export function computeIncomeTax(input: IncomeTaxInput, rules: IncomeTaxRules): IncomeTaxResult {
  const regimeRules = rules.regimes[input.regime];

  const grossSalary = input.grossSalary ?? 0;
  const hraExemptionAmount =
    input.hra && regimeRules.hraExemptionAllowed ? hraExemption(input.hra, rules.hra) : 0;
  const standardDeduction = grossSalary > 0 ? regimeRules.standardDeduction : 0;
  const netSalary = Math.max(0, grossSalary - hraExemptionAmount - standardDeduction);

  const section24b = section24bDeduction(input.selfOccupiedHomeLoanInterest, regimeRules.section24bSelfOccupiedCap);
  const rawHouseProperty = (input.housePropertyIncome ?? 0) - section24b;
  const netHouseProperty = capHousePropertyLossSetOff(rawHouseProperty, regimeRules.housePropertyLossSetOffCapAgainstOtherHeads);

  const grossTotalIncome = round2(netSalary + netHouseProperty + (input.otherSourcesIncome ?? 0));

  const section80c = section80cDeduction(input.section80c, regimeRules.section80cLimit);
  const section80d = section80dDeduction(input.section80d, input.age, regimeRules.section80dLimits);

  const taxableIncome = Math.max(0, round10(grossTotalIncome - section80c - section80d));

  const slabs = resolveSlabs(regimeRules, input.age);
  const taxAtSlabRates = slabTax(taxableIncome, slabs);
  const rebate = rebate87A(taxableIncome, taxAtSlabRates, regimeRules.rebate87A);
  const taxAfterRebate = round2(taxAtSlabRates - rebate);

  const cap = input.regime === 'new' ? rules.surcharge.newRegimeCap : null;
  const surchargeResult = surchargeWithMarginalRelief(
    taxableIncome,
    taxAfterRebate,
    rules.surcharge.slabs,
    cap,
    (income) => slabTax(income, slabs),
  );

  const cess = round2((taxAfterRebate + surchargeResult.surcharge) * rules.cess);
  const totalTaxPayable = round10(taxAfterRebate + surchargeResult.surcharge + cess);

  return {
    regime: input.regime,
    grossTotalIncome,
    standardDeduction,
    hraExemption: hraExemptionAmount,
    section80cDeduction: section80c,
    section80dDeduction: section80d,
    section24bDeduction: section24b,
    taxableIncome,
    taxAtSlabRates,
    rebate87A: rebate,
    taxAfterRebate,
    surchargeRate: surchargeResult.rate,
    surchargeBeforeRelief: surchargeResult.surchargeBeforeRelief,
    surchargeMarginalRelief: surchargeResult.marginalRelief,
    surcharge: surchargeResult.surcharge,
    cess,
    totalTaxPayable,
  };
}
