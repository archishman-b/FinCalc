/**
 * Market-linked investment Positions — a recurring (optionally step-up) SIP
 * and a one-time lumpsum — both thin wrappers around compounding.ts's
 * compoundContributions(), the same way loanPosition wraps amortize().
 *
 * Neither emits any taxable income during accumulation: a plain
 * growth-oriented equity/debt-fund investment has no income event until
 * redemption (unlike a REIT's interest/dividend/rental components, or an
 * FD's interest, which the brief's principle 11 calls out precisely because
 * they *are* taxed annually on receipt/accrual). Capital-gains tax on exit
 * is a Comparator concern (Phase 4), applied once at whichever horizon is
 * being evaluated — not something a monthly stream can express.
 */

import { compoundContributions } from '../compounding';
import type { LiquidityTier, MarketContext, Month, MonthlyRow, Position, SeriesId } from '../types';

export interface SipPositionInput {
  /** The instalment for a given month — a constant `() => amount` for a plain SIP, or a callback returning a larger figure in later months for a step-up SIP. Same convention as scheduledPayment elsewhere in this engine. */
  monthlyContribution: (month: Month) => number;
  /** MarketContext series this investment grows at, looked up per month — a constant rate, a bear/base/bull path, or (Phase 7) one leg of a Monte Carlo simulation are all the same plug. */
  growthSeries: SeriesId;
  /** Balance already in the account before month 1, if this SIP continues into an existing corpus. Defaults to 0. */
  openingBalance?: number;
  /** 1 for a listed/liquid mutual fund or direct-equity SIP (sells in days) — see LiquidityTier. Defaults to 1. */
  liquidityTier?: LiquidityTier;
}

export function sipPosition(id: string, input: SipPositionInput): Position {
  const openingBalance = input.openingBalance ?? 0;
  if (openingBalance < 0) throw new RangeError(`sipPosition: openingBalance must be non-negative, got ${openingBalance}`);
  const liquidityTier = input.liquidityTier ?? 1;

  return {
    id,
    kind: 'sip',
    project(months: number, ctx: MarketContext): MonthlyRow[] {
      const rows = compoundContributions(input.monthlyContribution, (month) => ctx.rate(input.growthSeries, month), months, openingBalance);
      return rows.map(
        (r): MonthlyRow => ({
          month: r.month,
          cashOut: r.contribution,
          cashIn: 0,
          taxable: {},
          assetValue: r.closingValue,
          liabilityBalance: 0,
          liquidityTier,
        }),
      );
    },
  };
}

export interface LumpsumPositionInput {
  principal: number;
  growthSeries: SeriesId;
  liquidityTier?: LiquidityTier;
}

/** A one-time investment left to compound — the whole `principal` leaves the household in month 1 and nothing more is contributed. Just sipPosition with a single non-zero month, but named separately since 'lumpsum' is its own PositionKind (a lumpsum and a SIP read very differently in an Assumptions panel even though the mechanism underneath is identical). */
export function lumpsumPosition(id: string, input: LumpsumPositionInput): Position {
  if (input.principal < 0) throw new RangeError(`lumpsumPosition: principal must be non-negative, got ${input.principal}`);
  const liquidityTier = input.liquidityTier ?? 1;

  return {
    id,
    kind: 'lumpsum',
    project(months: number, ctx: MarketContext): MonthlyRow[] {
      const rows = compoundContributions((month) => (month === 1 ? input.principal : 0), (month) => ctx.rate(input.growthSeries, month), months);
      return rows.map(
        (r): MonthlyRow => ({
          month: r.month,
          cashOut: r.contribution,
          cashIn: 0,
          taxable: {},
          assetValue: r.closingValue,
          liabilityBalance: 0,
          liquidityTier,
        }),
      );
    },
  };
}
