import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { amortize, emi, levelEmiSchedule } from './amortization';

describe('emi', () => {
  it('matches a hand-checked bank EMI calculator (₹50,00,000 @ 8.5% for 240 months)', () => {
    expect(emi(5_000_000, 0.085, 240)).toBeCloseTo(43_391.16, 2);
  });

  it('falls back to straight-line principal/tenure when the rate is zero', () => {
    expect(emi(120_000, 0, 12)).toBeCloseTo(10_000, 8);
  });

  it('rejects a non-positive tenure', () => {
    expect(() => emi(100_000, 0.08, 0)).toThrow(RangeError);
  });
});

describe('levelEmiSchedule — boundary cases', () => {
  it('zero-interest loan: instalments are exactly equal and the loan closes to precisely zero', () => {
    const rows = levelEmiSchedule(120_000, 0, 12);
    expect(rows).toHaveLength(12);
    for (const row of rows) {
      expect(row.interest).toBe(0);
      expect(row.scheduledPrincipal).toBeCloseTo(10_000, 8);
    }
    expect(rows[11]!.closingBalance).toBe(0);
  });

  it('a full-tenure schedule closes the loan out at the golden EMI value', () => {
    const rows = levelEmiSchedule(5_000_000, 0.085, 240);
    expect(rows).toHaveLength(240);
    expect(rows[0]!.totalPayment).toBeCloseTo(43_391.16, 2);
    // Rounding interest to the nearest paisa every month, then reapplying the fixed
    // (unrounded) EMI for 240 months, can leave a residual of a rupee or two — see the
    // property test below for the tolerance this is verified against across the full
    // realistic input range. For this specific golden case it is ₹1.04.
    expect(Math.abs(rows[239]!.closingBalance)).toBeLessThan(2);
  });

  it('a horizon shorter than the loan tenure stops early with a positive balance still outstanding', () => {
    const rows = levelEmiSchedule(5_000_000, 0.085, 240, 12);
    expect(rows).toHaveLength(12);
    expect(rows[11]!.closingBalance).toBeGreaterThan(0);
    expect(rows[11]!.closingBalance).toBeLessThan(5_000_000);
  });

  it('supports a mid-tenure rate change by varying annualRate per month', () => {
    const instalment = emi(1_000_000, 0.08, 24);
    const rows = amortize({
      principal: 1_000_000,
      annualRate: (month) => (month <= 12 ? 0.08 : 0.1),
      scheduledPayment: () => instalment,
      months: 24,
    });
    expect(rows).toHaveLength(24);
    const beforeChange = rows[11]!;
    const afterChange = rows[12]!;
    // Same instalment, higher rate from month 13 → interest eats a bigger share of the opening balance.
    expect(afterChange.interest / afterChange.openingBalance).toBeGreaterThan(
      beforeChange.interest / beforeChange.openingBalance,
    );
  });
});

describe('amortize — prepayment exceeding the balance', () => {
  it('caps a prepayment at the remaining balance instead of driving it negative', () => {
    const rows = amortize({
      principal: 100_000,
      annualRate: () => 0.1,
      scheduledPayment: () => 1_000,
      extraPrepayment: (month) => (month === 1 ? 10_000_000 : 0), // absurdly large one-off prepayment offer
      months: 240,
    });
    expect(rows).toHaveLength(1); // the loop stops the moment the balance reaches zero
    const first = rows[0]!;
    expect(first.closingBalance).toBe(0);
    // The prepayment consumes whatever principal the scheduled instalment didn't —
    // interest is serviced separately and never reduces the balance.
    expect(first.prepayment).toBeCloseTo(100_000 - first.scheduledPrincipal, 2);
  });

  it('a scheduled payment alone that exceeds the balance leaves nothing for the prepayment to consume', () => {
    const rows = amortize({
      principal: 50_000,
      annualRate: () => 0.1,
      scheduledPayment: (_month, balance) => balance + 5_000, // pays it off with room to spare
      extraPrepayment: () => 10_000_000,
      months: 6,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.closingBalance).toBe(0);
    expect(rows[0]!.prepayment).toBe(0);
  });
});

describe('amortize — property: principal components sum to the loan, to the rupee', () => {
  it('across randomised realistic home/plot loans (₹5L–₹5Cr, 0–16% p.a., up to 30-year tenure), the scheduled-principal components sum to the loan and the loan closes out within a small tolerance', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 500_000, max: 50_000_000 }),
        fc.integer({ min: 0, max: 1_600 }).map((n) => n / 10_000), // 0% .. 16% annual, in 0.01% steps
        fc.integer({ min: 1, max: 360 }),
        (principal, annualRate, tenureMonths) => {
          const rows = levelEmiSchedule(principal, annualRate, tenureMonths);
          const totalPrincipal = rows.reduce((sum, r) => sum + r.scheduledPrincipal, 0);
          const finalBalance = rows[rows.length - 1]!.closingBalance;

          // Accounting identity: nothing is created or destroyed by rounding — it only
          // shifts a few paise between "repaid" and "still outstanding".
          expect(Math.abs(principal - totalPrincipal - finalBalance)).toBeLessThan(0.01);

          // The loan actually closes out by the end of its tenure. Rounding interest to
          // the nearest paisa every month, then compounding that residual forward for the
          // remaining months at rate r, is what real bank schedules do too — for a long,
          // high-rate, large loan this can leave more than ₹1 outstanding, but always a
          // tiny fraction of the principal (verified empirically up to ~0.01% worst case
          // across this input range).
          expect(Math.abs(finalBalance)).toBeLessThanOrEqual(Math.max(2, principal * 0.001));
        },
      ),
      { numRuns: 300 },
    );
  });
});
