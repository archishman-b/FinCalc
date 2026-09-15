/**
 * Builds a flat (non-time-varying) MarketContext from a small named set of
 * assumption series. Production equivalent of the engine's own
 * `positions/test-fixtures.ts::constantMarketContext`, which is
 * deliberately test-only (not re-exported from `@fincalc/engine`'s public
 * barrel) — the app needs its own, since a bear/base/bull pack or a live
 * feed (Phase 9) is a different MarketContext implementation behind the
 * same interface, not a variant of the test fixture.
 */
import type { MarketContext, Provenance, SeriesId } from '@fincalc/engine';

export interface AssumptionSeries {
  id: SeriesId;
  /** Annual rate, e.g. 0.06 for 6%. */
  rate: number;
  /** Shown in the assumptions strip — what this number is and why it's a reasonable default. */
  label: string;
}

export function buildMarketContext(series: readonly AssumptionSeries[]): MarketContext {
  const byId = new Map(series.map((s) => [s.id, s]));
  return {
    rate(id: SeriesId): number {
      const s = byId.get(id);
      if (!s) throw new RangeError(`buildMarketContext: no rate configured for series "${id}"`);
      return s.rate;
    },
    provenance(id: SeriesId): Provenance {
      const s = byId.get(id);
      return { origin: 'default', label: s?.label ?? id };
    },
  };
}
