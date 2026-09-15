/**
 * Shared MarketContext test fixtures for Position tests. Not a *.test.ts
 * file itself, so vitest doesn't pick it up as a suite.
 */

import type { AnnualRate, MarketContext, Month, Provenance, SeriesId } from '../types';

/** A MarketContext with one fixed annual rate per series for the whole horizon — the common case for a golden test. */
export function constantMarketContext(rates: Record<string, AnnualRate>): MarketContext {
  return {
    rate(series: SeriesId): AnnualRate {
      const r = rates[series];
      if (r === undefined) throw new RangeError(`constantMarketContext: no rate configured for series "${series}"`);
      return r;
    },
    provenance(series: SeriesId): Provenance {
      return { origin: 'default', label: `test fixture: ${series}` };
    },
  };
}

/** A MarketContext whose rate for one series is a per-month function — for tests of a mid-horizon rate change or a volatile path. */
export function variableMarketContext(seriesFns: Record<string, (month: Month) => AnnualRate>): MarketContext {
  return {
    rate(series: SeriesId, month: Month): AnnualRate {
      const fn = seriesFns[series];
      if (!fn) throw new RangeError(`variableMarketContext: no rate configured for series "${series}"`);
      return fn(month);
    },
    provenance(series: SeriesId): Provenance {
      return { origin: 'default', label: `test fixture: ${series}` };
    },
  };
}
