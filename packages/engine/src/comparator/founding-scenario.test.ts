/**
 * Brief §7, "test #1" — the founding scenario (§0), Options A/B/C, encoded
 * end-to-end. Phase 4's own "done when" bar (§6): "The founding scenario
 * (A vs B vs C) runs end to end and reproduces plausible numbers."
 *
 * This is NOT a hand-verified golden test the way Phase 1's amortisation
 * or Phase 2's household tax cases are — the founding scenario has too
 * many moving, mutually-interacting parts (three multi-position
 * scenarios, annual tax, equalisation, exit economics, all four horizons)
 * for a spreadsheet to independently re-derive to the rupee. What this
 * test asserts is what the brief itself asks for: the comparison runs to
 * completion across 5/10/15/25 years, produces structurally sane
 * (positive, ordered, tax-aware) numbers, and the mechanics proven
 * correct by comparator.test.ts and canonical-failure-case.test.ts
 * (equalisation, reinvestment, annual accrual tax) are exercised on the
 * real multi-position shape a household actually has.
 *
 * One acknowledged gap, flagged rather than guessed per the brief's own
 * instruction (§9): the existing Hyderabad flat's current market value —
 * needed for Option A's sale proceeds and Options B/C's kept-asset base —
 * was never supplied. Per Archishman's own choice when asked, this test
 * uses a clearly-flagged placeholder (₹1.4cr) rather than blocking Phase
 * 4 on it; every figure downstream of `EXISTING_FLAT_VALUE` in this file
 * carries the same caveat and should be revisited once the real value is
 * known. The pre-scenario question of *how* the existing flat's equity is
 * raised or redeployed (sold for Option A's down payment, kept as
 * collateral-free equity for B/C) is a one-time, month-0 household event
 * outside what a Position/Scenario models — this engine's Comparator
 * starts at month 1 of each option's own forward cash-flow stream, not
 * the balance-sheet event that precedes it.
 */

import {
  getCostInflationIndexRules,
  getIncomeTaxRules,
  getStampDutyRules,
  stampDutyAndRegistrationCost,
} from '@fincalc/data';
import { describe, expect, it } from 'vitest';

import { letOutPropertyPosition, ownedPropertyPosition, plotPosition } from '../positions/real-estate';
import { rentalExpensePosition } from '../positions/rental-expense';
import { sipPosition } from '../positions/sip';
import { constantMarketContext } from '../positions/test-fixtures';

import { compare } from './comparator';
import type { HouseholdTaxConfig, Scenario } from './types';

const START_FY = '2026-27';
const HORIZONS = [60, 120, 180, 300]; // 5 / 10 / 15 / 25 years
const incomeTaxRules = getIncomeTaxRules(START_FY);
const cii = getCostInflationIndexRules();
const stampDuty = getStampDutyRules();

/** Unconfirmed placeholder — see the module doc comment. */
const EXISTING_FLAT_VALUE = 14_000_000;
const EXISTING_FLAT_LOAN_BALANCE = 9_500_000; // "₹95L loan" — treated as the current outstanding balance

const step5PctPerYear = (base: number) => (month: number) => Math.round(base * Math.pow(1.05, Math.floor((month - 1) / 12)));

const DEFAULT_SWEEP_SERIES = 'default.index_fund';
const ctx = constantMarketContext({
  'property.appreciation': 0.06,
  'plot.appreciation': 0.07,
  'equity.index': 0.11,
  [DEFAULT_SWEEP_SERIES]: 0.11,
});

// A household earning ~₹4.5L/month *post-tax* (brief §0) needs a materially higher gross salary
// under the new regime -- approximated here (not a tax rule, so not something to source-cite;
// documented as a scenario-construction convenience) so the household's marginal rate on its
// *additional* position-driven income (house-property, REIT/SIP gains) is realistic rather than
// understated by an implicitly-zero baseline salary.
const household: HouseholdTaxConfig = {
  regime: 'new',
  age: 'under60',
  grossSalaryAnnual: () => 7_000_000,
};

const tgRates = stampDuty.states.TG!.byLocalBody.municipal_corporation!;
const mhRaigadRates = stampDuty.states.MH!.byLocalBody.municipal_council!;

