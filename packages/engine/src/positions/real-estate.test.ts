import { describe, expect, it } from 'vitest';

import { letOutPropertyPosition, ownedPropertyPosition, plotPosition } from './real-estate';
import { constantMarketContext } from './test-fixtures';

const ctx = constantMarketContext({ 'property.appreciation': 0.06, 'plot.appreciation': 0.08 });

describe('ownedPropertyPosition', () => {
  it('emits a correct 300-month stream for a financed self-occupied flat: no income, no taxable income, ever', () => {
    const position = ownedPropertyPosition('flat-3bhk', {
      purchasePrice: 30_000_000,
      entryCosts: 1_500_000, // stamp duty + registration, resolved by the caller from @data
      loan: { principal: 20_000_000, annualRate: () => 0.085, tenureMonths: 240 },
      appreciationSeries: 'property.appreciation',
      maintenancePerMonth: () => 3_000,
      annualPropertyTax: 18_000,
      liquidityTier: 2,
    });
    const rows = position.project(300, ctx);
    expect(rows).toHaveLength(300);

    // Self-occupied: never any rent, never any taxable house-property income.
    for (const row of rows) {
      expect(row.cashIn).toBe(0);
      expect(row.taxable).toEqual({});
      expect(row.liquidityTier).toBe(2);
    }

    // Month 1 carries the down payment + entry costs + first EMI + maintenance (no property tax yet).
    const downPayment = 30_000_000 - 20_000_000;
    const amortization = position.loanAmortization(300);
    expect(rows[0]!.cashOut).toBeCloseTo(downPayment + 1_500_000 + amortization[0]!.totalPayment + 3_000, 2);

    // Month 12 additionally carries the annual property tax.
    expect(rows[11]!.cashOut).toBeCloseTo(amortization[11]!.totalPayment + 3_000 + 18_000, 2);
    // A non-billing month does not.
    expect(rows[12]!.cashOut).toBeCloseTo(amortization[12]!.totalPayment + 3_000, 2);

    // Appreciation compounds for the full horizon regardless of the loan.
    expect(rows[0]!.assetValue).toBeGreaterThan(30_000_000);
    expect(rows[299]!.assetValue).toBeGreaterThan(rows[0]!.assetValue);

    // The 240-month loan pays off well before month 300; balance goes to (and stays at) zero,
    // and the EMI portion of cashOut disappears — but maintenance/property tax/appreciation
    // keep going, unlike a standalone loanPosition which goes fully inert after payoff.
    expect(rows[299]!.liabilityBalance).toBe(0);
    // Month 300 is itself a 12th-month billing point (300 / 12 = 25) — maintenance + property tax.
    expect(rows[299]!.cashOut).toBeCloseTo(3_000 + 18_000, 2);
    expect(rows[299]!.assetValue).toBeGreaterThan(0);
  });

  it('an all-cash purchase carries no loan at all', () => {
    const position = ownedPropertyPosition('flat-cash', {
      purchasePrice: 10_000_000,
      appreciationSeries: 'property.appreciation',
      liquidityTier: 2,
    });
    const rows = position.project(60, ctx);
    expect(rows[0]!.cashOut).toBe(10_000_000);
    expect(rows[0]!.liabilityBalance).toBe(0);
    expect(position.loanAmortization(60)).toEqual([]);
    for (const row of rows.slice(1)) {
      expect(row.cashOut).toBe(0);
      expect(row.liabilityBalance).toBe(0);
    }
  });

  it('rejects a loan principal larger than the purchase price', () => {
    expect(() =>
      ownedPropertyPosition('bad', {
        purchasePrice: 1_000_000,
        loan: { principal: 1_200_000, annualRate: () => 0.08, tenureMonths: 120 },
        appreciationSeries: 'property.appreciation',
        liquidityTier: 2,
      }),
    ).toThrow(RangeError);
  });
});

