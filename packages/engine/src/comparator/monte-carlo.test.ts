import { getCostInflationIndexRules } from '@fincalc/data';
import { describe, expect, it } from 'vitest';

import { lumpsumPosition } from '../positions/sip';
import { constantMarketContext } from '../positions/test-fixtures';

import { compare } from './comparator';
import {
  buildStochasticPaths,
  choleskyDecompose,
  mulberry32,
  runMonteCarlo,
  standardNormal,
  type StochasticSeriesConfig,
} from './monte-carlo';
import type { HouseholdTaxConfig, Scenario } from './types';

const cii = getCostInflationIndexRules();
const noBaselineHousehold: HouseholdTaxConfig = { regime: 'new', age: 'under60' };

describe('mulberry32', () => {
  it('is deterministic: the same seed produces the same sequence', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces values in [0, 1)', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('different seeds produce different sequences', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });
});

describe('standardNormal', () => {
  it('produces draws with ~0 mean and ~1 standard deviation over a large sample', () => {
    const rng = mulberry32(123);
    const n = 50_000;
    const draws = Array.from({ length: n }, () => standardNormal(rng));
    const mean = draws.reduce((s, v) => s + v, 0) / n;
    const variance = draws.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
    expect(mean).toBeCloseTo(0, 1);
    expect(Math.sqrt(variance)).toBeCloseTo(1, 1);
  });
});

describe('choleskyDecompose', () => {
  it('decomposes the identity matrix into itself', () => {
    const L = choleskyDecompose([
      [1, 0],
      [0, 1],
    ]);
    expect(L[0]![0]).toBeCloseTo(1);
    expect(L[0]![1]).toBeCloseTo(0);
    expect(L[1]![0]).toBeCloseTo(0);
    expect(L[1]![1]).toBeCloseTo(1);
  });

  it('L @ L^T reconstructs the original correlation matrix', () => {
    const matrix = [
      [1, 0.5, 0.2],
      [0.5, 1, 0.3],
      [0.2, 0.3, 1],
    ];
    const L = choleskyDecompose(matrix);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        let dot = 0;
        for (let k = 0; k < 3; k++) dot += L[i]![k]! * L[j]![k]!;
        expect(dot).toBeCloseTo(matrix[i]![j]!, 10);
      }
    }
  });

  it('throws for a non-positive-definite matrix rather than returning NaN', () => {
    // Pairwise correlations that cannot jointly hold: a strongly +correlated with b,
    // b strongly +correlated with c, but a strongly -correlated with c.
    const inconsistent = [
      [1, 0.95, -0.95],
      [0.95, 1, 0.95],
      [-0.95, 0.95, 1],
    ];
    expect(() => choleskyDecompose(inconsistent)).toThrow(RangeError);
  });

  it('rejects a non-square matrix', () => {
    expect(() => choleskyDecompose([[1, 0.5]])).toThrow(RangeError);
  });
});

describe('buildStochasticPaths', () => {
  it('with zero volatility, every month equals the configured annual mean exactly', () => {
    const configs: StochasticSeriesConfig[] = [{ seriesId: 'a', annualMean: 0.08, annualVolatility: 0 }];
    const paths = buildStochasticPaths(configs, [[1]], 24, mulberry32(1));
    const path = paths.get('a')!;
    for (let m = 0; m < 24; m++) expect(path[m]).toBeCloseTo(0.08, 10);
  });

  it('empirical correlation between two series converges to the configured value', () => {
    const target = 0.7;
    const configs: StochasticSeriesConfig[] = [
      { seriesId: 'a', annualMean: 0, annualVolatility: 1 },
      { seriesId: 'b', annualMean: 0, annualVolatility: 1 },
    ];
    const correlationMatrix = [
      [1, target],
      [target, 1],
    ];
    const rng = mulberry32(99);
    const n = 20_000;
    const aVals: number[] = [];
    const bVals: number[] = [];
    for (let i = 0; i < n; i++) {
      const paths = buildStochasticPaths(configs, correlationMatrix, 1, rng);
      aVals.push(paths.get('a')![0]!);
      bVals.push(paths.get('b')![0]!);
    }
    const meanA = aVals.reduce((s, v) => s + v, 0) / n;
    const meanB = bVals.reduce((s, v) => s + v, 0) / n;
    let cov = 0;
    let varA = 0;
    let varB = 0;
    for (let i = 0; i < n; i++) {
      cov += (aVals[i]! - meanA) * (bVals[i]! - meanB);
      varA += (aVals[i]! - meanA) ** 2;
      varB += (bVals[i]! - meanB) ** 2;
    }
    const empiricalCorrelation = cov / Math.sqrt(varA * varB);
    expect(empiricalCorrelation).toBeCloseTo(target, 1);
  });
});

