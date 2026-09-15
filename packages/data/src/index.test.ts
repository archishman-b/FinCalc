import { describe, expect, it } from 'vitest';

import {
  getCapitalGainsRules,
  getCostInflationIndexRules,
  getIncomeTaxRules,
  getReitDistributionRules,
  getRulePack,
  getStampDutyRules,
  listRulePacks,
  lookupCII,
  parseRulePack,
  stampDutyAndRegistrationCost,
} from './index';

const fixture = {
  id: 'fixture-pack',
  fy: '2026-27',
  effectiveFrom: '2026-04-01',
  provenance: { source: 'https://example.org/notification', verifiedOn: '2026-09-14' },
  rules: { example: { value: 0.3 } },
};

describe('@fincalc/data rule-pack envelope', () => {
  it('accepts a pack with full provenance', () => {
    const pack = parseRulePack(fixture);
    expect(pack.jurisdiction).toBe('IN');
    expect(pack.provenance.verifiedOn).toBe('2026-09-14');
  });

  it('defaults citations to an empty object when the pack omits it', () => {
    const pack = parseRulePack(fixture);
    expect(pack.citations).toEqual({});
  });

  it('accepts a pack with per-entry citations', () => {
    const pack = parseRulePack({
      ...fixture,
      citations: { example: { source: 'https://example.org/other', verifiedOn: '2026-09-14', note: 'differs from the pack anchor' } },
    });
    expect(pack.citations.example?.note).toBe('differs from the pack anchor');
  });

  it('rejects a pack whose provenance is missing a verifiedOn date', () => {
    const { provenance, ...rest } = fixture;
    expect(() => parseRulePack({ ...rest, provenance: { source: provenance.source } })).toThrow();
  });

  it('rejects a malformed financial-year label', () => {
    expect(() => parseRulePack({ ...fixture, fy: 'FY26' })).toThrow();
  });
});

