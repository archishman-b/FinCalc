/**
 * A separate, deliberately-dated snapshot of REIT price/yield/component-split
 * figures for the REIT Portfolio Builder's multi-strategy simulator (see
 * `@fincalc/engine`'s `reit-portfolio-simulator.ts`) — distinct from
 * `reit-reference.ts`'s `ReitInstrumentsPack`/`ReitDistributionHistoryPack`.
 *
 * Why a separate pack rather than reusing `reit-instruments.json`: that pack
 * stores a distribution-yield *range* (min/max), not the single point value
 * the simulator's per-unit DPU math needs, and no fixed component split at
 * all — the older Portfolio Builder derives a default split by averaging
 * every historical quarter on demand (`computeHistoricalComponentSplit`).
 * The simulator needs one fixed, point-in-time number for both, matching
 * exactly what was hand-verified against the two golden-test outcomes (see
 * `reit-portfolio-simulator.test.ts`) — using the close-but-not-identical,
 * differently-dated `reit-instruments.json` figures instead would silently
 * stop reproducing those verified numbers. Keeping this as its own pack
 * leaves `reit-instruments.json`/`reit-distribution-history.json` (used by
 * the historical-reference table and `computeHistoricalComponentSplit`)
 * completely untouched.
 *
 * Only 3 components here (interest/dividend/return-of-capital), not the
 * engine's full 4-component `ReitComponentSplit` — deliberately: every one
 * of these 5 REITs holds its assets via an SPV structure, so `rental`
 * (direct, non-SPV-routed income) is 0 for all 5 in `reit-distribution-
 * history.json`'s own records. The simulator treats `rental` as always 0
 * for this pack rather than carrying a redundant always-zero field.
 */

import { z } from 'zod';

import { REIT_IDS, ReitDataProvenance } from './reit-reference';
import { IsoDate } from './schema';

const ReitIdSchema = z.enum(REIT_IDS);

export const ReitPortfolioSnapshotRow = z.object({
  id: ReitIdSchema,
  name: z.string().min(1),
  /** Unit price in rupees at the snapshot date. */
  priceInr: z.number().positive(),
  /** Annualised distribution yield at the snapshot date, as a percent (5.85 = 5.85%), not a decimal fraction — matches how the simulator's DPU math consumes it. */
  distributionYieldPct: z.number().min(0).max(100),
  /**
   * The three components as percentages of the total distribution, summing
   * to ~100 (the simulator renormalises if they don't). No `rentalPct`
   * field — see the module doc comment above for why.
   */
  componentSplit: z.object({
    interestPct: z.number().min(0).max(100),
    dividendPct: z.number().min(0).max(100),
    returnOfCapitalPct: z.number().min(0).max(100),
  }),
  /** Trailing unit-price CAGR since the REIT's listing, as a percent. Null if not meaningful (not used for any REIT in this pack, but kept nullable for schema symmetry with reit-reference.ts). Reference-only: drives the "tilt to price growth" allocation preset when every REIT shares the same model growth rate. */
  priceCagrSinceListingPct: z.number().nullable(),
  /** False unless the IPO price behind priceCagrSinceListingPct has been independently confirmed. True only for Embassy in this pack — see provenance.note. Surface this in the Assumptions panel, not silently. */
  priceCagrVerified: z.boolean(),
  /** The initial equal-split default weight (%) shown in the allocation UI before the user picks a preset or customises — not a live market-cap or float weighting. */
  defaultAllocationWeightPct: z.number().min(0).max(100),
});
export type ReitPortfolioSnapshotRow = z.infer<typeof ReitPortfolioSnapshotRow>;

export const ReitPortfolioSnapshotPack = z.object({
  id: z.literal('reit-portfolio-snapshot'),
  asOf: IsoDate,
  jurisdiction: z.string().default('IN'),
  provenance: ReitDataProvenance,
  reits: z.array(ReitPortfolioSnapshotRow).length(5),
});
export type ReitPortfolioSnapshotPack = z.infer<typeof ReitPortfolioSnapshotPack>;
