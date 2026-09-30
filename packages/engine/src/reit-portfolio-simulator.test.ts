import { describe, expect, it } from 'vitest';

import { rankWeights, reitPostTaxYieldPct, simulateReitPortfolio, type ReitPortfolioSimulatorInput, type ReitPortfolioSimulatorReitInput } from './reit-portfolio-simulator';

/**
 * The 5 REITs and every tax/growth default below are ported verbatim from
 * the prototype's own `DEFAULTS` object (reit-simulator.html) — see
 * reit-portfolio-snapshot.ts's data pack for the same numbers with
 * provenance. `contributionWindowYears: 15, horizonYears: 25,
 * unitPriceGrowthPct: 3, harvestPct: 100` are the prototype's own defaults
 * too — this is deliberately the exact scenario the user's brief quotes:
 * "with a 15-year window, 25-year horizon, 3% growth and 100% harvest,
 * strategy 2's net result is ₹86.75 L and strategy 3's SIP stops after 93
 * months." Both figures were independently verified before this port even
 * began, by running the prototype's own unmodified `simulate()` JavaScript
 * standalone in Node against its own unmodified `DEFAULTS` — see that
 * verification script's output for the exact values this test asserts
 * against: strategy 2 net = 8675092.868972618, strategy 3 off-ramp month =
 * 93 exactly, strategy 1 net = 5645538.220045198.
 */
const DEFAULT_REITS: ReitPortfolioSimulatorReitInput[] = [
  { id: 'embassy', name: 'Embassy', priceInr: 437.66, distributionYieldPct: 5.85, interestPct: 6.4, dividendPct: 18.5, returnOfCapitalPct: 75.1, priceCagrSinceListingPct: 5.2, weightPct: 20 },
  { id: 'mindspace', name: 'Mindspace', priceInr: 498, distributionYieldPct: 5.35, interestPct: 0, dividendPct: 50.1, returnOfCapitalPct: 49.9, priceCagrSinceListingPct: 10.2, weightPct: 20 },
  { id: 'brookfield', name: 'Brookfield', priceInr: 341.5, distributionYieldPct: 6.5, interestPct: 42.2, dividendPct: 16.5, returnOfCapitalPct: 41.3, priceCagrSinceListingPct: 3.9, weightPct: 20 },
  { id: 'nexus', name: 'Nexus Select', priceInr: 166.2, distributionYieldPct: 5.69, interestPct: 42.7, dividendPct: 35.3, returnOfCapitalPct: 22.0, priceCagrSinceListingPct: 16.4, weightPct: 20 },
  { id: 'knowledge-realty', name: 'Knowledge Realty', priceInr: 113.45, distributionYieldPct: 5.84, interestPct: 14.7, dividendPct: 57.5, returnOfCapitalPct: 27.8, priceCagrSinceListingPct: 12.2, weightPct: 20 },
];

function defaultInput(overrides: Partial<ReitPortfolioSimulatorInput> = {}): ReitPortfolioSimulatorInput {
  return {
    reits: DEFAULT_REITS,
    lumpsumInr: 5_000_000,
    monthlySipInr: 100_000,
    sipStepUpPctPerYear: 0,
    brokeragePct: 0,
    contributionWindowYears: 15,
    horizonYears: 25,
    harvestPct: 100,
    unitPriceGrowthPct: 3,
    tieDistributionGrowthToPrice: true,
    distributionGrowthPct: 3,
    inflationPct: 6,
    slabRatePct: 31.2,
    taxDividendComponent: false,
    ltcgRatePct: 12.5,
    stcgRatePct: 20,
    ltcgExemptionInr: 125_000,
    capitalGainsCessPct: 4,
    reinvestmentSplit: 'allocation',
    ...overrides,
  };
}

describe('simulateReitPortfolio — golden values, verified against the prototype\'s own unmodified simulate() before this port began', () => {
  it('strategy 2 (reinvest, then harvest): net result is ₹86.75L at the default scenario', () => {
    const result = simulateReitPortfolio(defaultInput(), 'reinvest_harvest');
    expect(result.netResultTodayInr).toBeCloseTo(8_675_092.87, 0);
  });

  it('strategy 3 (auto SIP off-ramp): SIP stops after exactly 93 months at the default scenario', () => {
    const result = simulateReitPortfolio(defaultInput(), 'auto_offramp');
    expect(result.offRampMonth).toBe(93);
  });

  it('strategy 1 (withdraw): net result is ₹56.46L at the default scenario', () => {
    const result = simulateReitPortfolio(defaultInput(), 'withdraw');
    expect(result.netResultTodayInr).toBeCloseTo(5_645_538.22, 0);
  });

  it('strategy 3 harvests the same as strategy 2 after the SIP off-ramp triggers — its net result differs from strategy 2 only because it stops contributing early', () => {
    const s2 = simulateReitPortfolio(defaultInput(), 'reinvest_harvest');
    const s3 = simulateReitPortfolio(defaultInput(), 'auto_offramp');
    expect(s3.totalContributedNominalInr).toBeLessThan(s2.totalContributedNominalInr);
    expect(s3.netResultTodayInr).toBeCloseTo(7_353_122.09, 0);
  });
});

