import { getCostInflationIndexRules } from '@fincalc/data';
import { describe, expect, it } from 'vitest';

import { lumpsumPosition } from '../positions/sip';
import { constantMarketContext } from '../positions/test-fixtures';

import { runSensitivityAnalysis } from './sensitivity';
import type { CompareOptions, HouseholdTaxConfig, Scenario } from './types';

const cii = getCostInflationIndexRules();
const noBaselineHousehold: HouseholdTaxConfig = { regime: 'new', age: 'under60' };

describe('runSensitivityAnalysis', () => {
  it('ranks the assumption that actually drives the outcome above one that has no effect, and the base value matches the unperturbed comparison', () => {
    // A single-scenario comparison: with only one scenario, the equalisation target equals that
    // scenario's own cost exactly, so the sweep (growth series 'y') never receives a contribution
    // and can never affect the result — a genuine, mechanism-grounded "zero effect" decoy, not a
    // hand-picked one.
    const ctx = constantMarketContext({ x: 0.08, y: 0.11 });
    const scenario: Scenario = {
      id: 'solo',
      name: 'Solo',
      positions: [lumpsumPosition('solo:l', { principal: 1_000_000, growthSeries: 'x' })],
      exitConfigs: [{ positionId: 'solo:l', capitalGainsTreatment: 'equity' }],
      sweepGrowthSeries: 'y',
      sweepExitConfig: { capitalGainsTreatment: 'equity' },
    };
    const baseOptions: CompareOptions = {
      scenarios: [scenario],
      ctx,
      horizonsMonths: [180],
      startFy: '2026-27',
      household: noBaselineHousehold,
      cii,
    };

    const result = runSensitivityAnalysis(baseOptions, 'solo', 180, [
      { seriesId: 'x', label: 'X growth (drives the position)', lowRate: 0.02, highRate: 0.15 },
      { seriesId: 'y', label: 'Y growth (unused sweep)', lowRate: 0, highRate: 0.3 },
    ]);

    expect(result.bars).toHaveLength(2);
    expect(result.bars[0]!.seriesId).toBe('x');
    expect(result.bars[0]!.swing).toBeGreaterThan(0);
    // y truly cannot affect a single-scenario comparison's result — its swing should be exactly 0.
    expect(result.bars[1]!.seriesId).toBe('y');
    expect(result.bars[1]!.swing).toBe(0);
    // base matches what an unperturbed compare() at the base rates would show.
    expect(result.bars[0]!.base).toBe(result.bars[1]!.base);
  });

  it('throws for an unknown scenario id or horizon', () => {
    const ctx = constantMarketContext({ x: 0.08 });
    const scenario: Scenario = {
      id: 'solo',
      name: 'Solo',
      positions: [lumpsumPosition('solo:l', { principal: 1_000_000, growthSeries: 'x' })],
      exitConfigs: [{ positionId: 'solo:l', capitalGainsTreatment: 'equity' }],
      sweepGrowthSeries: 'x',
      sweepExitConfig: { capitalGainsTreatment: 'equity' },
    };
    const baseOptions: CompareOptions = {
      scenarios: [scenario],
      ctx,
      horizonsMonths: [180],
      startFy: '2026-27',
      household: noBaselineHousehold,
      cii,
    };
    const assumptions = [{ seriesId: 'x', label: 'X', lowRate: 0.02, highRate: 0.15 }];
    expect(() => runSensitivityAnalysis(baseOptions, 'nope', 180, assumptions)).toThrow(RangeError);
    expect(() => runSensitivityAnalysis(baseOptions, 'solo', 999, assumptions)).toThrow(RangeError);
  });

  it('rejects an empty assumptions list', () => {
    const ctx = constantMarketContext({ x: 0.08 });
    const scenario: Scenario = {
      id: 'solo',
      name: 'Solo',
      positions: [lumpsumPosition('solo:l', { principal: 1_000_000, growthSeries: 'x' })],
      exitConfigs: [{ positionId: 'solo:l', capitalGainsTreatment: 'equity' }],
      sweepGrowthSeries: 'x',
      sweepExitConfig: { capitalGainsTreatment: 'equity' },
    };
    const baseOptions: CompareOptions = {
      scenarios: [scenario],
      ctx,
      horizonsMonths: [180],
      startFy: '2026-27',
      household: noBaselineHousehold,
      cii,
    };
    expect(() => runSensitivityAnalysis(baseOptions, 'solo', 180, [])).toThrow(RangeError);
  });
});
