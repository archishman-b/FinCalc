/**
 * Real-estate Position models — owned (self-occupied), let-out (rented) and
 * plot (vacant land). The brief's three "property use modes" map onto three
 * distinct PositionKinds (owned_property / rented_property / plot) rather
 * than one kind with a `use` discriminator — see decisions-and-workflow.md.
 * All three share the same underlying mechanics: an optional wrapped loan
 * (reusing loanPosition, never re-implementing amortize() here), monthly
 * holding costs, and appreciation via appreciateSeries — and differ only in
 * whether rent is collected and whether house-property taxable income
 * arises.
 *
 * Section 24(b)/22 self-occupied interest deduction and the house-property
 * loss set-off restriction are household-level tax-computation concerns
 * (they need the regime and, for self-occupied, the rest of the household's
 * income) — out of scope for a Position, which only emits the raw monthly
 * streams. `loanAmortization()` exposes the per-month interest so that
 * later computation (Phase 4) can apply those rules without this module
 * needing to know about regimes at all.
 *
 * Deliberately not modelled in this pass (documented rather than guessed):
 * pre-construction/pre-possession interest does not get the special
 * spread-over-5-years treatment real tax law gives it — a month before
 * `possessionMonth` simply accrues no house-property taxable income at all.
 */

import type { AmortizationRow } from '../amortization';
import type { AnnualRate, LiquidityTier, MarketContext, Month, MonthlyRow, Position, SeriesId, TaxableByHead } from '../types';

import { loanPosition } from './loan';
import { appreciateSeries } from './shared';

export interface RealEstateLoanInput {
  principal: number;
  annualRate: (month: Month) => AnnualRate;
  tenureMonths: number;
  scheduledPayment?: (month: Month, openingBalance: number) => number;
  extraPrepayment?: (month: Month, openingBalance: number) => number;
}

export interface RealEstatePositionInput {
  purchasePrice: number;
  /**
   * Stamp duty + registration + GST-on-under-construction (if applicable) +
   * entry brokerage, as a single upfront rupee figure. Resolved by the
   * caller from @fincalc/data (stampDutyAndRegistrationCost(), etc.) —
   * which state/local-body/GST-slab applies is a @data lookup concern, not
   * this Position's. Charged entirely in month 1. Defaults to 0.
   */
  entryCosts?: number;
  /** Financing, if any. Omit for an all-cash purchase. */
  loan?: RealEstateLoanInput;
  /** MarketContext series this property's value appreciates at, looked up per month (see appreciateSeries in shared.ts). */
  appreciationSeries: SeriesId;
  /** Ongoing monthly holding cost (society maintenance, upkeep) — separate from municipal property tax. Defaults to 0 every month. */
  maintenancePerMonth?: (month: Month) => number;
  /** Municipal property tax, billed once a year (every 12th month) as a lump cash outflow. Defaults to 0. */
  annualPropertyTax?: number;
  /**
   * 1-based month the property becomes usable — rentable for a let-out
   * property, occupiable for a self-occupied one. Before this month no
   * rent/self-use accrues, but a loan (if any) keeps running on its own
   * schedule — the "pay EMI on an asset you can't use yet" possession-lag
   * case for an under-construction purchase. Defaults to 1 (ready-to-move).
   */
  possessionMonth?: number;
  /** 2 for a city flat (sells in weeks to months), 3 for a plot in a thin market (up to a year) — see LiquidityTier. The caller sets this rather than the Position guessing from purchase price. */
  liquidityTier: LiquidityTier;
}

export interface LetOutPropertyInput extends RealEstatePositionInput {
  /** Gross monthly rent from possession onward, before vacancy. Bake in any escalation yourself (a step function, e.g. +5%/yr) — same convention as annualRate/scheduledPayment elsewhere in this engine. */
  monthlyRent: (month: Month) => number;
  /** Fraction of months expected vacant (0-1), applied as an expected-value haircut to every month's rent rather than modelled as discrete vacancy events — a Monte Carlo path (Phase 7) is the right place for the latter. Defaults to 0. */
  vacancyRate?: number;
  /**
   * Section 24(a)/22 standard-deduction rate against Net Annual Value (flat
   * 30% under current law, both Acts — see
   * getIncomeTaxRules(fy).houseProperty.standardDeductionRate in
   * @fincalc/data). Resolved by the caller, never hardcoded here.
   */
  standardDeductionRate: number;
}

export interface RealEstatePosition extends Position {
  /**
   * The wrapped loan's raw amortisation schedule, for callers needing
   * per-month interest (Section 24(b)/22, or 80C principal repayment) or
   * principal detail — [] when unfinanced. Stops once the loan pays off
   * rather than padding to `months` (see loanPosition.amortization).
   */
  loanAmortization(months: number): AmortizationRow[];
}

