import { z } from 'zod';

/** ISO calendar date, YYYY-MM-DD. */
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

/** Indian financial year label, e.g. "2026-27". */
export const FinancialYear = z.string().regex(/^\d{4}-\d{2}$/, 'expected YYYY-YY');

/**
 * Every figure in a rule pack must say where it came from and when it was last
 * checked. A value without provenance is rejected at load time — the brief is
 * explicit that tax and stamp-duty figures are never typed from memory.
 */
export const Provenance = z.object({
  source: z.url(),
  verifiedOn: IsoDate,
  note: z.string().optional(),
});

/**
 * The envelope every pack shares. The shape of `rules` is defined per rule
 * family in Phase 2 (income-tax slabs, capital gains, stamp duty by state,
 * small-savings rates); the envelope only guarantees identity and provenance.
 */
export const RulePackEnvelope = z.object({
  id: z.string().min(1),
  fy: FinancialYear,
  jurisdiction: z.string().default('IN'),
  effectiveFrom: IsoDate,
  provenance: Provenance,
  rules: z.record(z.string(), z.unknown()),
});

export type Provenance = z.infer<typeof Provenance>;
export type RulePackEnvelope = z.infer<typeof RulePackEnvelope>;