function optionA(): Scenario {
  const purchasePrice = 29_000_000; // mid of "₹2.8-3cr"
  const entryCosts = stampDutyAndRegistrationCost(purchasePrice, tgRates);
  const loanPrincipal = 20_000_000; // "₹2cr loan"
  return {
    id: 'A',
    name: 'A: Upgrade to a 3BHK',
    positions: [
      ownedPropertyPosition('a:3bhk', {
        purchasePrice,
        entryCosts,
        loan: { principal: loanPrincipal, annualRate: () => 0.08, tenureMonths: 300 }, // emi(2cr, 8%, 300mo) ≈ ₹1.54L, "EMI ~₹1.5L, 20-25yr"
        appreciationSeries: 'property.appreciation',
        maintenancePerMonth: () => 8_000,
        annualPropertyTax: 15_000,
        liquidityTier: 2,
      }),
    ],
    exitConfigs: [{ positionId: 'a:3bhk', capitalGainsTreatment: 'property', costOfAcquisition: purchasePrice + entryCosts }],
    growthAssumptions: [{ positionId: 'a:3bhk', seriesId: 'property.appreciation', label: 'Option A 3BHK appreciation' }],
    sweepGrowthSeries: DEFAULT_SWEEP_SERIES,
    sweepExitConfig: { capitalGainsTreatment: 'equity' },
  };
}

function optionB(): Scenario {
  const plotPrice = 10_500_000; // "₹75L loan" at a plot-loan-typical ~71% LTV
  const plotLoanPrincipal = 7_500_000;
  const plotEntryCosts = stampDutyAndRegistrationCost(plotPrice, mhRaigadRates);
  return {
    id: 'B',
    name: 'B: Rent out existing flat + rent CBD + buy Khopoli-Karjat plot',
    positions: [
      letOutPropertyPosition('b:existing-flat-let-out', {
        purchasePrice: EXISTING_FLAT_VALUE,
        loan: { principal: EXISTING_FLAT_LOAN_BALANCE, annualRate: () => 0.08, tenureMonths: 180 }, // emi ≈ ₹90,787, "EMI ₹90k/15yr"
        appreciationSeries: 'property.appreciation',
        monthlyRent: step5PctPerYear(35_000), // mid of "₹30-40k"
        standardDeductionRate: incomeTaxRules.houseProperty.standardDeductionRate,
        liquidityTier: 2,
      }),
      rentalExpensePosition('b:cbd-rent', {
        monthlyRent: step5PctPerYear(67_500), // mid of "₹60-75k"
        securityDeposit: 202_500, // 3 months, conventional in this market
      }),
      plotPosition('b:khopoli-karjat-plot', {
        purchasePrice: plotPrice,
        entryCosts: plotEntryCosts,
        loan: { principal: plotLoanPrincipal, annualRate: () => 0.105, tenureMonths: 144 }, // "plot loans typically 10-15yr", rate premium
        appreciationSeries: 'plot.appreciation',
        liquidityTier: 3, // "plot in the Khopoli-Karjat belt" — thin, investor-dominated market
      }),
    ],
    exitConfigs: [
      { positionId: 'b:existing-flat-let-out', capitalGainsTreatment: 'property', costOfAcquisition: EXISTING_FLAT_VALUE },
      { positionId: 'b:cbd-rent', capitalGainsTreatment: 'none' }, // deposit refund, no gain
      {
        positionId: 'b:khopoli-karjat-plot',
        capitalGainsTreatment: 'property',
        costOfAcquisition: plotPrice + plotEntryCosts,
        illiquidityHaircut: 0.05, // brief §3: "5% for a plot in a deep market" default
      },
    ],
    growthAssumptions: [
      { positionId: 'b:existing-flat-let-out', seriesId: 'property.appreciation', label: 'Option B existing flat appreciation' },
      { positionId: 'b:khopoli-karjat-plot', seriesId: 'plot.appreciation', label: 'Option B Khopoli-Karjat plot appreciation' },
    ],
    sweepGrowthSeries: DEFAULT_SWEEP_SERIES,
    sweepExitConfig: { capitalGainsTreatment: 'equity' },
  };
}

