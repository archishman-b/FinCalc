import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { compoundContributions, compoundLumpsum, sipFutureValue } from './compounding';

describe('compoundLumpsum', () => {
  it('matches a hand-checked lumpsum growth (₹1,00,000 @ 12% for 12 months)', () => {
    expect(compoundLumpsum(100_000, 0.12, 12)).toBeCloseTo(112_682.503013, 5);
  });

  it('returns the principal unchanged over zero months', () => {
    expect(compoundLumpsum(50_000, 0.1, 0)).toBe(50_000);
  });

  it('rejects a negative month count', () => {
    expect(() => compoundLumpsum(1_000, 0.1, -1)).toThrow(RangeError);
  });
});

describe('sipFutureValue', () => {
  it('matches a hand-checked SIP future value (₹10,000/month @ 12% for 12 months, annuity-due)', () => {
    expect(sipFutureValue(10_000, 0.12, 12)).toBeCloseTo(128_093.280433, 4);
  });

  it('returns zero over zero months', () => {
    expect(sipFutureValue(10_000, 0.12, 0)).toBe(0);
  });
});

describe('compoundContributions', () => {
  it('matches an independently unrolled 3-month annuity-due recurrence', () => {
    const rows = compoundContributions(() => 10_000, () => 0.12, 3);
    expect(rows.map((r) => r.closingValue)).toEqual([10_100, 20_301, 30_604.010000000002]);
  });

  it('supports a step-up SIP by varying the contribution per month', () => {
    const rows = compoundContributions(
      (month) => (month <= 12 ? 10_000 : 11_000),
      () => 0.12,
      13,
    );
    expect(rows).toHaveLength(13);
    const month12 = rows[11]!.closingValue;
    const month13 = rows[12]!.closingValue;
    expect(month13).toBeCloseTo((month12 + 11_000) * 1.01, 6);
  });

  it('supports a rate that changes mid-horizon', () => {
    const rows = compoundContributions(() => 10_000, (month) => (month <= 6 ? 0.12 : 0.06), 12);
    expect(rows).toHaveLength(12);
    // Month 7 must compound on the 6% (not 12%) nominal monthly rate: re-derive
    // that one step directly from month 6's closing value.
    const month6 = rows[5]!.closingValue;
    const expectedMonth7 = (month6 + 10_000) * (1 + 0.06 / 12);
    expect(rows[6]!.closingValue).toBeCloseTo(expectedMonth7, 6);
  });
});

describe('compounding — property: growth composes across sub-periods', () => {
  it('growing a lumpsum for a+b months equals growing it a months then b months at the same rate', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1_000, max: 10_00_00_000 }),
        fc.integer({ min: 0, max: 2_000 }).map((n) => n / 10_000), // 0% .. 20% annual
        fc.integer({ min: 0, max: 200 }),
        fc.integer({ min: 0, max: 200 }),
        (principal, annualRate, a, b) => {
          const direct = compoundLumpsum(principal, annualRate, a + b);
          const staged = compoundLumpsum(compoundLumpsum(principal, annualRate, a), annualRate, b);
          expect(Math.abs(direct - staged)).toBeLessThan(Math.max(1e-4, Math.abs(direct) * 1e-9));
        },
      ),
      { numRuns: 200 },
    );
  });
});
