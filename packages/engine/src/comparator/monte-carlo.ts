/**
 * Monte Carlo simulation (Phase 7, brief §3/§6): "10k paths in under 2s,
 * UI never freezes." Answers the brief's own risk framing directly —
 * bear/base/bull deterministic scenarios (already in the UI's assumptions
 * strip) show three points; this shows the actual shape of the
 * distribution, with the modelled return series drawn *correlated*, not
 * independently — the brief's explicit warning that "independent draws
 * understate joint risk" (property, rent and equity are not independent
 * in reality).
 *
 * Performance design, consistent with the existing `solveHurdleRate`
 * technique in comparator.ts: each scenario's own monthly cash cost (EMI,
 * rent, maintenance, property tax, and the annual income tax that cost
 * generates) is computed ONCE at the base-case (mean-assumption) rates,
 * and the resulting equalised target is frozen across every trial —
 * exactly how `solveHurdleRate` already holds the household's outflow
 * commitment fixed while asking "what if this rate were different."
 * Re-running the annual income-tax pass per path would be the dominant
 * cost of a 10,000-trial run, so freezing it is what makes the
 * performance target reachable. This is exact whenever a scenario's own
 * monthly cost has no dependency on the series being modelled
 * stochastically — true for every scenario the current Layer 1 flow
 * builds (a fixed-rate home loan, a flat rent schedule) — and is a
 * documented simplification for any future scenario whose own cash flow
 * (e.g. a let-out property's rent, tied to a stochastic escalation
 * series, or a REIT's distribution yield) is itself sensitive to a
 * modelled series. What IS re-simulated per trial, correctly, is each
 * position's asset value and exit proceeds — the entire point of Monte
 * Carlo — by re-running `Position.project()` under that trial's
 * stochastic MarketContext.
 *
 * Monthly return draws are i.i.d. across months (no autocorrelation or
 * mean reversion modelled — a documented simplification, not a claim
 * that real markets have none — sequence-of-returns risk still shows up
 * correctly in the *distribution* across trials, just not as within-path
 * momentum) and use the engine's own nominal (annual ÷ 12) monthly
 * convention throughout (see rates.ts), so a Monte Carlo run and a
 * deterministic run at the same mean rate compound to the same
 * expectation.
 */

import type { CapitalGainsRules, CostInflationIndexRules, IncomeTaxRules } from '@fincalc/data';
import { getCapitalGainsRules, getIncomeTaxRules } from '@fincalc/data';

import { sipPosition } from '../positions/sip';
import type { AnnualRate, MarketContext, Month, MonthlyRow, Position, SeriesId } from '../types';

import { LATEST_SHIPPED_FY, computeOwnMonthlyOutflow, resolveExitConfigWithReitCostBasis } from './comparator';
import { computeExitResult, type ExitTaxContext } from './exit';
import { fyForMonth, monthRangeForFy } from './fiscal-year';
import { buildIncomeTaxInputForFy } from './household-tax';
import type { HouseholdTaxConfig, Scenario } from './types';

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// ---- Deterministic PRNG + correlated normal draws ----

/**
 * mulberry32 — a small, fast, deterministic PRNG. Not cryptographic; fine
 * for simulation. Determinism matters here for two concrete reasons: unit
 * tests need reproducible output, and the UI can offer a stable "re-run
 * with the same seed" without the distribution jittering between renders.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal draw via Box-Muller, consuming two uniform draws from `rng`. */
export function standardNormal(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Cholesky decomposition of a symmetric positive-definite matrix into a
 * lower-triangular factor L such that L·Lᵀ = matrix — the standard way to
 * turn independent standard-normal draws into correlated ones (if z is a
 * vector of independent standard normals, L·z has covariance matrix
 * L·Lᵀ = the target correlation matrix). Throws rather than silently
 * producing NaN if the matrix isn't positive-definite, which is a real
 * risk for a hand-authored correlation matrix (pairwise correlations that
 * look individually plausible can be jointly inconsistent).
 */
export function choleskyDecompose(matrix: readonly (readonly number[])[]): number[][] {
  const n = matrix.length;
  for (const row of matrix) {
    if (row.length !== n) throw new RangeError('choleskyDecompose: matrix must be square');
  }
  const L: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) sum += L[i]![k]! * L[j]![k]!;
      if (i === j) {
        const diag = matrix[i]![i]! - sum;
        if (diag <= 1e-12) {
          throw new RangeError(
            `choleskyDecompose: matrix is not positive-definite at row ${i} (diagonal residual ${diag}) — the correlation matrix is not internally consistent`,
          );
        }
        L[i]![j] = Math.sqrt(diag);
      } else {
        L[i]![j] = (matrix[i]![j]! - sum) / L[j]![j]!;
      }
    }
  }
  return L;
}