describe('@fincalc/data shipped packs (Phase 2: income-tax and capital-gains)', () => {
  it('ships eight packs — income-tax, capital-gains and reit-distributions for FY2026-27/FY2025-26, plus the cost-inflation-index and stamp-duty tables — and every one validates', () => {
    const packs = listRulePacks();
    expect(packs).toHaveLength(8);
    for (const pack of packs) expect(() => parseRulePack(pack)).not.toThrow();
  });

  it('every shipped pack carries a real, dated provenance — no pack ships without a source', () => {
    for (const pack of listRulePacks()) {
      expect(pack.provenance.source).toMatch(/^https:\/\//);
      expect(pack.provenance.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('getRulePack finds a pack by FY (returns the first match; use getIncomeTaxRules/getCapitalGainsRules for a specific family)', () => {
    expect(getRulePack('2026-27')).toBeDefined();
    expect(getRulePack('2099-00')).toBeUndefined();
  });

  it('getIncomeTaxRules returns typed rules for both shipped FYs', () => {
    for (const fy of ['2026-27', '2025-26']) {
      const rules = getIncomeTaxRules(fy);
      expect(rules.regimes.new.standardDeduction).toBe(75000);
      expect(rules.regimes.old.standardDeduction).toBe(50000);
      expect(rules.regimes.new.hraExemptionAllowed).toBe(false);
      expect(rules.regimes.old.hraExemptionAllowed).toBe(true);
      // Section 24(a) [old Act] / Section 22 [new Act] — flat 30%, regime-independent.
      expect(rules.houseProperty.standardDeductionRate).toBe(0.3);
    }
  });

  it('getIncomeTaxRules throws for an FY with no income-tax pack', () => {
    expect(() => getIncomeTaxRules('2019-20')).toThrow(RangeError);
  });

  it('getCapitalGainsRules returns typed rules for both shipped FYs, with the REIT exemption difference intact', () => {
    expect(getCapitalGainsRules('2025-26').reit.ltcgExemptionPerYear).toBeNull();
    expect(getCapitalGainsRules('2026-27').reit.ltcgExemptionPerYear).toBe(125000);
  });

  it('getCapitalGainsRules throws for an FY with no capital-gains pack', () => {
    expect(() => getCapitalGainsRules('2019-20')).toThrow(RangeError);
  });

  it('getCostInflationIndexRules returns the full table, base year 2001-02=100, cross-checked spot values intact', () => {
    const cii = getCostInflationIndexRules();
    expect(cii.baseYear).toBe('2001-02');
    expect(cii.index['2001-02']).toBe(100);
    expect(cii.index['2015-16']).toBe(254);
    expect(cii.index['2020-21']).toBe(301);
    expect(cii.index['2026-27']).toBe(384);
  });

  it('lookupCII resolves a covered FY and throws for one outside the table', () => {
    const cii = getCostInflationIndexRules();
    expect(lookupCII('2026-27', cii)).toBe(384);
    expect(() => lookupCII('2050-51', cii)).toThrow(RangeError);
  });

  it('getStampDutyRules covers Telangana (municipal corporation) and Maharashtra (municipal council)', () => {
    const stampDuty = getStampDutyRules();
    expect(stampDuty.states.TG?.byLocalBody.municipal_corporation?.stampDutyRateMale).toBe(0.04);
    expect(stampDuty.states.TG?.byLocalBody.municipal_corporation?.transferDuty).toBe(0.015);
    expect(stampDuty.states.MH?.byLocalBody.municipal_council?.stampDutyRateFemale).toBe(0.03);
    expect(stampDuty.states.MH?.byLocalBody.municipal_council?.registrationFeeCap).toBe(30_000);
  });

  it('stampDutyAndRegistrationCost: Hyderabad (Telangana, municipal corporation) totals 6% plus capped-free registration', () => {
    const stampDuty = getStampDutyRules();
    const rates = stampDuty.states.TG!.byLocalBody.municipal_corporation!;
    // ₹2,90,00,000 property: 4% + 1.5% transfer duty + 0.5% registration (uncapped) = 6% flat
    expect(stampDutyAndRegistrationCost(29_000_000, rates)).toBeCloseTo(29_000_000 * 0.06, 2);
  });

  it('stampDutyAndRegistrationCost: Raigad (Maharashtra, municipal council) caps the registration fee above ₹30L', () => {
    const stampDuty = getStampDutyRules();
    const rates = stampDuty.states.MH!.byLocalBody.municipal_council!;
    // ₹75,00,000 plot: 4% stamp duty + registration capped at ₹30,000 (1% of 75L would be ₹75,000, so the cap binds)
    expect(stampDutyAndRegistrationCost(7_500_000, rates)).toBeCloseTo(7_500_000 * 0.04 + 30_000, 2);
    // A sole female buyer gets the 3% rate
    expect(stampDutyAndRegistrationCost(7_500_000, rates, 'female')).toBeCloseTo(7_500_000 * 0.03 + 30_000, 2);
  });

  it('getStampDutyRules exposes the GST-on-under-construction rates', () => {
    const stampDuty = getStampDutyRules();
    expect(stampDuty.gstOnUnderConstruction.nonAffordableRate).toBe(0.05);
    expect(stampDuty.gstOnUnderConstruction.affordableHousingRate).toBe(0.01);
    expect(stampDuty.gstOnUnderConstruction.readyToMoveWithOccupancyCertificateRate).toBe(0);
  });

  it('getReitDistributionRules: interest, rental and return-of-capital are identical across both FYs', () => {
    const fy2025 = getReitDistributionRules('2025-26');
    const fy2026 = getReitDistributionRules('2026-27');
    expect(fy2025.interest).toEqual(fy2026.interest);
    expect(fy2025.rental).toEqual(fy2026.rental);
    expect(fy2025.returnOfCapital).toEqual(fy2026.returnOfCapital);
  });

  it('getReitDistributionRules: the dividend component rule changes between FY2025-26 and FY2026-27', () => {
    const fy2025 = getReitDistributionRules('2025-26');
    const fy2026 = getReitDistributionRules('2026-27');
    // FY2025-26: taxability depends on the SPV's 115BAA election
    expect(fy2025.dividend.dependsOnSpvConcessionalRegimeElection).toBe(true);
    expect(fy2025.dividend.taxableIfSpvOptedIntoConcessionalRegime).toBe(true);
    // FY2026-27: TOLA 2026 removed the dependency — exempt regardless
    expect(fy2026.dividend.dependsOnSpvConcessionalRegimeElection).toBe(false);
  });

  it('getReitDistributionRules throws for an FY with no reit-distributions pack', () => {
    expect(() => getReitDistributionRules('2019-20')).toThrow(RangeError);
  });
});
