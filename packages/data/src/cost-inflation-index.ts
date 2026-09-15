/**
 * Typed shape of the `rules` object inside the (single, FY-spanning)
 * cost-inflation-index pack. Unlike the income-tax/capital-gains packs,
 * there is only ever one of these — it's a cumulative table, not a
 * per-FY ruleset — keyed by the FY it was last notified/verified through.
 */

import { z } from 'zod';

import { FinancialYear } from './schema';

export const CostInflationIndexRules = z.object({
  /** The FY whose CII is 100 — currently 2001-02 (reset by the Finance Act, 2017). */
  baseYear: FinancialYear,
  /** CII value by financial year, e.g. { "2001-02": 100, ..., "2026-27": 384 }. */
  index: z.record(FinancialYear, z.number().positive()),
});
export type CostInflationIndexRules = z.infer<typeof CostInflationIndexRules>;

/** Looks up one FY's CII in an already-validated table; throws if that FY isn't covered yet. */
export function lookupCII(fy: string, table: CostInflationIndexRules): number {
  const value = table.index[fy];
  if (value === undefined) throw new RangeError(`lookupCII: no Cost Inflation Index entry for FY ${fy}`);
  return value;
}
