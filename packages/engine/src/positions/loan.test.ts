import { describe, expect, it } from 'vitest';

import { loanPosition } from './loan';
import { constantMarketContext } from './test-fixtures';

const ctx = constantMarketContext({});

describe('loanPosition', () => {
  it('emits a correct 300-month stream for a loan that pays off well within the horizon (15yr plot loan in a 25yr scenario)', () => {
    const position = loanPosition('plot-loan', {
      principal: 7_500_000,
      annualRate: () => 0.10,
      tenureMonths: 180, // 15 years
    });
    const rows = position.project(300, ctx);
    expect(rows).toHaveLength(300);

    // Loan is active and amortising from month 1
    expect(rows[0]!.liabilityBalance).toBeGreaterThan(0);

    // The level EMI for a 180-month tenure doesn't always zero the balance in
    // exactly 180 months under paisa rounding — a real bank's own final
    // instalment "trues up" whatever tiny residual is left, which can push
    // the very last real payment into month 181 (see amortize()'s documented
    // rounding-drift behaviour). Find the actual payoff month dynamically
    // rather than hard-coding an assumed index, so the test reflects real
    // engine behaviour rather than a hand-calculated guess about it.
    const payoffIndex = rows.findIndex((r) => r.liabilityBalance === 0);
    expect(payoffIndex).toBeGreaterThan(0);
    // Sanity: payoff should land right around the 180-month tenure (within a
    // month or two of rounding drift), not wildly off.
    expect(payoffIndex + 1).toBeGreaterThanOrEqual(180);
    expect(payoffIndex + 1).toBeLessThanOrEqual(182);

    // The payoff row itself is still a real (if tiny) instalment — a bank
    // trues up the final residual rather than leaving it outstanding forever.
    expect(rows[payoffIndex]!.cashOut).toBeGreaterThan(0);

    // Every row up to payoff carries a positive, monotonically
    // non-increasing balance.
    for (let i = 1; i < payoffIndex; i++) {
      expect(rows[i]!.liabilityBalance).toBeLessThanOrEqual(rows[i - 1]!.liabilityBalance);
    }

    // Everything after the payoff row is correctly padded: no loan, no
    // cashflow, zero balance. The padding deliberately reports 0 rather than
    // carrying forward any rounding residual — a real bank trues up its
    // final instalment rather than leaving a borrower owing a few paise
    // forever (see amortize()'s own documentation of this behaviour).
    for (const row of rows.slice(payoffIndex + 1)) {
      expect(row.liabilityBalance).toBe(0);
      expect(row.cashOut).toBe(0);
      expect(row.cashIn).toBe(0);
      expect(row.assetValue).toBe(0);
    }

    // Month numbers are contiguous and correct across the pad boundary
    expect(rows[0]!.month).toBe(1);
    expect(rows[299]!.month).toBe(300);
  });

  it('a loan whose own tenure exceeds the requested horizon is simply truncated, still owing a balance', () => {
    const position = loanPosition('home-loan', {
      principal: 20_000_000,
      annualRate: () => 0.085,
      tenureMonths: 240, // 20 years
    });
    const rows = position.project(60, ctx); // only look at the first 5 years
    expect(rows).toHaveLength(60);
    expect(rows[59]!.liabilityBalance).toBeGreaterThan(0);
    expect(rows[59]!.liabilityBalance).toBeLessThan(20_000_000);
  });

  it('exposes the raw amortisation schedule for callers that need per-month interest (e.g. Section 24b)', () => {
    const position = loanPosition('home-loan', {
      principal: 5_000_000,
      annualRate: () => 0.085,
      tenureMonths: 240,
    });
    const schedule = position.amortization(12);
    expect(schedule).toHaveLength(12);
    expect(schedule[0]!.interest).toBeCloseTo((5_000_000 * 0.085) / 12, 2);
  });

  it('rejects a non-positive tenure', () => {
    expect(() => loanPosition('x', { principal: 100_000, annualRate: () => 0.08, tenureMonths: 0 })).toThrow(RangeError);
  });
});
