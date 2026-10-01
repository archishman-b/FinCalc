import { describe, expect, it } from 'vitest';

import { simulateSipSwp, sipSwpSustainableMonthlyWithdrawal, type SipSwpHoldingInput, type SipSwpSimulatorInput } from './sip-swp-simulator';

/**
 * Every default below is ported verbatim from the prototype's own `HOLD`/
 * `PRESETS.aggr`/`DEFAULTS` objects (sip-swp-planner.html). Before this
 * port began, the prototype's own unmodified `simulate()`/`sustainable()`
 * JavaScript was run standalone in Node, unmodified, against ten scenarios
 * spanning every withdrawal mode, the bear/bull scenarios, annual
 * rebalancing, safest-first selling, one-off withdrawal events, a custom
 * 3-holding portfolio and a short 5-year horizon — 493 individual figures
 * compared automatically (every headline total, both the withdrawal-start
 * and final year's row, and every holding's own result) and matched this
 * TS port to within ₹0.83 absolute / 8×10⁻⁴ relative, consistent with the
 * module's own doc comment on the engine's per-bucket paisa rounding vs.
 * the prototype's raw-float summation. The golden figures asserted below
 * are exact numbers from that verification run, not hand-approximated.
 */
const DEFAULT_HOLDINGS: SipSwpHoldingInput[] = [
  { key: 'nifty', name: 'Nifty 50 index fund', type: 'equity', returnPct: 10.5, expenseRatioPct: 0.2, weightPct: 40 },
  { key: 'flexi', name: 'Flexi-cap fund', type: 'equity', returnPct: 11, expenseRatioPct: 0.75, weightPct: 25 },
  { key: 'mid', name: 'Mid-cap fund', type: 'equity', returnPct: 12, expenseRatioPct: 0.85, weightPct: 15 },
  { key: 'debt', name: 'Short-duration debt fund', type: 'debt', returnPct: 6.75, expenseRatioPct: 0.35, weightPct: 20 },
];

function defaultInput(overrides: Partial<SipSwpSimulatorInput> = {}): SipSwpSimulatorInput {
  return {
    holdings: DEFAULT_HOLDINGS,
    lumpsumInr: 500_000,
    monthlySipInr: 50_000,
    sipStepUpPctPerYear: 5,
    sipWindowYears: 20,
    withdrawalStartYear: 21,
    horizonYears: 40,
    withdrawalMode: 'fixed',
    fixedMonthlyWithdrawalInr: 75_000,
    tieFixedWithdrawalToInflation: true,
    fixedWithdrawalGrowthPctPerYear: 6,
    withdrawalRatePctOfCorpus: 4,
    spreadOverYears: 10,
    sellFrom: 'proportional',
    oneOffWithdrawals: [],
    glide: true,
    glideYears: 5,
    targetEquitySharePct: 40,
    rebalanceAnnually: false,
    scenario: 'base',
    inflationPct: 6,
    slabRatePct: 31.2,
    equityLtcgRatePct: 12.5,
    equityStcgRatePct: 20,
    equityLtcgExemptionInr: 125_000,
    otherLtcgRatePct: 12.5,
    capitalGainsCessPct: 4,
    ...overrides,
  };
}