function twoLumpsumScenarios(): [Scenario, Scenario] {
  const scenarioA: Scenario = {
    id: 'a',
    name: 'Property-like',
    positions: [lumpsumPosition('a:l', { principal: 1_000_000, growthSeries: 'property.appreciation' })],
    exitConfigs: [{ positionId: 'a:l', capitalGainsTreatment: 'equity' }],
    sweepGrowthSeries: 'sweep',
    sweepExitConfig: { capitalGainsTreatment: 'equity' },
  };
  const scenarioB: Scenario = {
    id: 'b',
    name: 'Index-like',
    positions: [lumpsumPosition('b:l', { principal: 1_000_000, growthSeries: 'sweep' })],
    exitConfigs: [{ positionId: 'b:l', capitalGainsTreatment: 'equity' }],
    sweepGrowthSeries: 'sweep',
    sweepExitConfig: { capitalGainsTreatment: 'equity' },
  };
  return [scenarioA, scenarioB];
}

describe('runMonteCarlo', () => {
  it('with zero volatility on every stochastic series, every trial matches the deterministic compare() result exactly', () => {
    const ctx = constantMarketContext({ 'property.appreciation': 0.06, sweep: 0.11 });
    const [scenarioA, scenarioB] = twoLumpsumScenarios();

    const deterministic = compare({
      scenarios: [scenarioA, scenarioB],
      ctx,
      horizonsMonths: [120],
      startFy: '2026-27',
      household: noBaselineHousehold,
      cii,
    });

    const mc = runMonteCarlo({
      scenarios: [scenarioA, scenarioB],
      baseCtx: ctx,
      stochasticSeries: [
        { seriesId: 'property.appreciation', annualMean: 0.06, annualVolatility: 0 },
        { seriesId: 'sweep', annualMean: 0.11, annualVolatility: 0 },
      ],
      correlationMatrix: [
        [1, 0],
        [0, 1],
      ],
      horizonsMonths: [120],
      startFy: '2026-27',
      household: noBaselineHousehold,
      cii,
      trials: 50,
    });

    const detA = deterministic.scenarios.find((s) => s.scenarioId === 'a')!.perHorizon[0]!.terminalNetWorth;
    const detB = deterministic.scenarios.find((s) => s.scenarioId === 'b')!.perHorizon[0]!.terminalNetWorth;
    const mcA = mc.byScenario.find((s) => s.scenarioId === 'a' && s.horizonMonths === 120)!;
    const mcB = mc.byScenario.find((s) => s.scenarioId === 'b' && s.horizonMonths === 120)!;

    expect(mcA.mean).toBeCloseTo(detA, 0);
    expect(mcA.p5).toBeCloseTo(detA, 0);
    expect(mcA.p95).toBeCloseTo(detA, 0);
    expect(mcB.mean).toBeCloseTo(detB, 0);
  });

  it('spread (p95 - p5) widens as volatility increases', () => {
    const ctx = constantMarketContext({ 'property.appreciation': 0.06, sweep: 0.11 });
    const [scenarioA, scenarioB] = twoLumpsumScenarios();

    function run(volatility: number) {
      return runMonteCarlo({
        scenarios: [scenarioA, scenarioB],
        baseCtx: ctx,
        stochasticSeries: [
          { seriesId: 'property.appreciation', annualMean: 0.06, annualVolatility: volatility },
          { seriesId: 'sweep', annualMean: 0.11, annualVolatility: 0 },
        ],
        correlationMatrix: [
          [1, 0],
          [0, 1],
        ],
        horizonsMonths: [180],
        startFy: '2026-27',
        household: noBaselineHousehold,
        cii,
        trials: 1500,
        seed: 555,
      });
    }

    const low = run(0.03);
    const high = run(0.2);
    const lowA = low.byScenario.find((s) => s.scenarioId === 'a')!;
    const highA = high.byScenario.find((s) => s.scenarioId === 'a')!;
    expect(highA.p95 - highA.p5).toBeGreaterThan(lowA.p95 - lowA.p5);
  });

  it('headToHeadWinProbability strongly favours the scenario with the dominant growth rate', () => {
    const ctx = constantMarketContext({ 'property.appreciation': 0.03, sweep: 0.2 });
    const [scenarioA, scenarioB] = twoLumpsumScenarios(); // a: property.appreciation (3%), b: sweep (20%)

    const mc = runMonteCarlo({
      scenarios: [scenarioA, scenarioB],
      baseCtx: ctx,
      stochasticSeries: [
        { seriesId: 'property.appreciation', annualMean: 0.03, annualVolatility: 0.05 },
        { seriesId: 'sweep', annualMean: 0.2, annualVolatility: 0.05 },
      ],
      correlationMatrix: [
        [1, 0],
        [0, 1],
      ],
      horizonsMonths: [300],
      startFy: '2026-27',
      household: noBaselineHousehold,
      cii,
      trials: 500,
    });

    const winProb = mc.headToHeadWinProbability!.find((h) => h.horizonMonths === 300)!;
    // scenario b (20%) should trounce scenario a (3%) over 25 years in nearly every trial
    expect(winProb.firstScenarioWinsFraction).toBeLessThan(0.05);
  });

  it('is reproducible: the same seed produces bit-identical results', () => {
    const ctx = constantMarketContext({ 'property.appreciation': 0.06, sweep: 0.11 });
    const [scenarioA, scenarioB] = twoLumpsumScenarios();
    const options = {
      scenarios: [scenarioA, scenarioB],
      baseCtx: ctx,
      stochasticSeries: [
        { seriesId: 'property.appreciation', annualMean: 0.06, annualVolatility: 0.1 },
        { seriesId: 'sweep', annualMean: 0.11, annualVolatility: 0.15 },
      ],
      correlationMatrix: [
        [1, 0.3],
        [0.3, 1],
      ],
      horizonsMonths: [120],
      startFy: '2026-27',
      household: noBaselineHousehold,
      cii,
      trials: 200,
      seed: 314159,
    };
    const run1 = runMonteCarlo(options);
    const run2 = runMonteCarlo(options);
    expect(run1.byScenario[0]!.terminalNetWorths).toEqual(run2.byScenario[0]!.terminalNetWorths);
  });

  it('rejects zero or negative trials', () => {
    const ctx = constantMarketContext({ 'property.appreciation': 0.06, sweep: 0.11 });
    const [scenarioA] = twoLumpsumScenarios();
    expect(() =>
      runMonteCarlo({
        scenarios: [scenarioA],
        baseCtx: ctx,
        stochasticSeries: [{ seriesId: 'property.appreciation', annualMean: 0.06, annualVolatility: 0.1 }],
        correlationMatrix: [[1]],
        horizonsMonths: [120],
        startFy: '2026-27',
        household: noBaselineHousehold,
        cii,
        trials: 0,
      }),
    ).toThrow(RangeError);
  });
});