export interface StochasticSeriesConfig {
  seriesId: SeriesId;
  /** Annual mean return, e.g. 0.11 for an 11% expected return. */
  annualMean: AnnualRate;
  /** Annual volatility (standard deviation of annual return), e.g. 0.15 for 15%. 0 collapses the series to its mean every path — useful for testing and for "hold this one fixed" what-if runs. */
  annualVolatility: number;
}

/**
 * Builds one trial's worth of monthly return paths for every configured
 * stochastic series, correlated per `correlationMatrix` (same order as
 * `seriesConfigs`). Each series' monthly return is
 * `mean/12 + (vol/√12)·correlatedDraw`, expressed back out as "this
 * month's annual rate" (× 12) so it plugs directly into `MarketContext`'s
 * existing `rate(series, month)` contract and the engine's nominal
 * (annual ÷ 12) convention — no lognormal/geometric correction, matching
 * every other compounding calculation in this engine (see rates.ts).
 */
export function buildStochasticPaths(
  seriesConfigs: readonly StochasticSeriesConfig[],
  correlationMatrix: readonly (readonly number[])[],
  months: number,
  rng: () => number,
): Map<SeriesId, Float64Array> {
  const n = seriesConfigs.length;
  if (correlationMatrix.length !== n) {
    throw new RangeError(`buildStochasticPaths: correlationMatrix must be ${n}x${n} to match seriesConfigs (got ${correlationMatrix.length} rows)`);
  }
  const L = choleskyDecompose(correlationMatrix);
  const paths = new Map<SeriesId, Float64Array>();
  for (const config of seriesConfigs) paths.set(config.seriesId, new Float64Array(months));

  const z = new Array<number>(n);
  for (let m = 0; m < months; m++) {
    for (let i = 0; i < n; i++) z[i] = standardNormal(rng);
    for (let i = 0; i < n; i++) {
      let correlated = 0;
      for (let k = 0; k <= i; k++) correlated += L[i]![k]! * z[k]!;
      const config = seriesConfigs[i]!;
      const monthlyMean = config.annualMean / 12;
      const monthlyVol = config.annualVolatility / Math.sqrt(12);
      const monthlyReturn = monthlyMean + monthlyVol * correlated;
      paths.get(config.seriesId)![m] = monthlyReturn * 12;
    }
  }
  return paths;
}

function wrapStochasticContext(baseCtx: MarketContext, paths: Map<SeriesId, Float64Array>): MarketContext {
  return {
    rate(series, month) {
      const path = paths.get(series);
      if (!path) return baseCtx.rate(series, month);
      return path[month - 1] ?? baseCtx.rate(series, month);
    },
    provenance: (series) => baseCtx.provenance(series),
  };
}

// ---- The simulation itself ----

export interface MonteCarloOptions {
  scenarios: Scenario[];
  /** Deterministic, mean-assumption MarketContext — used once to compute the frozen equalisation target, and as the fallback for any series not listed in `stochasticSeries`. */
  baseCtx: MarketContext;
  stochasticSeries: StochasticSeriesConfig[];
  /** Correlation matrix, same order as `stochasticSeries`. Diagonal must be 1. */
  correlationMatrix: readonly (readonly number[])[];
  horizonsMonths: number[];
  startFy: string;
  household: HouseholdTaxConfig;
  cii: CostInflationIndexRules;
  minimumMonthlyBudget?: (month: Month) => number;
  trials: number;
  /** Defaults to a fixed constant so an unseeded run is still reproducible run-to-run — pass an explicit seed for a "shuffle" affordance. */
  seed?: number;
}

export interface MonteCarloScenarioHorizonSummary {
  scenarioId: string;
  scenarioName: string;
  horizonMonths: number;
  /** Sorted ascending, length === trials. Kept (not just percentiles) so the UI can build its own histogram bucketing. */
  terminalNetWorths: number[];
  mean: number;
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  min: number;
  max: number;
}

