import { getIncomeTaxRules } from '@fincalc/data';
import { describe, expect, it } from 'vitest';

import {
  computeIncomeTax,
  hraExemption,
  rebate87A,
  resolveSlabs,
  slabTax,
  surchargeWithMarginalRelief,
} from './income-tax';

// Income-tax figures are identical across FY2025-26 and FY2026-27 in the
// shipped packs (only the governing Act's section numbers changed) — either
// FY exercises the same slab/rebate/surcharge logic. FY2026-27 is used here.
const rules = getIncomeTaxRules('2026-27');

describe('slabTax', () => {
  it('returns 0 for non-positive income', () => {
    expect(slabTax(0, rules.regimes.new.slabs)).toBe(0);
    expect(slabTax(-100, rules.regimes.new.slabs)).toBe(0);
  });

  it('taxes only the portion within each slab (new regime, ₹9L)', () => {
    // 0–4L: 0%, 4–8L: 5% = 20,000, 8–9L: 10% = 10,000
    expect(slabTax(900_000, rules.regimes.new.slabs)).toBeCloseTo(30_000, 2);
  });
});

describe('resolveSlabs', () => {
  it('picks the 60–79 senior table for the old regime', () => {
    const slabs = resolveSlabs(rules.regimes.old, '60to79');
    expect(slabs[0]!.upTo).toBe(300_000); // seniors: 0% up to ₹3L, not ₹2.5L
  });

  it('picks the 80+ super-senior table for the old regime', () => {
    const slabs = resolveSlabs(rules.regimes.old, '80plus');
    expect(slabs[0]!.upTo).toBe(500_000); // super-seniors: 0% up to ₹5L
  });

  it('is age-blind for the new regime even when a senior is passed', () => {
    expect(resolveSlabs(rules.regimes.new, '80plus')).toBe(rules.regimes.new.slabs);
  });
});

describe('hraExemption', () => {
  it('takes the minimum of received / (rent − 10% basic) / metro share', () => {
    // received 2.4L, rent−10%basic = 3L−0.6L = 2.4L, 50%*6L = 3L → min is 2.4L
    const exemption = hraExemption(
      { basicSalaryAnnual: 600_000, hraReceivedAnnual: 240_000, rentPaidAnnual: 300_000, isMetro: true },
      rules.hra,
    );
    expect(exemption).toBeCloseTo(240_000, 2);
  });

  it('is never negative when rent paid is below 10% of basic', () => {
    const exemption = hraExemption(
      { basicSalaryAnnual: 600_000, hraReceivedAnnual: 100_000, rentPaidAnnual: 50_000, isMetro: false },
      rules.hra,
    );
    expect(exemption).toBe(0);
  });
});

describe('rebate87A', () => {
  it('old regime: full cliff — rebate disappears entirely just above the ₹5L threshold', () => {
    const r = rebate87A(500_001, slabTax(500_001, rules.regimes.old.slabs), rules.regimes.old.rebate87A);
    expect(r).toBe(0);
  });

  it('new regime: tapers so tax payable never exceeds (income − threshold)', () => {
    const taxableIncome = 1_210_000; // ₹10,000 above the ₹12L threshold
    const tax = slabTax(taxableIncome, rules.regimes.new.slabs);
    const r = rebate87A(taxableIncome, tax, rules.regimes.new.rebate87A);
    expect(tax - r).toBeCloseTo(10_000, 2);
  });
});

describe('surchargeWithMarginalRelief', () => {
  it('applies no surcharge below the lowest threshold', () => {
    const result = surchargeWithMarginalRelief(
      4_000_000,
      slabTax(4_000_000, rules.regimes.old.slabs),
      rules.surcharge.slabs,
      null,
      (income) => slabTax(income, rules.regimes.old.slabs),
    );
    expect(result.surcharge).toBe(0);
  });

  it('relieves the jump at a threshold so tax+surcharge growth never exceeds income growth (old regime, ₹51L)', () => {
    const taxableIncome = 5_100_000;
    const tax = slabTax(taxableIncome, rules.regimes.old.slabs);
    const result = surchargeWithMarginalRelief(
      taxableIncome,
      tax,
      rules.surcharge.slabs,
      null,
      (income) => slabTax(income, rules.regimes.old.slabs),
    );
    expect(tax).toBeCloseTo(1_342_500, 2);
    expect(result.surchargeBeforeRelief).toBeCloseTo(134_250, 2);
    expect(result.marginalRelief).toBeCloseTo(64_250, 2);
    expect(result.surcharge).toBeCloseTo(70_000, 2);
  });

  it('the new regime caps the surcharge rate at newRegimeCap even in the top slab', () => {
    const taxableIncome = 60_000_000; // ₹6Cr — the uncapped top slab rate (37%) would otherwise apply
    const tax = slabTax(taxableIncome, rules.regimes.new.slabs);
    const result = surchargeWithMarginalRelief(
      taxableIncome,
      tax,
      rules.surcharge.slabs,
      rules.surcharge.newRegimeCap,
      (income) => slabTax(income, rules.regimes.new.slabs),
    );
    expect(result.rate).toBeCloseTo(rules.surcharge.newRegimeCap!, 4);
  });

  it('marginal relief still fires under the new regime at the real 15%→25% jump (₹2Cr), even though later thresholds are flattened by the cap', () => {
    const taxableIncome = 20_050_000; // ₹50,000 above the ₹2Cr threshold
    const tax = slabTax(taxableIncome, rules.regimes.new.slabs);
    const result = surchargeWithMarginalRelief(
      taxableIncome,
      tax,
      rules.surcharge.slabs,
      rules.surcharge.newRegimeCap,
      (income) => slabTax(income, rules.regimes.new.slabs),
    );
    expect(tax).toBeCloseTo(5_595_000, 2);
    expect(result.marginalRelief).toBeCloseTo(526_750, 2);
    expect(result.surcharge).toBeCloseTo(872_000, 2);
  });
});

