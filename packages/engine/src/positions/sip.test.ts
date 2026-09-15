import { describe, expect, it } from 'vitest';

import { lumpsumPosition, sipPosition } from './sip';
import { constantMarketContext, variableMarketContext } from './test-fixtures';

const ctx = constantMarketContext({ 'equity.index_total_return': 0.12 });

describe('sipPosition', () => {
  it('emits a correct 300-month stream for a plain SIP: no income, no liability, growing assetValue', () => {
    const position = sipPosition('nifty-sip', {
      monthlyContribution: () => 25_000,
      growthSeries: 'equity.index_total_return',
    });
    const rows = position.project(300, ctx);
    expect(rows).toHaveLength(300);

    for (const row of rows) {
      expect(row.cashIn).toBe(0);
      expect(row.taxable).toEqual({}); // no income event during accumulation — only on exit (Phase 4)
      expect(row.liabilityBalance).toBe(0);
      expect(row.liquidityTier).toBe(1);
      expect(row.cashOut).toBe(25_000);
    }

    // Annuity-due compounding: first month's balance is (0 + 25000) * (1 + 0.01).
    expect(rows[0]!.assetValue).toBeCloseTo(25_000 * 1.01, 2);
    // Monotonically growing across the whole horizon.
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]!.assetValue).toBeGreaterThan(rows[i - 1]!.assetValue);
    }
    // Contributed over 300 months: 75,00,000. A 12%-nominal SIP should end up well ahead of that.
    expect(rows[299]!.assetValue).toBeGreaterThan(25_000 * 300);
  });

  it('a step-up SIP (larger instalment from month 13) contributes more than a flat one over the same horizon', () => {
    const flat = sipPosition('flat', { monthlyContribution: () => 20_000, growthSeries: 'equity.index_total_return' });
    const stepUp = sipPosition('stepup', {
      monthlyContribution: (month) => (month <= 12 ? 20_000 : 24_000),
      growthSeries: 'equity.index_total_return',
    });
    const flatRows = flat.project(120, ctx);
    const stepUpRows = stepUp.project(120, ctx);
    expect(stepUpRows[119]!.assetValue).toBeGreaterThan(flatRows[119]!.assetValue);
  });

  it('respects a volatile (non-smooth) growth path via MarketContext rather than a flat CAGR', () => {
    const volatileCtx = variableMarketContext({
      'equity.index_total_return': (month) => (month % 24 < 12 ? 0.25 : -0.05), // boom/bust cycle
    });
    const position = sipPosition('volatile', { monthlyContribution: () => 10_000, growthSeries: 'equity.index_total_return' });
    const rows = position.project(48, volatileCtx);
    // Not monotonic — the bust months should show the balance's growth rate slow or reverse
    // relative to a pure-contribution baseline, proving the per-month rate lookup is actually
    // being used rather than an average being smoothed over.
    const grownInBoom = rows[11]!.assetValue - rows[0]!.assetValue;
    const grownInBust = rows[23]!.assetValue - rows[12]!.assetValue;
    expect(grownInBust).toBeLessThan(grownInBoom);
  });

  it('continues from an existing opening balance', () => {
    const position = sipPosition('continuing', {
      monthlyContribution: () => 10_000,
      growthSeries: 'equity.index_total_return',
      openingBalance: 500_000,
    });
    const rows = position.project(12, ctx);
    expect(rows[0]!.assetValue).toBeCloseTo((500_000 + 10_000) * 1.01, 2);
  });

  it('rejects a negative opening balance', () => {
    expect(() => sipPosition('bad', { monthlyContribution: () => 1000, growthSeries: 'x', openingBalance: -1 })).toThrow(RangeError);
  });
});

describe('lumpsumPosition', () => {
  it('emits a correct 300-month stream: the whole principal leaves in month 1, nothing more contributed', () => {
    const position = lumpsumPosition('lumpsum-1cr', { principal: 10_000_000, growthSeries: 'equity.index_total_return' });
    const rows = position.project(300, ctx);
    expect(rows).toHaveLength(300);

    expect(rows[0]!.cashOut).toBe(10_000_000);
    for (const row of rows.slice(1)) {
      expect(row.cashOut).toBe(0);
    }
    for (const row of rows) {
      expect(row.cashIn).toBe(0);
      expect(row.taxable).toEqual({});
      expect(row.liabilityBalance).toBe(0);
    }

    expect(rows[0]!.assetValue).toBeCloseTo(10_000_000 * 1.01, 2);
    expect(rows[299]!.assetValue).toBeGreaterThan(10_000_000);
    // Matches compoundLumpsum's closed-form FV to the rupee.
    const expectedFv = 10_000_000 * Math.pow(1.01, 300);
    expect(rows[299]!.assetValue).toBeCloseTo(expectedFv, 2);
  });

  it('rejects a negative principal', () => {
    expect(() => lumpsumPosition('bad', { principal: -1, growthSeries: 'x' })).toThrow(RangeError);
  });
});
