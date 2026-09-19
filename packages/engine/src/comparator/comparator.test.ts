import { getCostInflationIndexRules } from '@fincalc/data';
import { describe, expect, it } from 'vitest';

import { lumpsumPosition } from '../positions/sip';
import { constantMarketContext } from '../positions/test-fixtures';

import { compare } from './comparator';
import { fiscalYearsInHorizon, fyForMonth, isFiscalYearEnd, monthRangeForFy } from './fiscal-year';
import type { HouseholdTaxConfig, Scenario } from './types';

const cii = getCostInflationIndexRules();
const noBaselineHousehold: HouseholdTaxConfig = { regime: 'new', age: 'under60' };

describe('fiscal-year helpers', () => {
  it('month 1 is April of startFy; month 12 is the following March, same FY', () => {
    expect(fyForMonth('2026-27', 1)).toBe('2026-27');
    expect(fyForMonth('2026-27', 12)).toBe('2026-27');
    expect(fyForMonth('2026-27', 13)).toBe('2027-28');
    expect(fyForMonth('2026-27', 24)).toBe('2027-28');
  });

  it('isFiscalYearEnd marks every 12th month', () => {
    expect(isFiscalYearEnd(12)).toBe(true);
    expect(isFiscalYearEnd(24)).toBe(true);
    expect(isFiscalYearEnd(11)).toBe(false);
  });

  it('fiscalYearsInHorizon lists each FY once, including a trailing partial year', () => {
    expect(fiscalYearsInHorizon('2026-27', 24)).toEqual(['2026-27', '2027-28']);
    expect(fiscalYearsInHorizon('2026-27', 18)).toEqual(['2026-27', '2027-28']); // trailing 6 months of FY2027-28 still counted
  });

  it('monthRangeForFy returns the exact month span for a full and a clipped FY', () => {
    expect(monthRangeForFy('2026-27', '2026-27', 24)).toEqual({ start: 1, end: 12 });
    expect(monthRangeForFy('2026-27', '2027-28', 24)).toEqual({ start: 13, end: 24 });
    expect(monthRangeForFy('2026-27', '2027-28', 18)).toEqual({ start: 13, end: 18 }); // clipped to the horizon
    expect(monthRangeForFy('2026-27', '2029-30', 24)).toBeNull();
  });
});

