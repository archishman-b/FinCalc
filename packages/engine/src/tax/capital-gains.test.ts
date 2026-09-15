import { getCapitalGainsRules, getCostInflationIndexRules } from '@fincalc/data';
import { describe, expect, it } from 'vitest';

import {
  computePropertyGains,
  debtFundGainsTax,
  equityGainsTax,
  indexedCost,
  propertyLtcgRouteOptions,
  reitGainsTax,
  resolvePropertyLtcgWithExemption,
  section54ECExemption,
  section54Exemption,
  section54FExemption,
} from './capital-gains';

const rules = getCapitalGainsRules('2026-27');
const cii = getCostInflationIndexRules();

describe('indexedCost', () => {
  it('scales original cost by CII(sale FY) / CII(acquisition FY)', () => {
    // 80,00,000 acquired FY2015-16 (CII 254), sold FY2026-27 (CII 384)
    expect(indexedCost(8_000_000, '2015-16', '2026-27', cii)).toBeCloseTo(12_094_488.19, 2);
  });

  it('is a no-op when acquisition and sale FY share the same CII', () => {
    expect(indexedCost(500_000, '2020-21', '2020-21', cii)).toBeCloseTo(500_000, 2);
  });
});

describe('equityGainsTax', () => {
  it('LTCG: gain above the ₹1.25L annual exemption is taxed at 12.5% on the excess', () => {
    const result = equityGainsTax({ gain: 300_000, holdingMonths: 18 }, rules.equity);
    expect(result).toEqual({ kind: 'flat', taxableAmount: 175_000, rate: 0.125, tax: 21_875 });
  });

  it('LTCG: gain within the exemption is untaxed', () => {
    const result = equityGainsTax({ gain: 100_000, holdingMonths: 12 }, rules.equity);
    expect(result.kind).toBe('flat');
    expect((result as { tax: number }).tax).toBe(0);
  });

  it('STCG: taxed at 20% flat, no exemption, below the 12-month threshold', () => {
    const result = equityGainsTax({ gain: 100_000, holdingMonths: 6 }, rules.equity);
    expect(result).toEqual({ kind: 'flat', taxableAmount: 100_000, rate: 0.2, tax: 20_000 });
  });

  it('a loss is never negative tax', () => {
    const result = equityGainsTax({ gain: -50_000, holdingMonths: 18 }, rules.equity);
    expect((result as { tax: number }).tax).toBe(0);
  });
});

describe('reitGainsTax', () => {
  it('FY2026-27: the equity-style ₹1.25L exemption now applies to REIT/InvIT LTCG too', () => {
    const result = reitGainsTax({ gain: 200_000, holdingMonths: 24 }, rules.reit);
    expect(result).toEqual({ kind: 'flat', taxableAmount: 75_000, rate: 0.125, tax: 9_375 });
  });

  it('FY2025-26: no exemption yet — the full LTCG is taxable', () => {
    const rulesPrevYear = getCapitalGainsRules('2025-26');
    const result = reitGainsTax({ gain: 200_000, holdingMonths: 24 }, rulesPrevYear.reit);
    expect(result).toEqual({ kind: 'flat', taxableAmount: 200_000, rate: 0.125, tax: 25_000 });
  });
});

describe('debtFundGainsTax', () => {
  it('post-2023 units are always slab-taxed, regardless of holding period', () => {
    const result = debtFundGainsTax(
      { gain: 50_000, holdingMonths: 30, acquiredOnOrAfterSlabTaxationDate: true },
      rules.debtFunds,
    );
    expect(result).toEqual({ kind: 'slab', amount: 50_000 });
  });

  it('grandfathered units held past the LTCG threshold get flat LTCG with no indexation', () => {
    const result = debtFundGainsTax(
      { gain: 200_000, holdingMonths: 30, acquiredOnOrAfterSlabTaxationDate: false },
      rules.debtFunds,
    );
    expect(result).toEqual({ kind: 'flat', taxableAmount: 200_000, rate: 0.125, tax: 25_000 });
  });

  it('grandfathered units held short of the LTCG threshold are still slab-taxed', () => {
    const result = debtFundGainsTax(
      { gain: 200_000, holdingMonths: 12, acquiredOnOrAfterSlabTaxationDate: false },
      rules.debtFunds,
    );
    expect(result).toEqual({ kind: 'slab', amount: 200_000 });
  });
});

