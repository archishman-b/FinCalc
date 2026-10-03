import { describe, expect, it } from 'vitest';

import { simulateEpfVpf, type EpfVpfSimulatorInput } from './epf-vpf-simulator';

/**
 * No prototype HTML exists for this module to port golden values from (it's
 * a new build, not a port) — so these are hand-derived, independently
 * checkable scenarios instead: round numbers, single years, and a
 * zero-interest case isolates the contribution/EPS-split bookkeeping from
 * the compounding math, so each piece can be verified by hand separately.
 */
function baseInput(overrides: Partial<EpfVpfSimulatorInput> = {}): EpfVpfSimulatorInput {
  return {
    currentAge: 30,
    retirementAge: 31,
    monthlyBasicPlusDaInr: 20_000,
    salaryGrowthPctPerYear: 0,
    employeeContributionRatePct: 12,
    vpfContributionRatePct: 0,
    employerContributionRatePct: 12,
    wageCeilingInr: 25_000,
    epsShareOfEmployerRatePct: 8.33,
    epfInterestRatePct: 0,
    openingBalanceInr: 0,
    openingPensionableServiceYears: 0,
    taxableInterestThresholdPerYearInr: 250_000,
    epsPensionDivisor: 70,
    epsPensionableSalaryCeilingInr: 25_000,
    ...overrides,
  };
}

describe('simulateEpfVpf — zero-interest, wage below ceiling (isolates contribution/EPS-split bookkeeping)', () => {
  const result = simulateEpfVpf(baseInput());

  it('splits the employer contribution into EPS and EPF correctly', () => {
    // wage 20,000 is below the 25,000 ceiling, so the full wage is the EPS base.
    // EPS: 20,000 * 0.0833 = 1,666/month -> 19,992/year
    // EPF: 20,000 * 0.12 - 1,666 = 734/month -> 8,808/year
    expect(result.totalEmployerEpsContributedInr).toBeCloseTo(19_992, 6);
    expect(result.totalEmployerEpfContributedInr).toBeCloseTo(8_808, 6);
  });

  it('accumulates the employee contribution at 12% of wage', () => {
    // 20,000 * 0.12 = 2,400/month -> 28,800/year
    expect(result.totalEmployeeContributedInr).toBeCloseTo(28_800, 6);
  });

  it('produces a closing corpus of employee + employer-EPF contributions only (EPS never compounds in)', () => {
    expect(result.corpusAtRetirementInr).toBeCloseTo(28_800 + 8_808, 6);
    expect(result.totalInterestEarnedInr).toBeCloseTo(0, 6);
  });

  it('estimates the EPS monthly pension from pensionable salary x service / divisor', () => {
    // pensionable salary = 20,000 (one year, below the 25,000 ceiling); service = 0 + 1 = 1 year
    // 20,000 * 1 / 70 = 285.714...
    expect(result.pensionableServiceYears).toBe(1);
    expect(result.epsPensionableSalaryInr).toBeCloseTo(20_000, 6);
    expect(result.epsMonthlyPensionEstimateInr).toBeCloseTo(285.714286, 4);
  });

  it('produces exactly one yearly row for a one-year horizon', () => {
    expect(result.yearly).toHaveLength(1);
    expect(result.yearsSimulated).toBe(1);
  });
});

describe('simulateEpfVpf — wage above the statutory ceiling caps the EPS base, not the EPF remainder', () => {
  const result = simulateEpfVpf(baseInput({ monthlyBasicPlusDaInr: 50_000 }));

  it('caps the EPS share at the wage ceiling and routes the rest of the employer share to EPF', () => {
    // EPS base = min(50,000, 25,000) = 25,000 -> 25,000 * 0.0833 = 2,082.5/month -> 24,990/year
    // EPF = 50,000 * 0.12 - 2,082.5 = 3,917.5/month -> 47,010/year
    expect(result.totalEmployerEpsContributedInr).toBeCloseTo(24_990, 6);
    expect(result.totalEmployerEpfContributedInr).toBeCloseTo(47_010, 6);
  });

  it('employee contribution is unaffected by the wage ceiling (only EPS is capped)', () => {
    expect(result.totalEmployeeContributedInr).toBeCloseTo(72_000, 6); // 50,000 * 0.12 * 12
  });
});

describe('simulateEpfVpf — interest compounds monthly on the opening balance', () => {
  const result = simulateEpfVpf(
    baseInput({
      monthlyBasicPlusDaInr: 0,
      employeeContributionRatePct: 0,
      employerContributionRatePct: 0,
      epsShareOfEmployerRatePct: 0,
      epfInterestRatePct: 12,
      openingBalanceInr: 100_000,
    }),
  );

  it('grows the opening balance by the full annual rate over one year (monthly factor compounds back to the annual rate)', () => {
    // 100,000 * (1 + 0.12/12*...)^12 == 100,000 * 1.12, since the monthly factor is (1.12)^(1/12)
    expect(result.corpusAtRetirementInr).toBeCloseTo(112_000, 2);
    expect(result.totalInterestEarnedInr).toBeCloseTo(12_000, 2);
  });
});

describe('simulateEpfVpf — edge cases', () => {
  it('clamps a retirement age at or before the current age to a 1-year horizon', () => {
    const result = simulateEpfVpf(baseInput({ currentAge: 45, retirementAge: 45 }));
    expect(result.yearsSimulated).toBe(1);
    expect(result.yearly).toHaveLength(1);
  });

  it('keeps the employee excess contribution in the taxable bucket once the per-year threshold is exceeded', () => {
    // 20,000 wage * 0.12 = 2,400/month employee contribution -> 28,800/year, well above a 10,000 threshold.
    const result = simulateEpfVpf(
      baseInput({ taxableInterestThresholdPerYearInr: 10_000, epfInterestRatePct: 12 }),
    );
    // Some interest must now be attributed to the taxable bucket once contributions exceed the threshold.
    expect(result.totalTaxableInterestInr).toBeGreaterThan(0);
    expect(result.totalTaxableInterestInr).toBeLessThan(result.totalInterestEarnedInr);
  });
});