describe('compare — equalisation and sweep mechanics', () => {
  it('two differently-sized lumpsum scenarios, equalised and reinvested at the same rate, converge to identical after-tax terminal value', () => {
    const ctx = constantMarketContext({ 'equity.index': 0.1 });

    const scenarioA: Scenario = {
      id: 'a',
      name: 'Deploy 10L',
      positions: [lumpsumPosition('a:lumpsum', { principal: 1_000_000, growthSeries: 'equity.index' })],
      exitConfigs: [{ positionId: 'a:lumpsum', capitalGainsTreatment: 'equity' }],
      sweepGrowthSeries: 'equity.index',
      sweepExitConfig: { capitalGainsTreatment: 'equity' },
    };
    const scenarioB: Scenario = {
      id: 'b',
      name: 'Deploy 6L (tops up to 10L via sweep)',
      positions: [lumpsumPosition('b:lumpsum', { principal: 600_000, growthSeries: 'equity.index' })],
      exitConfigs: [{ positionId: 'b:lumpsum', capitalGainsTreatment: 'equity' }],
      sweepGrowthSeries: 'equity.index',
      sweepExitConfig: { capitalGainsTreatment: 'equity' },
    };

    const result = compare({
      scenarios: [scenarioA, scenarioB],
      ctx,
      horizonsMonths: [12],
      startFy: '2026-27',
      household: noBaselineHousehold,
      cii,
    });

    const [a, b] = result.scenarios;
    // Equalisation: both scenarios were actually charged the more expensive one's cost every month.
    expect(a!.equalisedMonthlyOutflow[0]).toBe(1_000_000);
    expect(b!.equalisedMonthlyOutflow[0]).toBe(1_000_000);
    expect(a!.sweepContribution[0]).toBe(0);
    expect(b!.sweepContribution[0]).toBe(400_000); // topped up 6L -> 10L

    // Same aggregate capital (10L), same rate, same holding period, same capital-gains route:
    // after-tax terminal net worth must come out identical however it was split between the
    // scenario's own position and the sweep.
    expect(a!.perHorizon[0]!.terminalNetWorth).toBeCloseTo(b!.perHorizon[0]!.terminalNetWorth, 0);
    expect(a!.perHorizon[0]!.terminalNetWorth).toBeGreaterThan(1_000_000); // it grew
  });

  it('sweep contribution is always non-negative and the equalised target matches the max across scenarios every month, even when costs change mid-horizon', () => {
    const ctx = constantMarketContext({ 'equity.index': 0.08 });
    const scenarioA: Scenario = {
      id: 'a',
      name: 'Front-loaded',
      positions: [lumpsumPosition('a:l', { principal: 500_000, growthSeries: 'equity.index' })],
      sweepGrowthSeries: 'equity.index',
    };
    const scenarioB: Scenario = {
      id: 'b',
      name: 'SIP',
      positions: [
        {
          id: 'b:sip',
          kind: 'sip',
          project: (months: number) =>
            Array.from({ length: months }, (_, i) => ({
              month: i + 1,
              cashOut: i < 6 ? 20_000 : 80_000, // cost steps up after month 6
              cashIn: 0,
              taxable: {},
              assetValue: 0,
              liabilityBalance: 0,
              liquidityTier: 1 as const,
            })),
        },
      ],
      sweepGrowthSeries: 'equity.index',
    };

    const result = compare({
      scenarios: [scenarioA, scenarioB],
      ctx,
      horizonsMonths: [12],
      startFy: '2026-27',
      household: noBaselineHousehold,
      cii,
    });
    const [a, b] = result.scenarios;
    for (let m = 0; m < 12; m++) {
      expect(a!.sweepContribution[m]).toBeGreaterThanOrEqual(0);
      expect(b!.sweepContribution[m]).toBeGreaterThanOrEqual(0);
      expect(a!.equalisedMonthlyOutflow[m]).toBe(b!.equalisedMonthlyOutflow[m]);
    }
    // Months 1-6: A costs 500,000 upfront then 0; B costs 20,000/month -> target = max(A,B) per month.
    expect(a!.equalisedMonthlyOutflow[0]).toBe(500_000); // month 1: A=500000, B=20000 -> target 500000
    expect(a!.equalisedMonthlyOutflow[6]).toBe(80_000); // month 7: A=0, B=80000 -> target 80000
    expect(b!.sweepContribution[6]).toBe(0); // B is the expensive one that month, nothing to sweep
    expect(a!.sweepContribution[6]).toBe(80_000); // A gets the full target swept since its own cost is 0
  });

  it('Phase 9.12: ownBreakdown and sweepBreakdown always foot exactly to their parent totals', () => {
    const ctx = constantMarketContext({ 'equity.index': 0.1 });
    const scenarioA: Scenario = {
      id: 'a',
      name: 'Deploy 10L',
      positions: [lumpsumPosition('a:lumpsum', { principal: 1_000_000, growthSeries: 'equity.index' })],
      exitConfigs: [{ positionId: 'a:lumpsum', capitalGainsTreatment: 'equity' }],
      sweepGrowthSeries: 'equity.index',
      sweepExitConfig: { capitalGainsTreatment: 'equity' },
    };
    const scenarioB: Scenario = {
      id: 'b',
      name: 'Deploy 6L (tops up to 10L via sweep)',
      positions: [lumpsumPosition('b:lumpsum', { principal: 600_000, growthSeries: 'equity.index' })],
      exitConfigs: [{ positionId: 'b:lumpsum', capitalGainsTreatment: 'equity' }],
      sweepGrowthSeries: 'equity.index',
      sweepExitConfig: { capitalGainsTreatment: 'equity' },
    };

    const result = compare({
      scenarios: [scenarioA, scenarioB],
      ctx,
      horizonsMonths: [12, 24],
      startFy: '2026-27',
      household: noBaselineHousehold,
      cii,
    });

    for (const scenario of result.scenarios) {
      for (const horizon of scenario.perHorizon) {
        const { assetValue, liabilityBalance, exitTaxAndCosts } = horizon.ownBreakdown;
        expect(assetValue - liabilityBalance - exitTaxAndCosts).toBeCloseTo(horizon.ownPositionsValueAfterTax, 6);

        const { firstMonthValue, laterMonthsValue, exitTaxAndCosts: sweepExitTaxAndCosts } = horizon.sweepBreakdown;
        expect(firstMonthValue + laterMonthsValue - sweepExitTaxAndCosts).toBeCloseTo(horizon.sweepValueAfterTax, 6);
      }
    }

    // B gets a real month-1 sweep top-up in this fixture, so its first-month sweep value should be
    // strictly positive and materially different from a scenario with no sweep at all (A).
    const [a, b] = result.scenarios;
    expect(b!.perHorizon[0]!.sweepBreakdown.firstMonthValue).toBeGreaterThan(0);
    expect(a!.perHorizon[0]!.sweepBreakdown.firstMonthValue).toBe(0);
  });
});