function validateCommon(input: RealEstatePositionInput): void {
  if (input.purchasePrice <= 0) throw new RangeError(`purchasePrice must be positive, got ${input.purchasePrice}`);
  const principal = input.loan?.principal ?? 0;
  if (principal < 0) throw new RangeError(`loan principal must be non-negative, got ${principal}`);
  if (principal > input.purchasePrice) {
    throw new RangeError(`loan principal (${principal}) cannot exceed purchasePrice (${input.purchasePrice})`);
  }
  const possession = input.possessionMonth ?? 1;
  if (possession < 1) throw new RangeError(`possessionMonth must be >= 1, got ${possession}`);
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Builds the optional wrapped loan Position once, shared by project() and loanAmortization(). */
function buildLoan(id: string, input: RealEstatePositionInput) {
  if (!input.loan) return undefined;
  return loanPosition(`${id}:loan`, {
    principal: input.loan.principal,
    annualRate: input.loan.annualRate,
    tenureMonths: input.loan.tenureMonths,
    ...(input.loan.scheduledPayment ? { scheduledPayment: input.loan.scheduledPayment } : {}),
    ...(input.loan.extraPrepayment ? { extraPrepayment: input.loan.extraPrepayment } : {}),
  });
}

/** The mechanics every property kind shares: down payment + entry costs in month 1, EMI/balance from the wrapped loan (if any), maintenance every month, property tax every 12th month, and appreciation for the full horizon regardless of what happens to the loan. cashIn/taxable are left for each kind to fill in — self-occupied/plot never populate them, let-out does. */
function buildCoreRows(
  input: RealEstatePositionInput,
  months: number,
  ctx: MarketContext,
  loan: ReturnType<typeof loanPosition> | undefined,
): MonthlyRow[] {
  const downPayment = input.purchasePrice - (input.loan?.principal ?? 0);
  const loanRows = loan ? loan.project(months, ctx) : undefined;
  const values = appreciateSeries(input.purchasePrice, months, ctx, input.appreciationSeries);
  const entryCosts = input.entryCosts ?? 0;
  const maintenance = input.maintenancePerMonth ?? (() => 0);
  const annualPropertyTax = input.annualPropertyTax ?? 0;

  const rows: MonthlyRow[] = [];
  for (let month = 1; month <= months; month++) {
    const upfront = month === 1 ? downPayment + entryCosts : 0;
    const emi = loanRows ? loanRows[month - 1]!.cashOut : 0;
    const liabilityBalance = loanRows ? loanRows[month - 1]!.liabilityBalance : 0;
    const propertyTax = month % 12 === 0 ? annualPropertyTax : 0;
    rows.push({
      month,
      cashOut: round2(upfront + emi + maintenance(month) + propertyTax),
      cashIn: 0,
      taxable: {},
      assetValue: values[month - 1]!,
      liabilityBalance,
      liquidityTier: input.liquidityTier,
    });
  }
  return rows;
}

/** A self-occupied property: no rent, no house-property income (nil annual value under the Income Tax Act) — just the cost of holding a place to live. */
export function ownedPropertyPosition(id: string, input: RealEstatePositionInput): RealEstatePosition {
  validateCommon(input);
  const loan = buildLoan(id, input);
  return {
    id,
    kind: 'owned_property',
    loanAmortization: (months: number) => loan?.amortization(months) ?? [],
    project(months: number, ctx: MarketContext): MonthlyRow[] {
      return buildCoreRows(input, months, ctx, loan);
    },
  };
}

/** A vacant plot: no rent, no house-property income, holding costs only — appreciation is the entire investment case. */
export function plotPosition(id: string, input: RealEstatePositionInput): RealEstatePosition {
  validateCommon(input);
  const loan = buildLoan(id, input);
  return {
    id,
    kind: 'plot',
    loanAmortization: (months: number) => loan?.amortization(months) ?? [],
    project(months: number, ctx: MarketContext): MonthlyRow[] {
      return buildCoreRows(input, months, ctx, loan);
    },
  };
}

/**
 * A let-out property: rent received (net of vacancy) is real cash income,
 * and — from possession onward — taxable under the house-property head as
 * Net Annual Value (rent minus the accrued share of municipal property tax)
 * less the flat standard deduction and the month's loan interest. The 30%
 * standard deduction is a fixed statutory fraction of NAV, so applying it
 * monthly and summing 12 months gives the same annual total as computing
 * it once a year — this Position reports monthly for consistency with
 * every other stream in the engine, not because the law taxes it monthly.
 * The result can be negative (a house-property loss); whether that loss
 * can be set off against salary is a regime-dependent household-level rule
 * (new regime disallows it) applied later, not here.
 */
export function letOutPropertyPosition(id: string, input: LetOutPropertyInput): RealEstatePosition {
  validateCommon(input);
  const vacancyRate = input.vacancyRate ?? 0;
  if (vacancyRate < 0 || vacancyRate > 1) throw new RangeError(`vacancyRate must be between 0 and 1, got ${vacancyRate}`);
  if (input.standardDeductionRate < 0 || input.standardDeductionRate > 1) {
    throw new RangeError(`standardDeductionRate must be between 0 and 1, got ${input.standardDeductionRate}`);
  }

  const loan = buildLoan(id, input);
  const possessionMonth = input.possessionMonth ?? 1;
  const annualPropertyTax = input.annualPropertyTax ?? 0;

  return {
    id,
    kind: 'rented_property',
    loanAmortization: (months: number) => loan?.amortization(months) ?? [],
    project(months: number, ctx: MarketContext): MonthlyRow[] {
      const rows = buildCoreRows(input, months, ctx, loan);
      const amortization = loan ? loan.amortization(months) : [];

      return rows.map((row, i): MonthlyRow => {
        const month = row.month;
        if (month < possessionMonth) return row; // not yet usable: no income accrues, but the loan (if any) keeps running

        const grossRent = round2(input.monthlyRent(month) * (1 - vacancyRate));
        const interest = amortization[i]?.interest ?? 0;
        const netAnnualValue = grossRent - annualPropertyTax / 12;
        const netHouseProperty = round2(netAnnualValue * (1 - input.standardDeductionRate) - interest);
        const taxable: TaxableByHead = { house_property: netHouseProperty };

        return { ...row, cashIn: grossRent, taxable };
      });
    },
  };
}
