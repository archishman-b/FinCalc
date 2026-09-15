import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  annualContributionFutureValue,
  compoundAnnualContributions,
  compoundAnnually,
  compoundAtFrequency,
  yearsToDouble,
} from './fixed-income';

describe('compoundAnnually', () => {
  it('matches an independently hand-checked NSC-shape lumpsum (₹1,00,000 @ 7.7% for 5 years)', () => {
    expect(compoundAnnually(100_000, 0.077, 5)).toBeCloseTo(144_903.38, 2);
  });

  it('returns the principal unchanged at a zero rate', () => {
    expect(compoundAnnually(50_000, 0, 3)).toBeCloseTo(50_000, 8);
  });

  it('returns the principal unchanged over zero years', () => {
    expect(compoundAnnually(50_000, 0.08, 0)).toBeCloseTo(50_000, 8);
  });

  it('rejects a negative tenure', () => {
    expect(() => compoundAnnually(50_000, 0.08, -1)).toThrow(RangeError);
  });

  it('rejects a negative principal', () => {
    expect(() => compoundAnnually(-1, 0.08, 5)).toThrow(RangeError);
  });
});

describe('annualContributionFutureValue / compoundAnnualContributions — PPF/SSY shape', () => {
  it('matches an independently hand-checked full PPF tenure (₹1,50,000/yr @ 7.1% for 15 years)', () => {
    expect(annualContributionFutureValue(150_000, 0.071, 15)).toBeCloseTo(4_068_209.22, 2);
  });

  it('matches an independently hand-checked 5-year partial run (₹1,00,000/yr @ 7.1% for 5 years)', () => {
    expect(annualContributionFutureValue(100_000, 0.071, 5)).toBeCloseTo(617_134.29, 2);
  });

  it('is annuity-due: the first year contribution earns that first year of interest', () => {
    const rows = compoundAnnualContributions(() => 100_000, () => 0.10, 1);
    expect(rows[0]?.closingValue).toBeCloseTo(110_000, 6);
  });

  it('returns an empty schedule and zero future value over zero years', () => {
    expect(compoundAnnualContributions(() => 100_000, () => 0.07, 0)).toEqual([]);
    expect(annualContributionFutureValue(100_000, 0.07, 0)).toBe(0);
  });

  it('rejects a negative tenure', () => {
    expect(() => compoundAnnualContributions(() => 1000, () => 0.07, -1)).toThrow(RangeError);
  });

  it('supports a step-up contribution (e.g. a rising SSY deposit) via the per-year callback', () => {
    const rows = compoundAnnualContributions((year) => (year <= 2 ? 50_000 : 100_000), () => 0.08, 4);
    expect(rows).toHaveLength(4);
    expect(rows[2]?.contribution).toBe(100_000);
  });

  it('property: future value is monotonically non-decreasing in the contribution rate, for realistic small-savings rates', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.03, max: 0.09, noNaN: true }),
        fc.double({ min: 0.031, max: 0.12, noNaN: true }),
        fc.integer({ min: 1, max: 15 }),
        (lowRate, highRateDelta, years) => {
          const highRate = lowRate + highRateDelta;
          const low = annualContributionFutureValue(100_000, lowRate, years);
          const high = annualContributionFutureValue(100_000, highRate, years);
          expect(high).toBeGreaterThanOrEqual(low);
        },
      ),
    );
  });
});

describe('yearsToDouble', () => {
  it('matches KVP’s officially cited ~115-month (9y 5m) doubling period at 7.5%', () => {
    const months = yearsToDouble(0.075) * 12;
    expect(months).toBeCloseTo(115, 0);
  });

  it('a higher rate doubles faster', () => {
    expect(yearsToDouble(0.10)).toBeLessThan(yearsToDouble(0.05));
  });

  it('rejects a non-positive rate', () => {
    expect(() => yearsToDouble(0)).toThrow(RangeError);
    expect(() => yearsToDouble(-0.01)).toThrow(RangeError);
  });
});

describe('compoundAtFrequency', () => {
  it('matches an independently hand-checked Post-Office-Time-Deposit-shape quarterly compounding (₹1,00,000 @ 7.5% for 5 years)', () => {
    expect(compoundAtFrequency(100_000, 0.075, 5, 4)).toBeCloseTo(144_994.80, 2);
  });

  it('with periodsPerYear = 1, matches compoundAnnually exactly', () => {
    expect(compoundAtFrequency(100_000, 0.075, 5, 1)).toBeCloseTo(compoundAnnually(100_000, 0.075, 5), 8);
  });

  it('a higher compounding frequency yields a higher future value at the same nominal rate', () => {
    const annual = compoundAtFrequency(100_000, 0.08, 10, 1);
    const quarterly = compoundAtFrequency(100_000, 0.08, 10, 4);
    const monthly = compoundAtFrequency(100_000, 0.08, 10, 12);
    expect(quarterly).toBeGreaterThan(annual);
    expect(monthly).toBeGreaterThan(quarterly);
  });

  it('rejects a non-positive periodsPerYear', () => {
    expect(() => compoundAtFrequency(1000, 0.07, 5, 0)).toThrow(RangeError);
  });
});
