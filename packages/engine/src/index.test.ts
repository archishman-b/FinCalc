import { describe, expect, it } from 'vitest';

import { ENGINE_VERSION, type MonthlyRow } from './index';

describe('@fincalc/engine', () => {
  it('exports a semantic version', () => {
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('reports taxable income by head, not as one number', () => {
    const row: MonthlyRow = {
      month: 1,
      cashOut: 90_000,
      cashIn: 35_000,
      taxable: { house_property: 35_000 },
      assetValue: 1_40_00_000,
      liabilityBalance: 95_00_000,
      liquidityTier: 2,
    };
    expect(row.taxable.house_property).toBe(35_000);
    expect(row.taxable.salary).toBeUndefined();
  });
});
