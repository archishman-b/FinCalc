import { getReitDistributionRules } from '@fincalc/data';
import { describe, expect, it } from 'vitest';

import { reitPosition } from './reit';
import { constantMarketContext, variableMarketContext } from './test-fixtures';

const fy2627 = getReitDistributionRules('2026-27');
const fy2526 = getReitDistributionRules('2025-26');

const baseSplit = { interest: 0.5, dividend: 0.1, rental: 0.2, returnOfCapital: 0.2 };

describe('reitPosition', () => {
  it('emits a correct 300-month stream: gross cashIn, correctly-split taxable other_sources, NAV-driven assetValue', () => {
    const ctx = constantMarketContext({ 'reit.nav': 0.08, 'reit.yield': 0.06 });
    const position = reitPosition('embassy-reit', {
      initialInvestment: 2_000_000,
      navGrowthSeries: 'reit.nav',
      distributionYieldSeries: 'reit.yield',
      componentSplit: baseSplit,
      distributionRules: fy2627,
      liquidityTier: 1,
    });
    const rows = position.project(300, ctx);
    expect(rows).toHaveLength(300);

    // Month 1: the initial investment is the only cashOut, and it immediately starts earning
    // that month's distribution yield (a lumpsum deployed on day 1).
    expect(rows[0]!.cashOut).toBe(2_000_000);
    expect(rows[0]!.cashIn).toBeCloseTo(2_000_000 * (0.06 / 12), 2); // 10,000
    // FY2026-27: dividend is exempt regardless of the SPV election (TOLA 2026), so
    // taxable = interest (50%) + rental (20%) only, of the 10,000 gross distribution.
    expect(rows[0]!.taxable.other_sources).toBeCloseTo(10_000 * 0.7, 2); // 7,000

    for (const row of rows) {
      expect(row.liabilityBalance).toBe(0);
      expect(row.liquidityTier).toBe(1);
    }

    // NAV compounds for the whole horizon.
    expect(rows[299]!.assetValue).toBeGreaterThan(2_000_000);

    // The four components reported via distributions() sum exactly to the gross distribution
    // reported via project()'s cashIn.
    const dist = position.distributions(300, ctx);
    for (let i = 0; i < 300; i++) {
      const sum = round2(dist[i]!.interest + dist[i]!.dividend + dist[i]!.rental + dist[i]!.returnOfCapital);
      expect(sum).toBeCloseTo(rows[i]!.cashIn, 2);
    }
  });

  it('return-of-capital reduces cost basis until exhausted, then the excess becomes immediately taxable', () => {
    const ctx = constantMarketContext({ 'reit.nav': 0.05, 'reit.yield': 0.24 }); // a high yield to exhaust a small basis quickly
    const position = reitPosition('high-roc-reit', {
      initialInvestment: 100_000,
      navGrowthSeries: 'reit.nav',
      distributionYieldSeries: 'reit.yield',
      componentSplit: { interest: 0, dividend: 0, rental: 0, returnOfCapital: 1 }, // isolate ROC behaviour
      distributionRules: fy2627,
    });
    const dist = position.distributions(60, ctx);

    // Early months: return-of-capital is fully absorbed by cost basis, nothing taxed yet.
    expect(dist[0]!.returnOfCapitalExcessTaxed).toBe(0);
    expect(dist[0]!.costBasisRemaining).toBeLessThan(100_000);
    expect(dist[0]!.costBasisRemaining).toBeGreaterThan(0);

    // Cost basis is monotonically non-increasing and never goes negative.
    for (let i = 1; i < dist.length; i++) {
      expect(dist[i]!.costBasisRemaining).toBeLessThanOrEqual(dist[i - 1]!.costBasisRemaining);
      expect(dist[i]!.costBasisRemaining).toBeGreaterThanOrEqual(0);
    }

    // By month 60 at a 24%/yr yield against a ₹1L basis, the basis should be fully exhausted
    // and later months' return-of-capital taxed as it arrives.
    const lastRow = dist[dist.length - 1]!;
    expect(lastRow.costBasisRemaining).toBe(0);
    expect(lastRow.returnOfCapitalExcessTaxed).toBeGreaterThan(0);
    expect(lastRow.returnOfCapitalExcessTaxed).toBeCloseTo(lastRow.returnOfCapital, 2);

    // The full project() stream reflects this: once basis is exhausted, taxable.other_sources
    // catches up with the gross distribution (component split is 100% return-of-capital here).
    const rows = position.project(60, ctx);
    expect(rows[59]!.taxable.other_sources).toBeCloseTo(rows[59]!.cashIn, 2);
  });

  it('dividend taxability follows the SPV-election flag only for an FY where it still matters', () => {
    const ctx = constantMarketContext({ 'reit.nav': 0.05, 'reit.yield': 0.06 });
    const make = (fy: typeof fy2526, spvOptedIn: boolean) =>
      reitPosition('x', {
        initialInvestment: 1_000_000,
        navGrowthSeries: 'reit.nav',
        distributionYieldSeries: 'reit.yield',
        componentSplit: baseSplit,
        distributionRules: fy,
        spvOptedIntoConcessionalRegime: spvOptedIn,
      });

    const grossMonth1 = 1_000_000 * (0.06 / 12); // 5,000
    const dividendShare = grossMonth1 * 0.1; // 500
    const withoutDividend = round2(grossMonth1 * (0.5 + 0.2)); // interest + rental only

    // FY2025-26: dividend taxable only if the SPV opted into the concessional regime.
    const optedIn = make(fy2526, true).project(1, ctx)[0]!;
    expect(optedIn.taxable.other_sources).toBeCloseTo(withoutDividend + dividendShare, 2);

    const notOptedIn = make(fy2526, false).project(1, ctx)[0]!;
    expect(notOptedIn.taxable.other_sources).toBeCloseTo(withoutDividend, 2);

    // FY2026-27: exempt regardless of the flag (TOLA 2026).
    const fy2627OptedIn = make(fy2627, true).project(1, ctx)[0]!;
    expect(fy2627OptedIn.taxable.other_sources).toBeCloseTo(withoutDividend, 2);
  });

  it('NAV growth and distribution yield are independent series — a volatile NAV path does not perturb the yield calculation', () => {
    const ctx = variableMarketContext({
      'reit.nav': (month) => (month % 12 < 6 ? 0.15 : -0.1), // volatile, non-smooth price path
      'reit.yield': () => 0.06, // flat yield regardless of the price swings
    });
    const position = reitPosition('volatile-nav', {
      initialInvestment: 1_000_000,
      navGrowthSeries: 'reit.nav',
      distributionYieldSeries: 'reit.yield',
      componentSplit: baseSplit,
      distributionRules: fy2627,
    });
    const rows = position.project(24, ctx);

    // The distribution *yield rate* stays anchored to the flat yield series regardless of the
    // volatile NAV path — the rupee amount naturally scales with whatever the holding is worth
    // that month (exactly what "distribution yield on NAV" means), but the rate itself, backed
    // out as grossDistribution / holdingBase, is the undisturbed 0.5%/month every time. This is
    // what "two genuinely decoupled series" means, not that the rupee amounts stay flat.
    const dist = position.distributions(24, ctx);
    const holdingBase = (i: number) => (i === 0 ? 1_000_000 : rows[i - 1]!.assetValue);
    for (const i of [0, 6, 12, 18, 23]) {
      const impliedRate = dist[i]!.grossDistribution / holdingBase(i);
      expect(impliedRate).toBeCloseTo(0.06 / 12, 6);
    }
    // assetValue itself does reflect the volatile path: not simply monotonic.
    const monotonicIncreases = rows.slice(1).every((r, i) => r.assetValue > rows[i]!.assetValue);
    expect(monotonicIncreases).toBe(false);
  });

  it('rejects a component split that does not sum to 1', () => {
    expect(() =>
      reitPosition('bad', {
        initialInvestment: 100_000,
        navGrowthSeries: 'x',
        distributionYieldSeries: 'y',
        componentSplit: { interest: 0.5, dividend: 0.1, rental: 0.1, returnOfCapital: 0.1 },
        distributionRules: fy2627,
      }),
    ).toThrow(RangeError);
  });

  it('rejects a negative initialInvestment', () => {
    expect(() =>
      reitPosition('bad', {
        initialInvestment: -1,
        navGrowthSeries: 'x',
        distributionYieldSeries: 'y',
        componentSplit: baseSplit,
        distributionRules: fy2627,
      }),
    ).toThrow(RangeError);
  });
});

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