describe('plotPosition', () => {
  it('emits a correct 300-month stream for a financed plot: no income, no taxable income, thin-market liquidity', () => {
    const position = plotPosition('khopoli-plot', {
      purchasePrice: 7_500_000,
      loan: { principal: 7_500_000, annualRate: () => 0.105, tenureMonths: 180 },
      appreciationSeries: 'plot.appreciation',
      liquidityTier: 3,
    });
    const rows = position.project(300, ctx);
    expect(rows).toHaveLength(300);

    for (const row of rows) {
      expect(row.cashIn).toBe(0);
      expect(row.taxable).toEqual({});
      expect(row.liquidityTier).toBe(3);
    }

    // Fully financed: no down payment, month 1 is just the first EMI.
    const amortization = position.loanAmortization(300);
    expect(rows[0]!.cashOut).toBeCloseTo(amortization[0]!.totalPayment, 2);

    // Plot loan (180mo) is paid off well within the 300-month horizon.
    expect(rows[299]!.liabilityBalance).toBe(0);
    expect(rows[299]!.cashOut).toBe(0); // no maintenance/property-tax configured

    expect(rows[0]!.assetValue).toBeGreaterThan(7_500_000);
    expect(rows[299]!.assetValue).toBeGreaterThan(rows[0]!.assetValue);
  });
});

describe('letOutPropertyPosition', () => {
  const baseInput = {
    purchasePrice: 6_350_000,
    loan: { principal: 5_080_000, annualRate: () => 0.087, tenureMonths: 240 }, // 80% LTV
    appreciationSeries: 'property.appreciation',
    maintenancePerMonth: () => 2_000,
    annualPropertyTax: 12_000,
    monthlyRent: () => (6_350_000 * 0.045) / 12, // 4.5% gross yield, flat (no escalation, for a simple hand-check)
    vacancyRate: 0.05,
    standardDeductionRate: 0.3, // Section 24(a)/22 — in a real caller this comes from getIncomeTaxRules(fy).houseProperty
    liquidityTier: 2 as const,
  };

  it('emits a correct 300-month stream: rent is real cash income, house-property income is the netted taxable figure', () => {
    const position = letOutPropertyPosition('let-out-1400sqft', baseInput);
    const rows = position.project(300, ctx);
    expect(rows).toHaveLength(300);

    const amortization = position.loanAmortization(300);
    const grossMonthlyRent = (6_350_000 * 0.045) / 12;
    const expectedCashIn = Math.round((grossMonthlyRent * 0.95 + Number.EPSILON) * 100) / 100;

    // Month 1: rent received net of vacancy is real cash in.
    expect(rows[0]!.cashIn).toBeCloseTo(expectedCashIn, 2);
    expect(rows[0]!.cashOut).toBeCloseTo(6_350_000 - 5_080_000 + amortization[0]!.totalPayment + 2_000, 2);

    // House-property taxable income: NAV (rent minus the monthly share of property tax),
    // less the 30% standard deduction, less this month's loan interest.
    const nav = expectedCashIn - 12_000 / 12;
    const expectedTaxable = Math.round((nav * 0.7 - amortization[0]!.interest + Number.EPSILON) * 100) / 100;
    expect(rows[0]!.taxable.house_property).toBeCloseTo(expectedTaxable, 2);

    // In the early, interest-heavy years of the loan this is very likely a loss — exactly the
    // kind of number the new-regime set-off restriction (applied later, at tax-computation
    // time, not here) matters for.
    expect(rows[0]!.taxable.house_property).toBeLessThan(0);

    // After the 240-month loan pays off, rent/taxable income keep flowing — unlike the loan
    // itself, the property doesn't go inert.
    expect(rows[299]!.liabilityBalance).toBe(0);
    expect(rows[299]!.cashIn).toBeCloseTo(expectedCashIn, 2);
    expect(rows[299]!.taxable.house_property).toBeGreaterThan(0); // no interest left to deduct
  });

  it('possession lag: no rent or taxable income accrues before possessionMonth, but the loan keeps running', () => {
    const position = letOutPropertyPosition('under-construction', { ...baseInput, possessionMonth: 13 });
    const rows = position.project(60, ctx);

    for (const row of rows.slice(0, 12)) {
      expect(row.cashIn).toBe(0);
      expect(row.taxable).toEqual({});
      expect(row.liabilityBalance).toBeGreaterThan(0); // the loan doesn't wait for possession
    }
    expect(rows[12]!.cashIn).toBeGreaterThan(0); // month 13: possession begins
    expect(rows[12]!.taxable.house_property).toBeDefined();
  });

  it('rejects an out-of-range vacancy rate', () => {
    expect(() => letOutPropertyPosition('bad', { ...baseInput, vacancyRate: 1.5 })).toThrow(RangeError);
  });
});