/**
 * Six representative households plus two surcharge-focused edge cases,
 * independently derived from the shipped FY2026-27 rule pack (see
 * scripts/verify-income-tax.py in this session's scratch history — not
 * checked in, but every figure below was cross-computed via a from-scratch
 * Python re-implementation of the same law before being hard-coded here).
 */
describe('computeIncomeTax — representative households', () => {
  it('H1: new regime, ₹18L salary, no deductions', () => {
    const result = computeIncomeTax({ regime: 'new', age: 'under60', grossSalary: 1_800_000 }, rules);
    expect(result.taxableIncome).toBe(1_725_000);
    expect(result.taxAtSlabRates).toBeCloseTo(145_000, 2);
    expect(result.rebate87A).toBe(0);
    expect(result.totalTaxPayable).toBe(150_800);
  });

  it('H2: new regime, ₹9.5L salary — fully rebated under Section 87A', () => {
    const result = computeIncomeTax({ regime: 'new', age: 'under60', grossSalary: 950_000 }, rules);
    expect(result.taxAfterRebate).toBe(0);
    expect(result.totalTaxPayable).toBe(0);
  });

  it('H3: new regime, ₹12.85L salary — in the Section 87A marginal-relief zone', () => {
    const result = computeIncomeTax({ regime: 'new', age: 'under60', grossSalary: 1_285_000 }, rules);
    expect(result.taxableIncome).toBe(1_210_000);
    expect(result.taxAfterRebate).toBeCloseTo(10_000, 2);
    expect(result.totalTaxPayable).toBe(10_400);
  });

  it('H4: old regime, ₹15L salary with HRA + 80C + 80D + self-occupied 24(b) interest', () => {
    const result = computeIncomeTax(
      {
        regime: 'old',
        age: 'under60',
        grossSalary: 1_500_000,
        hra: { basicSalaryAnnual: 600_000, hraReceivedAnnual: 240_000, rentPaidAnnual: 300_000, isMetro: true },
        selfOccupiedHomeLoanInterest: 220_000, // capped at the ₹2L statutory limit
        otherSourcesIncome: 20_000,
        section80c: 150_000,
        section80d: { selfAndFamilyPremium: 25_000, parentsPremium: 30_000, parentsAge: '60orAbove' },
      },
      rules,
    );
    expect(result.hraExemption).toBeCloseTo(240_000, 2);
    expect(result.section24bDeduction).toBe(200_000); // ₹2,20,000 paid, capped at ₹2,00,000
    expect(result.section80cDeduction).toBe(150_000);
    expect(result.section80dDeduction).toBe(55_000); // 25,000 self + 30,000 parents (within ₹50,000 senior-parent cap)
    expect(result.taxableIncome).toBe(825_000);
    expect(result.totalTaxPayable).toBe(80_600);
  });

  it('H5: old regime, senior citizen (60–79), ₹8L pension', () => {
    const result = computeIncomeTax(
      {
        regime: 'old',
        age: '60to79',
        grossSalary: 800_000,
        otherSourcesIncome: 50_000,
        section80c: 50_000,
        section80d: { selfAndFamilyPremium: 50_000 },
      },
      rules,
    );
    expect(result.section80dDeduction).toBe(50_000); // senior self-limit, not the under-60 ₹25,000 limit
    expect(result.taxableIncome).toBe(700_000);
    expect(result.totalTaxPayable).toBe(52_000);
  });

  it('surcharge marginal relief: old regime, ₹51,00,000 taxable income', () => {
    const result = computeIncomeTax({ regime: 'old', age: 'under60', otherSourcesIncome: 5_100_000 }, rules);
    expect(result.surchargeRate).toBeCloseTo(0.1, 4);
    expect(result.surchargeMarginalRelief).toBeCloseTo(64_250, 2);
    expect(result.surcharge).toBe(70_000);
    expect(result.cess).toBe(56_500);
    expect(result.totalTaxPayable).toBe(1_469_000);
  });

  it('new-regime surcharge cap: ₹6Cr taxable income never exceeds the 25% ceiling', () => {
    const result = computeIncomeTax({ regime: 'new', age: 'under60', otherSourcesIncome: 60_000_000 }, rules);
    expect(result.surchargeRate).toBeCloseTo(0.25, 4);
    expect(result.surchargeMarginalRelief).toBe(0);
    expect(result.totalTaxPayable).toBe(22_854_000);
  });
});
