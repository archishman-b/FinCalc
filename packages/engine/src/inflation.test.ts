import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { compoundLumpsum } from './compounding';
import { deflateToToday, presentValue, realRate } from './inflation';

describe('realRate — Fisher equation', () => {
  it('matches a hand-checked positive real-return case (12% nominal, 6% inflation)', () => {
    expect(realRate(0.12, 0.06)).toBeCloseTo(0.05660377, 8);
  });

  it('matches a hand-checked negative real-return case (4% nominal, 7% inflation)', () => {
    expect(realRate(0.04, 0.07)).toBeCloseTo(-0.02803738, 8);
  });

  it('is exactly zero when nominal equals inflation', () => {
    expect(realRate(0.07, 0.07)).toBeCloseTo(0, 10);
  });

  it('is NOT the naive nominal-minus-inflation approximation', () => {
    const exact = realRate(0.12, 0.06);
    const approximation = 0.12 - 0.06;
    expect(Math.abs(exact - approximation)).toBeGreaterThan(0.0005);
  });
});

describe('presentValue / deflateToToday', () => {
  it('deflateToToday is presentValue applied against the inflation rate', () => {
    expect(deflateToToday(112_682.503013, 0.12, 12)).toBeCloseTo(100_000, 5);
  });

  it('discounting for zero months returns the amount unchanged', () => {
    expect(presentValue(50_000, 0.08, 0)).toBe(50_000);
  });

  it('rejects a negative month count', () => {
    expect(() => presentValue(1_000, 0.1, -1)).toThrow(RangeError);
  });
});

describe('inflation — property: deflating undoes compounding at the same rate', () => {
  it('growing a lumpsum at rate r for n months, then deflating it back at the same r, returns the original principal', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1_000, max: 10_00_00_000 }),
        fc.integer({ min: -500, max: 2_000 }).map((n) => n / 10_000), // -5% .. 20% annual
        fc.integer({ min: 0, max: 480 }),
        (principal, annualRate, months) => {
          const grown = compoundLumpsum(principal, annualRate, months);
          const back = deflateToToday(grown, annualRate, months);
          expect(Math.abs(back - principal)).toBeLessThan(Math.max(1e-4, Math.abs(principal) * 1e-9));
        },
      ),
      { numRuns: 200 },
    );
  });
});
