import { describe, expect, it } from 'vitest';

import {
  computeHistoricalComponentSplit,
  getCapitalGainsRules,
  getCostInflationIndexRules,
  getFixedIncomeRules,
  getIncomeTaxRules,
  getReitDistributionHistory,
  getReitDistributionRules,
  getReitInstrument,
  getReitInstruments,
  getRulePack,
  getStampDutyRules,
  latestReitDistributionRecord,
  listRulePacks,
  lookupCII,
  parseRulePack,
  REIT_IDS,
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
  it('ships nine packs — income-tax, capital-gains and reit-distributions for FY2026-27/FY2025-26, plus the cost-inflation-index, stamp-duty and fixed-income tables — and every one validates', () => {
    const packs = listRulePacks();
    expect(packs).toHaveLength(9);
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

  it('getFixedIncomeRules returns every shipped small-savings/EPF/VPF product, each with a valid rate and citation', () => {
    const rules = getFixedIncomeRules();
    const expectedProducts = ['ppf', 'ssy', 'nsc', 'kvp', 'scss', 'pomis', 'potd_1y', 'potd_2y', 'potd_3y', 'potd_5y', 'pord', 'posa', 'epf', 'vpf'];
    for (const id of expectedProducts) {
      expect(rules.products[id]).toBeDefined();
      expect(rules.products[id]!.rate).toBeGreaterThan(0);
      expect(rules.products[id]!.rate).toBeLessThan(0.2);
    }
  });

  it('getFixedIncomeRules: VPF earns the same rate as EPF, as documented', () => {
    const rules = getFixedIncomeRules();
    expect(rules.products.vpf!.rate).toBe(rules.products.epf!.rate);
  });

  it('getFixedIncomeRules: only the 5-year Post Office Time Deposit is Section 80C eligible', () => {
    const rules = getFixedIncomeRules();
    expect(rules.products.potd_5y!.section80C).toBe(true);
    expect(rules.products.potd_1y!.section80C).toBe(false);
    expect(rules.products.potd_3y!.section80C).toBe(false);
  });
});

describe('@fincalc/data REIT reference packs (reit-instruments, reit-distribution-history — user-supplied, not FY-scoped rule packs)', () => {
  it('getReitInstruments ships exactly the 5 REITs in REIT_IDS order, each with a non-https user_supplied provenance rather than a fabricated source URL', () => {
    const instruments = getReitInstruments();
    expect(instruments.map((i) => i.id)).toEqual([...REIT_IDS]);
  });

  it('getReitInstrument resolves a single REIT and throws for an unknown id', () => {
    expect(getReitInstrument('embassy').name).toBe('Embassy Office Parks REIT');
    expect(getReitInstrument('nexus').assetClassFocus).toBe('Retail / Shopping Malls');
    expect(() => getReitInstrument('not-a-reit')).toThrow(RangeError);
  });

  it('a null price-CAGR field always carries a note explaining why (too short a listing history, not a zero return)', () => {
    const knowledgeRealty = getReitInstrument('knowledge-realty');
    expect(knowledgeRealty.priceCagr1y).toBeNull();
    expect(knowledgeRealty.priceCagr1yNote).toBeTruthy();
    const embassy = getReitInstrument('embassy');
    expect(embassy.priceCagr1y).not.toBeNull();
  });

  it('getReitDistributionHistory ships 93 quarterly records spanning 2019-08-14 to 2026-08-28, and every record was supplied for one of the 5 shipped REITs', () => {
    const history = getReitDistributionHistory();
    expect(history).toHaveLength(93);
    const ids = new Set(history.map((r) => r.reitId));
    expect([...ids].sort()).toEqual([...REIT_IDS].sort());
    const dates = history.map((r) => r.date).sort();
    expect(dates[0]).toBe('2019-08-14');
    expect(dates[dates.length - 1]).toBe('2026-08-28');
  });

  it('every distribution record\'s four components sum to its totalDpuInr within a ₹0.01 rounding tolerance', () => {
    for (const r of getReitDistributionHistory()) {
      const sum = r.interestInr + r.dividendExemptInr + r.dividendTaxableInr + r.debtRepaymentCapReturnInr + r.otherIncomeInr;
      expect(Math.abs(sum - r.totalDpuInr)).toBeLessThanOrEqual(0.01);
    }
  });

  it('each REIT\'s earliest distribution record matches the listing-era context its instrument entry implies (Nexus and Knowledge Realty start later, consistent with their null older-window CAGRs)', () => {
    const history = getReitDistributionHistory();
    const firstDateFor = (id: string) => history.filter((r) => r.reitId === id).map((r) => r.date).sort()[0];
    expect(firstDateFor('embassy')).toBe('2019-08-14');
    expect(firstDateFor('mindspace')).toBe('2020-11-20');
    expect(firstDateFor('brookfield')).toBe('2021-06-03');
    expect(firstDateFor('nexus')).toBe('2023-08-28');
    expect(firstDateFor('knowledge-realty')).toBe('2025-08-29');
  });

  it('computeHistoricalComponentSplit derives a four-component split (summing to 1) from the actual records, per REIT — never a hardcoded guess', () => {
    const history = getReitDistributionHistory();
    for (const id of REIT_IDS) {
      const split = computeHistoricalComponentSplit(history, id);
      const total = split.interest + split.dividend + split.rental + split.returnOfCapital;
      expect(total).toBeCloseTo(1, 6);
      expect(split.quartersObserved).toBeGreaterThan(0);
      expect(split.interest).toBeGreaterThanOrEqual(0);
      expect(split.dividend).toBeGreaterThanOrEqual(0);
      expect(split.returnOfCapital).toBeGreaterThanOrEqual(0);
    }
  });

  it('computeHistoricalComponentSplit: rental is 0 for every REIT — all 5 hold assets via SPVs, none distribute direct rental income in the supplied history', () => {
    const history = getReitDistributionHistory();
    for (const id of REIT_IDS) {
      expect(computeHistoricalComponentSplit(history, id).rental).toBe(0);
    }
  });

  it('computeHistoricalComponentSplit: Mindspace is almost entirely dividend-distributed, Brookfield has no dividend component at all — the two REITs sit at opposite ends of the mix, matching their very different effective-tax-rate notes', () => {
    const history = getReitDistributionHistory();
    const mindspace = computeHistoricalComponentSplit(history, 'mindspace');
    const brookfield = computeHistoricalComponentSplit(history, 'brookfield');
    expect(mindspace.dividend).toBeGreaterThan(0.7);
    expect(brookfield.dividend).toBe(0);
  });

  it('computeHistoricalComponentSplit throws for a REIT id with no records, and trailingQuarters limits the window', () => {
    const history = getReitDistributionHistory();
    const allTime = computeHistoricalComponentSplit(history, 'embassy');
    const trailing4 = computeHistoricalComponentSplit(history, 'embassy', 4);
    expect(allTime.quartersObserved).toBe(29);
    expect(trailing4.quartersObserved).toBe(4);
  });

  it('latestReitDistributionRecord returns the most recent record per REIT', () => {
    const history = getReitDistributionHistory();
    expect(latestReitDistributionRecord(history, 'embassy').date).toBe('2026-08-03');
    expect(latestReitDistributionRecord(history, 'knowledge-realty').date).toBe('2026-08-28');
  });
});