describe('section54Exemption / section54FExemption / section54ECExemption', () => {
  it('section54: exemption is capped at the lower of the gain and the amount reinvested', () => {
    expect(section54Exemption(2_200_000, 1_000_000, rules.section54)).toBe(1_000_000);
    expect(section54Exemption(2_200_000, 5_000_000, rules.section54)).toBe(2_200_000);
  });

  it('section54F: exemption is proportional to the share of net consideration reinvested, and nil if too many other houses are owned', () => {
    const exemption = section54FExemption(1_000_000, 4_000_000, 2_000_000, 0, rules.section54F);
    expect(exemption).toBe(500_000); // 50% of consideration reinvested → 50% of the gain exempted
    expect(section54FExemption(1_000_000, 4_000_000, 2_000_000, 2, rules.section54F)).toBe(0);
  });

  it('section54EC: exemption is capped at the bond investment limit even if more was invested', () => {
    const overInvested = rules.section54EC.investmentCap + 1_000_000;
    expect(section54ECExemption(10_000_000, overInvested, rules.section54EC)).toBe(rules.section54EC.investmentCap);
  });
});

describe('property LTCG — the regime-choice / Section 54 interaction (H6)', () => {
  const input = {
    saleValue: 30_000_000,
    costOfAcquisition: 8_000_000,
    acquisitionFy: '2015-16',
    saleFy: '2026-27',
    holdingMonths: 132,
    taxpayerType: 'resident_individual' as const,
  };

  it('prices both routes: the no-indexation route has the lower pre-exemption tax', () => {
    const routes = propertyLtcgRouteOptions(input, rules.property, cii);
    expect(routes.noIndexation.tax).toBe(2_750_000);
    expect(routes.withIndexation!.tax).toBeCloseTo(3_581_102.36, 2);
    expect(routes.noIndexation.tax).toBeLessThan(routes.withIndexation!.tax);
  });

  it('a ₹1.9Cr Section 54 reinvestment flips the winning route: the indexed route shelters its whole (smaller) gain', () => {
    const routes = propertyLtcgRouteOptions(input, rules.property, cii);
    const reinvested = 19_000_000;

    // Applied to each route's own gain separately — not to whichever gain "looks" smaller.
    const exemptionOnNoIndexation = section54Exemption(routes.noIndexation.taxableAmount, reinvested, rules.section54);
    const exemptionOnWithIndexation = section54Exemption(routes.withIndexation!.taxableAmount, reinvested, rules.section54);
    expect(exemptionOnNoIndexation).toBe(19_000_000); // reinvestment capped by the ₹2.2Cr no-indexation gain's cash value
    expect(exemptionOnWithIndexation).toBeCloseTo(17_905_511.81, 2); // reinvestment exceeds this route's smaller gain — fully sheltered

    const resolution = resolvePropertyLtcgWithExemption(routes, (gain) =>
      section54Exemption(gain, reinvested, rules.section54),
    );
    // No-indexation route's own final tax would be (2.2Cr − 1.9Cr) × 12.5% = ₹3,75,000 — higher than
    // the indexed route's post-exemption ₹0, even though the indexed route looked worse pre-exemption.
    expect(resolution.chosenRoute).toBe('withIndexation');
    expect(resolution.result.tax).toBe(0);
  });

  it('a non-individual/HUF taxpayer has no transitional option and is always priced on the no-indexation route', () => {
    const companyInput = { ...input, taxpayerType: 'other' as const };
    const result = computePropertyGains(companyInput, rules.property, cii);
    expect('chosenRoute' in result && result.chosenRoute).toBe('noIndexation');
  });

  it('a short-term holding (< 24 months) is slab-taxed, bypassing the route choice entirely', () => {
    const shortTermInput = { ...input, holdingMonths: 18 };
    const result = computePropertyGains(shortTermInput, rules.property, cii);
    expect(result).toEqual({ kind: 'slab', amount: 22_000_000 });
  });
});
