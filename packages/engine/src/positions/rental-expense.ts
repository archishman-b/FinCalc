/**
 * Paying rent as a tenant: pure cash outflow, no asset built, no loan. The
 * brief's third property-use mode ('rental_expense') — distinct from
 * 'rented_property' (owning and letting out) and from 'owned_property'
 * (self-occupied) — this is the tenant's side of a lease, not the
 * landlord's.
 */

import type { LiquidityTier, Month, MonthlyRow, Position } from '../types';

export interface RentalExpenseInput {
  /** Monthly rent, month 1 through the full requested horizon. Bake in any escalation yourself (a step function, e.g. +5%/yr) — same convention as everywhere else in this engine. */
  monthlyRent: (month: Month) => number;
  /**
   * Refundable security deposit paid at month 1. Indian residential
   * deposits are conventionally interest-free, so it neither grows nor
   * shrinks — it's modelled as capital tied up (assetValue) for the whole
   * requested horizon, not an expense, since the position doesn't know
   * within a given horizon whether/when the tenancy actually ends and the
   * deposit is returned. Defaults to 0 (no deposit modelled).
   */
  securityDeposit?: number;
}

export function rentalExpensePosition(id: string, input: RentalExpenseInput): Position {
  const deposit = input.securityDeposit ?? 0;
  if (deposit < 0) throw new RangeError(`rentalExpensePosition: securityDeposit must be non-negative, got ${deposit}`);

  return {
    id,
    kind: 'rental_expense',
    project(months: number): MonthlyRow[] {
      if (months <= 0) throw new RangeError(`rentalExpensePosition: months must be positive, got ${months}`);
      const rows: MonthlyRow[] = [];
      for (let month = 1; month <= months; month++) {
        const depositOutflow = month === 1 ? deposit : 0;
        rows.push({
          month,
          cashOut: round2(depositOutflow + input.monthlyRent(month)),
          cashIn: 0,
          taxable: {},
          assetValue: deposit,
          liabilityBalance: 0,
          liquidityTier: 1 as LiquidityTier,
        });
      }
      return rows;
    },
  };
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