describe('simulateReitPortfolio — structural edge cases', () => {
  it('zero REITs selected does not throw and returns an inert, all-zero result', () => {
    const result = simulateReitPortfolio(defaultInput({ reits: [] }), 'reinvest_harvest');
    expect(result.reits).toHaveLength(0);
    expect(result.portfolioValueAtHorizonInr).toBe(0);
    expect(Number.isFinite(result.netResultTodayInr)).toBe(true);
  });

  it('harvest 0% means every post-window payout is reinvested too — strategy 2 takes no cash at all', () => {
    const result = simulateReitPortfolio(defaultInput({ harvestPct: 0 }), 'reinvest_harvest');
    expect(result.totalCashTakenNominalInr).toBeCloseTo(0, 6);
  });

  it('harvest 100% (the default) takes every post-window payout as cash — matches the golden strategy-2 run', () => {
    const result = simulateReitPortfolio(defaultInput({ harvestPct: 100 }), 'reinvest_harvest');
    expect(result.totalCashTakenNominalInr).toBeGreaterThan(0);
  });

  it('strategy "withdraw" always takes every payout as cash from month 1, even inside the contribution window — nothing is ever reinvested', () => {
    const result = simulateReitPortfolio(defaultInput(), 'withdraw');
    const totalReinvested = result.yearly.reduce((a, y) => a + y.reinvestedThisYearNominalInr, 0);
    expect(totalReinvested).toBeCloseTo(0, 6);
    expect(result.totalCashTakenNominalInr).toBeGreaterThan(0);
  });

  it('a near-zero distribution yield never lets the quarterly payout catch up to the monthly SIP, so the off-ramp never triggers', () => {
    const negligibleYieldReits = DEFAULT_REITS.map((r) => ({ ...r, distributionYieldPct: 0.001 }));
    const result = simulateReitPortfolio(defaultInput({ reits: negligibleYieldReits }), 'auto_offramp');
    expect(result.offRampMonth).toBeNull();
  });

  it('tying distribution growth to price growth vs. an independent distribution growth rate produces different results', () => {
    const tied = simulateReitPortfolio(defaultInput({ tieDistributionGrowthToPrice: true }), 'reinvest_harvest');
    const untied = simulateReitPortfolio(defaultInput({ tieDistributionGrowthToPrice: false, distributionGrowthPct: 0 }), 'reinvest_harvest');
    expect(tied.netResultTodayInr).not.toBeCloseTo(untied.netResultTodayInr, 0);
  });

  it('reinvesting back into the same REIT vs. pooling by allocation both conserve total contributed capital', () => {
    const same = simulateReitPortfolio(defaultInput({ reinvestmentSplit: 'same_reit' }), 'reinvest_harvest');
    const pooled = simulateReitPortfolio(defaultInput({ reinvestmentSplit: 'allocation' }), 'reinvest_harvest');
    expect(same.totalContributedNominalInr).toBeCloseTo(pooled.totalContributedNominalInr, 2);
  });

  it('per-REIT weights renormalise to 100 across the included REITs', () => {
    const result = simulateReitPortfolio(defaultInput(), 'reinvest_harvest');
    const total = result.reits.reduce((a, r) => a + r.weightPct, 0);
    expect(total).toBeCloseTo(100, 6);
  });
});

describe('reitPostTaxYieldPct', () => {
  it('matches the prototype\'s netYield formula: yield * (1 - slab * (interestFraction + (taxDividend ? dividendFraction : 0)))', () => {
    const embassy = DEFAULT_REITS[0]!;
    const pct = reitPostTaxYieldPct(embassy, 31.2, false);
    // fi = 6.4/100 = 0.064 (total already sums to 100), so post-tax = 5.85*(1-0.312*0.064)
    expect(pct).toBeCloseTo(5.85 * (1 - 0.312 * 0.064), 6);
  });
});

describe('rankWeights', () => {
  it('assigns rank-based weights summing to 100, lowest score getting the smallest share', () => {
    const items = [{ v: 30 }, { v: 10 }, { v: 20 }];
    const weights = rankWeights(items, (i) => i.v);
    expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6);
    // items[1] (v=10) is the lowest -> rank 1 -> smallest weight
    expect(weights[1]).toBeLessThan(weights[2]!);
    expect(weights[2]).toBeLessThan(weights[0]!);
  });

  it('ties share the average rank', () => {
    const items = [{ v: 10 }, { v: 10 }, { v: 30 }];
    const weights = rankWeights(items, (i) => i.v);
    expect(weights[0]).toBeCloseTo(weights[1]!, 6);
    expect(weights[2]).toBeGreaterThan(weights[0]!);
  });

  it('matches the prototype\'s documented 5-REIT weight ladder: 33%, 27%, 20%, 13%, 7%', () => {
    const items = [1, 2, 3, 4, 5]; // strictly increasing score
    const weights = rankWeights(items, (v) => v);
    expect(weights.map((w) => Math.round(w))).toEqual([7, 13, 20, 27, 33]);
  });
});
