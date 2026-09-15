/**
 * One-at-a-time sensitivity analysis (brief §4: a tornado chart showing
 * "which single assumption moves the answer most"). For each named
 * assumption, reruns the deterministic comparison with that one series
 * shifted to a low/high value — every other assumption held at its base
 * case — and reports the resulting swing in terminal net worth at a
 * chosen horizon, ranked by swing magnitude descending (the tornado
 * chart's own convention: widest bar first).
 *
 * Deliberately reuses the full deterministic `compare()` pipeline rather
 * than the Monte Carlo module's lean per-trial path: this only needs a
 * handful of comparison runs (two per assumption), so there is no
 * performance pressure, and reusing `compare()` directly guarantees the
 * sensitivity numbers are computed by exactly the same code path as the
 * deterministic result the UI already shows — no risk of the tornado
 * chart and the headline number disagreeing because they were computed
 * two different ways.
 */

import { compare } from './comparator';
import type { CompareOptions } from './types';
import type { MarketContext, SeriesId } from '../types';

export interface SensitivityAssumption {
  seriesId: SeriesId;
  /** Shown as the tornado chart's row label. */
  label: string;
  lowRate: number;
  highRate: number;
}

export interface TornadoBar {
  seriesId: SeriesId;
  label: string;
  /** Terminal net worth of the requested scenario at the requested horizon, with this assumption pinned to its low / base / high value (every other assumption at base case). */
  low: number;
  base: number;
  high: number;
  /** |high − low| — the tornado chart's own sort key. */
  swing: number;
}

export interface SensitivityResult {
  scenarioId: string;
  horizonMonths: number;
  /** Sorted by swing descending — widest bar first, matching how a tornado chart is conventionally read top-to-bottom. */
  bars: TornadoBar[];
}

function wrapSeries(baseCtx: MarketContext, seriesId: SeriesId, rate: number): MarketContext {
  return {
    rate: (series, month) => (series === seriesId ? rate : baseCtx.rate(series, month)),
    provenance: (series) => baseCtx.provenance(series),
  };
}

function terminalNetWorthAt(options: CompareOptions, scenarioId: string, horizonMonths: number): number {
  const result = compare(options);
  const scenario = result.scenarios.find((s) => s.scenarioId === scenarioId);
  if (!scenario) throw new RangeError(`runSensitivityAnalysis: scenario "${scenarioId}" not found in the comparison`);
  const horizon = scenario.perHorizon.find((h) => h.horizonMonths === horizonMonths);
  if (!horizon) throw new RangeError(`runSensitivityAnalysis: horizon ${horizonMonths} not found for scenario "${scenarioId}"`);
  return horizon.terminalNetWorth;
}

/**
 * Runs the one-at-a-time tornado analysis for one scenario at one
 * horizon. `baseOptions` should be the exact `CompareOptions` the
 * deterministic result was computed from, so `base` in each bar matches
 * the headline number the user already sees.
 */
export function runSensitivityAnalysis(
  baseOptions: CompareOptions,
  scenarioId: string,
  horizonMonths: number,
  assumptions: readonly SensitivityAssumption[],
): SensitivityResult {
  if (assumptions.length === 0) throw new RangeError('runSensitivityAnalysis: assumptions must be non-empty');
  const base = terminalNetWorthAt(baseOptions, scenarioId, horizonMonths);

  const bars = assumptions.map((assumption) => {
    const low = terminalNetWorthAt({ ...baseOptions, ctx: wrapSeries(baseOptions.ctx, assumption.seriesId, assumption.lowRate) }, scenarioId, horizonMonths);
    const high = terminalNetWorthAt({ ...baseOptions, ctx: wrapSeries(baseOptions.ctx, assumption.seriesId, assumption.highRate) }, scenarioId, horizonMonths);
    return { seriesId: assumption.seriesId, label: assumption.label, low, base, high, swing: Math.abs(high - low) };
  });
  bars.sort((a, b) => b.swing - a.swing);

  return { scenarioId, horizonMonths, bars };
}