export interface MonteCarloResult {
  trials: number;
  seed: number;
  horizonsMonths: number[];
  byScenario: MonteCarloScenarioHorizonSummary[];
  /** Fraction of trials in which scenarios[0]'s terminal net worth is >= scenarios[1]'s, per horizon. Only populated when exactly two scenarios were compared (the current Layer 1 shape). */
  headToHeadWinProbability?: { horizonMonths: number; firstScenarioWinsFraction: number }[] | undefined;
}

function percentile(sortedAscending: readonly number[], p: number): number {
  if (sortedAscending.length === 0) return 0;
  const idx = p * (sortedAscending.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAscending[lo]!;
  const frac = idx - lo;
  return sortedAscending[lo]! * (1 - frac) + sortedAscending[hi]! * frac;
}

function defaultResolveIncomeTaxRules(household: HouseholdTaxConfig): (fy: string) => IncomeTaxRules {
  return (
    household.resolveIncomeTaxRules ??
    ((fy: string) => {
      try {
        return getIncomeTaxRules(fy);
      } catch {
        return getIncomeTaxRules(LATEST_SHIPPED_FY);
      }
    })
  );
}

function defaultResolveCapitalGainsRules(household: HouseholdTaxConfig): (fy: string) => CapitalGainsRules {
  return (
    household.resolveCapitalGainsRules ??
    ((fy: string) => {
      try {
        return getCapitalGainsRules(fy);
      } catch {
        return getCapitalGainsRules(LATEST_SHIPPED_FY);
      }
    })
  );
}

/**
 * Runs `options.trials` correlated Monte Carlo paths across every
 * scenario and horizon requested, returning a full terminal-net-worth
 * distribution per (scenario, horizon) pair. See the module doc comment
 * for the frozen-target and no-autocorrelation simplifications.
 */
export function runMonteCarlo(options: MonteCarloOptions): MonteCarloResult {
  const { scenarios, baseCtx, stochasticSeries, correlationMatrix, horizonsMonths, startFy, household, cii, trials } = options;
  if (trials <= 0) throw new RangeError(`runMonteCarlo: trials must be positive, got ${trials}`);
  if (horizonsMonths.length === 0) throw new RangeError('runMonteCarlo: horizonsMonths must be non-empty');
  const seed = options.seed ?? 0x5eed5eed;
  const maxHorizon = Math.max(...horizonsMonths);

  const resolveIncomeTaxRules = defaultResolveIncomeTaxRules(household);
  const resolveCapitalGainsRules = defaultResolveCapitalGainsRules(household);

  // Base pass, once: each scenario's own cash-flow-only cost (EMI, rent, maintenance,
  // property tax, annual income tax on that cost) at the mean-assumption rates, and the
  // resulting frozen equalisation target — see the module doc comment.
  const own = new Map<string, ReturnType<typeof computeOwnMonthlyOutflow>>();
  for (const scenario of scenarios) own.set(scenario.id, computeOwnMonthlyOutflow(scenario, baseCtx, maxHorizon, startFy, household));

  const target = new Array<number>(maxHorizon).fill(0);
  for (let m = 0; m < maxHorizon; m++) {
    let best = options.minimumMonthlyBudget?.(m + 1) ?? 0;
    for (const result of own.values()) best = Math.max(best, result.ownNetWithTax[m] ?? 0);
    target[m] = round2(best);
  }

  // Per (scenario, horizon): the exit year's tax context. `regularIncomeTaxInputForExitYear`
  // is derived from cash-flow-only fields of the base-case position rows (see module doc
  // comment on why this is ctx-invariant for the scenarios this engine currently builds).
  const exitContextByKey = new Map<string, ExitTaxContext>();
  for (const horizonMonths of horizonsMonths) {
    const saleFy = fyForMonth(startFy, horizonMonths);
    const incomeTaxRules = resolveIncomeTaxRules(saleFy);
    const capitalGainsRules = resolveCapitalGainsRules(saleFy);
    const range = monthRangeForFy(startFy, saleFy, horizonMonths)!;
    for (const scenario of scenarios) {
      const { input: regularIncomeTaxInputForExitYear } = buildIncomeTaxInputForFy(
        scenario,
        own.get(scenario.id)!.positionRows,
        range.start,
        range.end,
        saleFy,
        household,
        maxHorizon,
      );
      exitContextByKey.set(`${scenario.id}:${horizonMonths}`, {
        startFy,
        horizonMonths,
        capitalGainsRules,
        cii,
        incomeTaxRules,
        regularIncomeTaxInputForExitYear,
      });
    }
  }

  const resultsByKey = new Map<string, Float64Array>();
  for (const scenario of scenarios) {
    for (const horizonMonths of horizonsMonths) resultsByKey.set(`${scenario.id}:${horizonMonths}`, new Float64Array(trials));
  }

  const rng = mulberry32(seed);
  for (let trial = 0; trial < trials; trial++) {
    const paths = buildStochasticPaths(stochasticSeries, correlationMatrix, maxHorizon, rng);
    const stochasticCtx = wrapStochasticContext(baseCtx, paths);

    for (const scenario of scenarios) {
      const ownResult = own.get(scenario.id)!;

      const positionRows = new Map<string, MonthlyRow[]>();
      for (const position of scenario.positions) positionRows.set(position.id, position.project(maxHorizon, stochasticCtx));

      const sweepContribution = (month: Month) => Math.max(0, (target[month - 1] ?? 0) - (ownResult.ownNetWithTax[month - 1] ?? 0));
      const sweep = sipPosition(`${scenario.id}:mc-sweep`, { monthlyContribution: sweepContribution, growthSeries: scenario.sweepGrowthSeries });
      const sweepRows = sweep.project(maxHorizon, stochasticCtx);

      const exitConfigByPositionId = new Map((scenario.exitConfigs ?? []).map((c) => [c.positionId, c]));
      const sweepExitConfig = { positionId: sweep.id, ...(scenario.sweepExitConfig ?? { capitalGainsTreatment: 'equity' as const }) };

      for (const horizonMonths of horizonsMonths) {
        const exitCtx = exitContextByKey.get(`${scenario.id}:${horizonMonths}`)!;

        let total = 0;
        for (const position of scenario.positions) {
          const rows = positionRows.get(position.id) ?? [];
          const config = resolveExitConfigWithReitCostBasis(position, exitConfigByPositionId.get(position.id), stochasticCtx, horizonMonths);
          total += computeExitResult(position, rows, config, exitCtx).netProceedsAfterTax;
        }
        const sweepExitResult = computeExitResult({ id: sweep.id, kind: sweep.kind, project: sweep.project } as Position, sweepRows, sweepExitConfig, exitCtx);
        total += sweepExitResult.netProceedsAfterTax;

        resultsByKey.get(`${scenario.id}:${horizonMonths}`)![trial] = round2(total);
      }
    }
  }

  const byScenario: MonteCarloScenarioHorizonSummary[] = [];
  for (const scenario of scenarios) {
    for (const horizonMonths of horizonsMonths) {
      const sorted = Array.from(resultsByKey.get(`${scenario.id}:${horizonMonths}`)!).sort((a, b) => a - b);
      const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
      byScenario.push({
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        horizonMonths,
        terminalNetWorths: sorted,
        mean: round2(mean),
        p5: percentile(sorted, 0.05),
        p25: percentile(sorted, 0.25),
        p50: percentile(sorted, 0.5),
        p75: percentile(sorted, 0.75),
        p95: percentile(sorted, 0.95),
        min: sorted[0]!,
        max: sorted[sorted.length - 1]!,
      });
    }
  }

  let headToHeadWinProbability: MonteCarloResult['headToHeadWinProbability'];
  if (scenarios.length === 2) {
    const [first, second] = scenarios;
    headToHeadWinProbability = horizonsMonths.map((horizonMonths) => {
      const a = resultsByKey.get(`${first!.id}:${horizonMonths}`)!;
      const b = resultsByKey.get(`${second!.id}:${horizonMonths}`)!;
      let wins = 0;
      for (let i = 0; i < trials; i++) if (a[i]! >= b[i]!) wins++;
      return { horizonMonths, firstScenarioWinsFraction: wins / trials };
    });
  }

  return { trials, seed, horizonsMonths: horizonsMonths.slice(), byScenario, headToHeadWinProbability };
}
