import { describe, expect, it } from 'vitest';

import { rentalExpensePosition } from './rental-expense';
import { constantMarketContext } from './test-fixtures';

describe('rentalExpensePosition', () => {
  it('emits a correct 300-month stream: pure cash outflow, no asset built, no taxable income', () => {
    const position = rentalExpensePosition('cbd-rent', {
      monthlyRent: (month) => (month <= 24 ? 65_000 : 70_000), // one escalation at month 25
      securityDeposit: 200_000,
    });
    const rows = position.project(300, constantMarketContext({}));
    expect(rows).toHaveLength(300);

    expect(rows[0]!.cashOut).toBe(200_000 + 65_000); // deposit + first month's rent
    expect(rows[23]!.cashOut).toBe(65_000);
    expect(rows[24]!.cashOut).toBe(70_000); // escalation lands

    for (const row of rows) {
      expect(row.cashIn).toBe(0);
      expect(row.taxable).toEqual({});
      expect(row.liabilityBalance).toBe(0);
      expect(row.liquidityTier).toBe(1);
      // The deposit is tied up (an asset), not spent — constant for the whole horizon since
      // the position doesn't know within this horizon when the tenancy actually ends.
      expect(row.assetValue).toBe(200_000);
    }
  });

  it('with no deposit configured, assetValue is zero throughout — a pure expense', () => {
    const position = rentalExpensePosition('no-deposit', { monthlyRent: () => 40_000 });
    const rows = position.project(60, constantMarketContext({}));
    expect(rows[0]!.cashOut).toBe(40_000);
    for (const row of rows) {
      expect(row.assetValue).toBe(0);
    }
  });

  it('rejects a negative security deposit', () => {
    expect(() => rentalExpensePosition('bad', { monthlyRent: () => 1000, securityDeposit: -1 })).toThrow(RangeError);
  });

  it('rejects a non-positive months request', () => {
    const position = rentalExpensePosition('x', { monthlyRent: () => 1000 });
    expect(() => position.project(0, constantMarketContext({}))).toThrow(RangeError);
  });
});
