import type { SeriesId } from '@fincalc/engine';

/**
 * Default annual volatility (standard deviation of annual return) assumed for each stochastic
 * series when running Monte Carlo simulation, if the user has not overridden it.
 *
 * These are DOCUMENTED DEFAULTS, not cited market data — the same tier as HOME_LOAN_RATE and the
 * other illustrative assumptions in scenario-builder.ts. They exist so the simulation has
 * something reasonable to run with out of the box; a future iteration could expose these as
 * user-editable UI inputs (the engine layer already accepts arbitrary per-series volatility via
 * MonteCarloOptions.stochasticSeries, so no engine change would be needed).
 *
 * Rough rationale for the chosen magnitudes (order-of-magnitude judgement, not a citation):
 * - property.appreciation: Indian residential real estate price indices have historically shown
 *   lower year-to-year volatility than equities (illiquid, infrequently marked-to-market,
 *   sluggish price discovery) but are not risk-free — 8% annual vol is a moderate illustrative
 *   figure.
 * - default.index_fund / equity-like series: broad equity indices are materially more volatile
 *   year-to-year; 15% annual vol is a commonly used illustrative figure for equity index returns.
 * - sweep (the liquid parking vehicle used to equalise cash flow, typically a debt/liquid fund):
 *   meaningfully less volatile than equities but not zero; treated at DEFAULT_VOLATILITY below
 *   unless a series-specific entry exists.
 */
export const VOLATILITY_BY_SERIES: Partial<Record<SeriesId, number>> = {
  'property.appreciation': 0.08,
  'default.index_fund': 0.15,
};

/**
 * Short, chart-friendly labels for each stochastic series — the AssumptionSeries.label values
 * (e.g. "Property appreciation — conservative default") are written for the assumptions strip's
 * prose list and are too long for a tornado chart's axis; this is the same series, a terser name.
 */
export const SHORT_ASSUMPTION_LABEL: Partial<Record<SeriesId, string>> = {
  'property.appreciation': 'Property appreciation',
  'default.index_fund': 'Reinvestment return',
};

/** Fallback annual volatility for any stochastic series not listed in VOLATILITY_BY_SERIES. */
export const DEFAULT_VOLATILITY = 0.1;

/**
 * Default pairwise correlation assumed between any two distinct stochastic series, if not
 * otherwise specified. A positive but modest correlation (rather than 0) reflects the brief's
 * explicit warning that independent draws understate joint risk — broad asset classes in a
 * single economy tend to share some macro exposure (interest rates, inflation, growth) even when
 * their local drivers differ. This is a documented illustrative default, not a fitted or cited
 * empirical correlation.
 */
export const ASSUMED_CORRELATION = 0.2;

/** Default trial count used by the UI's "Run Monte Carlo simulation" action. */
export const DEFAULT_TRIALS = 10_000;

/**
 * Builds a same-order correlation matrix for the given list of series, using ASSUMED_CORRELATION
 * for every off-diagonal entry and 1 on the diagonal. Order of `seriesIds` determines the row/
 * column order of the returned matrix — callers must use the same order when reading results back
 * against series identity.
 */
export function buildDefaultCorrelationMatrix(seriesIds: readonly SeriesId[]): number[][] {
  return seriesIds.map((_, i) =>
    seriesIds.map((_unused, j) => (i === j ? 1 : ASSUMED_CORRELATION)),
  );
}

/** Looks up the default volatility for a series, falling back to DEFAULT_VOLATILITY. */
export function volatilityForSeries(seriesId: SeriesId): number {
  return VOLATILITY_BY_SERIES[seriesId] ?? DEFAULT_VOLATILITY;
}
