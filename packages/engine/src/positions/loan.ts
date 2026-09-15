/**
 * A standalone loan Position — a bare liability with no attached asset.
 * Used directly for the Tier 1 EMI/loan-comparison calculators, and as the
 * mechanism real-estate Positions (owned_property/rented_property/plot)
 * wrap internally when they carry financing. Every real financial detail
 * (reducing-balance amortisation, prepayment, step-up EMI, mid-tenure rate
 * changes) lives in amortize()/emi() from Phase 1 — this is just the
 * Position-interface wrapper around it.
 */

import { amortize, emi } from '../amortization';
import type { AmortizationRow } from '../amortization';
import type { AnnualRate, Month, MonthlyRow, Position } from '../types';

import { padAmortizationRows } from './shared';

export interface LoanPositionInput {
  principal: number;
  /** Nominal annual rate in effect for a given month — a constant `() => rate` for a fixed-rate loan, or a callback for a rate change/refinance mid-tenure. */
  annualRate: (month: Month) => AnnualRate;
  tenureMonths: number;
  /** Defaults to the level EMI for (principal, annualRate at month 1, tenureMonths). Supply your own for a step-up EMI. */
  scheduledPayment?: (month: Month, openingBalance: number) => number;
  /** Extra principal beyond the scheduled instalment — a lump prepayment at one month, or a recurring one every month. */
  extraPrepayment?: (month: Month, openingBalance: number) => number;
}

export interface LoanPosition extends Position {
  readonly kind: 'loan';
  /** The raw amortisation schedule for `months` months (undpadded — stops once the loan is paid off), for callers that need per-month interest/principal detail (e.g. Section 24(b) interest, or Section 80C principal repayment) rather than just the Position stream. */
  amortization(months: number): AmortizationRow[];
}

export function loanPosition(id: string, input: LoanPositionInput): LoanPosition {
  const { principal, annualRate, tenureMonths } = input;
  if (principal < 0) throw new RangeError(`loanPosition: principal must be non-negative, got ${principal}`);
  if (tenureMonths <= 0) throw new RangeError(`loanPosition: tenureMonths must be positive, got ${tenureMonths}`);

  const levelInstalment = emi(principal, annualRate(1), tenureMonths);
  const scheduledPayment = input.scheduledPayment ?? (() => levelInstalment);

  function amortization(months: number): AmortizationRow[] {
    return amortize({
      principal,
      annualRate,
      scheduledPayment,
      ...(input.extraPrepayment ? { extraPrepayment: input.extraPrepayment } : {}),
      months,
    });
  }

  return {
    id,
    kind: 'loan',
    amortization,
    project(months: number): MonthlyRow[] {
      const rows = padAmortizationRows(amortization(months), months);
      return rows.map(
        (r): MonthlyRow => ({
          month: r.month,
          cashOut: r.totalPayment,
          cashIn: 0,
          taxable: {},
          assetValue: 0,
          liabilityBalance: r.closingBalance,
          liquidityTier: 1,
        }),
      );
    },
  };
}