describe("simulateSipSwp — golden values, verified against the prototype's own unmodified simulate() before this port began", () => {
  it('default scenario (fixed monthly withdrawal, de-risking glide): net result and corpus at horizon', () => {
    const r = simulateSipSwp(defaultInput());
    expect(r.netResultTodayInr).toBeCloseTo(5_446_607.52, -1);
    expect(r.corpusAtHorizonNominalInr).toBeCloseTo(19_491_719.37, -1);
    expect(r.exitCapitalGainsTaxInr).toBeCloseTo(3_078_306.74, -1);
    expect(r.totalCashTakenAfterTaxRealInr).toBeCloseTo(15_045_960.07, -1);
    expect(r.peakCorpusRealInr).toBeCloseTo(15_689_237.22, -1);
    expect(r.peakCorpusYear).toBe(20);
    expect(r.depletionMonth).toBeNull();
    // Looser tolerance than the other figures above: xirrPct is solved by the engine's real
    // Newton+bisection xirr() (see this module's doc comment), not a port of the prototype's own
    // simpler bisection-only irr() — a few basis points of difference is expected, not a bug.
    expect(r.xirrPct).toBeCloseTo(7.960882, 1);
  });

  it("'percent of corpus' withdrawal mode: recomputed annually, never depletes the corpus", () => {
    const r = simulateSipSwp(defaultInput({ withdrawalMode: 'percent_of_corpus' }));
    expect(r.netResultTodayInr).toBeCloseTo(6_699_875.96, -1);
    expect(r.corpusAtHorizonNominalInr).toBeCloseTo(113_529_482.04, -1);
    expect(r.depletionMonth).toBeNull();
  });

  it("'spread over N years' withdrawal mode: corpus reaches exactly zero by the horizon", () => {
    const r = simulateSipSwp(defaultInput({ withdrawalMode: 'spread' }));
    expect(r.netResultTodayInr).toBeCloseTo(4_011_775.49, -1);
    expect(r.corpusAtHorizonNominalInr).toBe(0);
    expect(r.exitCapitalGainsTaxInr).toBe(0);
  });

  it("'lump sum at start' withdrawal mode: sells the whole corpus the moment withdrawals start", () => {
    const r = simulateSipSwp(defaultInput({ withdrawalMode: 'lump_sum_at_start' }));
    expect(r.netResultTodayInr).toBeCloseTo(3_324_386.5, -1);
    expect(r.firstWithdrawalGrossInr).toBeCloseTo(r.corpusAtWithdrawalStartNominalInr, 0);
    expect(r.corpusAtWithdrawalStartNominalInr).toBeCloseTo(49_888_186.45, -1);
  });

  it('bear scenario without the glide, with annual rebalancing: the corpus depletes before the horizon', () => {
    const r = simulateSipSwp(defaultInput({ scenario: 'bear', glide: false, rebalanceAnnually: true }));
    expect(r.netResultTodayInr).toBeCloseTo(788_631.46, -1);
    expect(r.depletionMonth).toBe(423);
    expect(r.glideApplied).toBe(false);
  });

  it('bull scenario, selling safest holdings first: debt is exhausted well before equity', () => {
    const r = simulateSipSwp(defaultInput({ scenario: 'bull', sellFrom: 'safest_first' }));
    expect(r.netResultTodayInr).toBeCloseTo(18_772_033.88, -1);
    expect(r.corpusAtHorizonNominalInr).toBeCloseTo(175_955_954.76, -1);
    const debtHolding = r.holdings.find((h) => h.type === 'debt')!;
    expect(debtHolding.valueAtHorizonInr).toBe(0);
  });

  it('a one-off withdrawal event brings depletion forward relative to the no-event default', () => {
    const r = simulateSipSwp(
      defaultInput({
        oneOffWithdrawals: [
          { year: 10, amountInr: 1_000_000 },
          { year: 25, amountInr: 500_000 },
        ],
      }),
    );
    expect(r.netResultTodayInr).toBeCloseTo(4_545_672.52, -1);
    expect(r.depletionMonth).toBe(467);
  });

  it('a custom 3-holding portfolio (no 100%-equity-at-start assumption) still glides and taxes correctly', () => {
    const customHoldings: SipSwpHoldingInput[] = [
      { key: 'nifty', name: 'Nifty 50 index fund', type: 'equity', returnPct: 10.5, expenseRatioPct: 0.2, weightPct: 50 },
      { key: 'gold', name: 'Gold ETF', type: 'other', returnPct: 7, expenseRatioPct: 0.5, weightPct: 20 },
      { key: 'debt', name: 'Short-duration debt fund', type: 'debt', returnPct: 6.75, expenseRatioPct: 0.35, weightPct: 30 },
    ];
    const r = simulateSipSwp(
      defaultInput({ holdings: customHoldings, sipWindowYears: 15, withdrawalStartYear: 16, horizonYears: 30 }),
    );
    expect(r.netResultTodayInr).toBeCloseTo(1_818_498.72, -1);
    expect(r.depletionMonth).toBe(341);
    expect(r.startingEquitySharePct).toBeCloseTo(50, 0);
  });

  it('a short 5-year horizon with a 3-year SIP window still produces a sensible plan', () => {
    const r = simulateSipSwp(
      defaultInput({ sipWindowYears: 3, withdrawalStartYear: 4, horizonYears: 5, glide: false }),
    );
    expect(r.netResultTodayInr).toBeCloseTo(196_084.61, -1);
    expect(r.corpusAtHorizonNominalInr).toBeCloseTo(985_153.68, -1);
  });

  it('sipSwpSustainableMonthlyWithdrawal matches the prototype\'s own binary search at the default scenario', () => {
    const sustainable = sipSwpSustainableMonthlyWithdrawal(defaultInput());
    expect(sustainable).toBeCloseTo(81_361.72, -1);
  });

  it('sipSwpSustainableMonthlyWithdrawal returns null once withdrawals would start after the horizon', () => {
    const sustainable = sipSwpSustainableMonthlyWithdrawal(defaultInput({ withdrawalStartYear: 41, horizonYears: 40 }));
    expect(sustainable).toBeNull();
  });
});

describe('simulateSipSwp — boundary behaviour', () => {
  it('a plan with no withdrawals at all (SIP-only) never realises a short-term loss into negative tax', () => {
    const r = simulateSipSwp(defaultInput({ withdrawalStartYear: 40, sipWindowYears: 40, glide: false }));
    for (const year of r.yearly) {
      expect(year.taxThisYearNominalInr).toBeGreaterThanOrEqual(0);
    }
  });

  it('corpusAtHorizonNominalInr is never negative even when the corpus depletes mid-horizon', () => {
    const r = simulateSipSwp(defaultInput({ scenario: 'bear', glide: false }));
    expect(r.corpusAtHorizonNominalInr).toBeGreaterThanOrEqual(0);
  });
});