function optionC(): Scenario {
  return {
    id: 'C',
    name: 'C: Rent out existing flat + rent CBD + REIT/index SIP',
    positions: [
      letOutPropertyPosition('c:existing-flat-let-out', {
        purchasePrice: EXISTING_FLAT_VALUE,
        loan: { principal: EXISTING_FLAT_LOAN_BALANCE, annualRate: () => 0.08, tenureMonths: 180 },
        appreciationSeries: 'property.appreciation',
        monthlyRent: step5PctPerYear(35_000),
        standardDeductionRate: incomeTaxRules.houseProperty.standardDeductionRate,
        liquidityTier: 2,
      }),
      rentalExpensePosition('c:cbd-rent', {
        monthlyRent: step5PctPerYear(67_500),
        securityDeposit: 202_500,
      }),
      sipPosition('c:index-sip', {
        monthlyContribution: () => 40_000, // "deploy the remaining monthly capacity" — equalisation tops this up further
        growthSeries: 'equity.index',
      }),
    ],
    exitConfigs: [
      { positionId: 'c:existing-flat-let-out', capitalGainsTreatment: 'property', costOfAcquisition: EXISTING_FLAT_VALUE },
      { positionId: 'c:cbd-rent', capitalGainsTreatment: 'none' },
      { positionId: 'c:index-sip', capitalGainsTreatment: 'equity' },
    ],
    growthAssumptions: [
      { positionId: 'c:existing-flat-let-out', seriesId: 'property.appreciation', label: 'Option C existing flat appreciation' },
      { positionId: 'c:index-sip', seriesId: 'equity.index', label: 'Option C index SIP growth' },
    ],
    sweepGrowthSeries: DEFAULT_SWEEP_SERIES,
    sweepExitConfig: { capitalGainsTreatment: 'equity' },
  };
}

describe('founding scenario (brief §0 / §7 test #1): Option A vs B vs C', () => {
  it('runs end to end across 5/10/15/25 years without throwing', () => {
    expect(() =>
      compare({ scenarios: [optionA(), optionB(), optionC()], ctx, horizonsMonths: HORIZONS, startFy: START_FY, household, cii }),
    ).not.toThrow();
  });

  const result = compare({ scenarios: [optionA(), optionB(), optionC()], ctx, horizonsMonths: HORIZONS, startFy: START_FY, household, cii });

  it('equalises all three options to the same monthly outflow every month (brief principle 1)', () => {
    const [a, b, c] = result.scenarios;
    for (let m = 0; m < HORIZONS[HORIZONS.length - 1]!; m++) {
      expect(a!.equalisedMonthlyOutflow[m]).toBe(b!.equalisedMonthlyOutflow[m]);
      expect(b!.equalisedMonthlyOutflow[m]).toBe(c!.equalisedMonthlyOutflow[m]);
    }
  });

  it('produces a positive, plausible-order-of-magnitude terminal net worth at every horizon for every option', () => {
    for (const scenario of result.scenarios) {
      for (const horizon of scenario.perHorizon) {
        expect(Number.isFinite(horizon.terminalNetWorth)).toBe(true);
        expect(horizon.terminalNetWorth).toBeGreaterThan(0);
        // Sanity band: a ~₹1.5-2L/month household commitment over up to 25 years shouldn't land
        // outside roughly ₹50L (5yr, low end) to ₹50cr (25yr, generous high end).
        expect(horizon.terminalNetWorth).toBeGreaterThan(500_000);
        expect(horizon.terminalNetWorth).toBeLessThan(500_000_000);
      }
      // Terminal net worth should grow monotonically with horizon for every option.
      for (let i = 1; i < scenario.perHorizon.length; i++) {
        expect(scenario.perHorizon[i]!.terminalNetWorth).toBeGreaterThan(scenario.perHorizon[i - 1]!.terminalNetWorth);
      }
    }
  });

  it('taxes real income annually for every option that has any (rent, REIT/SIP exit) — cumulative tax paid is positive', () => {
    for (const scenario of result.scenarios) {
      for (const horizon of scenario.perHorizon) {
        expect(horizon.totalTaxPaidCumulative).toBeGreaterThanOrEqual(0);
      }
      // Every option here includes a let-out property from month 1 -- real tax must be paid by
      // the first (5-year) horizon at the latest.
      expect(scenario.perHorizon[0]!.totalTaxPaidCumulative).toBeGreaterThan(0);
    }
  });

  it('reports capital deployed into each option\'s own dedicated positions, distinct from its sweep top-up', () => {
    for (const scenario of result.scenarios) {
      for (const horizon of scenario.perHorizon) {
        expect(horizon.capitalDeployedIntoOwnPositions).toBeGreaterThan(0);
        expect(horizon.ownPositionsValueAfterTax + horizon.sweepValueAfterTax).toBeCloseTo(horizon.terminalNetWorth, 2);
      }
    }
  });

  it('runs the Parity Auditor over all three options without throwing, returning an array', () => {
    expect(Array.isArray(result.parityWarnings)).toBe(true);
  });
});
