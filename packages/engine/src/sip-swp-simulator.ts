import type { CapitalGainsRules } from '@fincalc/data';

import { debtFundGainsTax, equityGainsTax, otherAssetGainsTax } from './tax/capital-gains';
import { xirrFromMonthlyCashflows } from './xirr';

/**
 * The SIP & SWP planner's monthly, FIFO-lot simulator — ported from a
 * hand-built single-file prototype (sip-swp-planner.html, saved as the
 * project doc `sip-swp-planner.html`) that the user built and verified
 * separately, treated as the spec, not code to copy. Golden tests
 * (sip-swp-simulator.test.ts) check this port against numbers produced by
 * running the prototype's own embedded JS.
 *
 * Deliberately NOT built on `positions/sip.ts`'s `sipPosition()`/
 * `lumpsumPosition()`. Those are value-based (one aggregate NAV balance via
 * `compoundContributions()`, no lots, no withdrawals) — this simulator needs
 * per-lot FIFO cost basis (so a sale's age and therefore its tax bucket
 * depends on *which* rupees are being sold), a glide path that rebalances
 * between holdings, four different withdrawal modes, one-off withdrawal
 * events, and a year-end tax settlement that can force an extra sale. None
 * of that is expressible as a pure function of month, which is what
 * `sipPosition()`'s shape requires — the same architectural reason
 * `reit-portfolio-simulator.ts` didn't reuse `reitPosition()` either (see
 * that file's own module doc comment).
 *
 * Tax composition: the prototype's own `taxOf(R)` nets five realised-gain
 * buckets a year (equity long/short-term, "other" long/short-term, debt)
 * and prices them with a hand-written formula. Rather than re-deriving that
 * formula, each bucket is priced through the engine's own per-lot tax
 * functions (`equityGainsTax`, `otherAssetGainsTax`, `debtFundGainsTax`),
 * forcing the long-term/short-term branch with `holdingMonths` the same way
 * `reit-portfolio-simulator.ts` already does — `holdingMonths` at or above
 * the rules' own LTCG threshold forces the LTCG branch, `holdingMonths: 0`
 * forces the STCG/slab branch. Debt is always priced with
 * `acquiredOnOrAfterSlabTaxationDate: true`: a simulation starting today can
 * never hold a pre-April-2023 "grandfathered" debt-fund unit, so the
 * always-slab branch is the only one ever reached — `debtFunds.slabTaxationAppliesFrom`/
 * `grandfatheredHoldingPeriodMonthsForLtcg`/`grandfatheredLtcgRate` are
 * supplied to satisfy the type only. Cess is applied once, to the sum of
 * the three flat-rate buckets (equity LT/ST, other LT) — never to the
 * slab-taxed amount (other ST + debt), matching the prototype's own
 * `(1+cess)` placement and this codebase's established convention that a
 * user-supplied slab rate already includes cess. One behavioural
 * difference from the prototype: the engine's tax functions round each
 * bucket's taxable amount and tax to the nearest paisa before summing
 * (`capital-gains.ts`'s own `round2`), where the prototype sums raw
 * floating-point rupees — figures can differ by a few paise, not more.
 *
 * The ₹1.25 lakh equity LTCG exemption (`equityLtcgExemptionInr`) is shared
 * across all of a household's equity-like gains in a year — including any
 * REIT module gains realised the same year. This module takes it as a
 * plain input and applies it to this plan's equity gains only; it does not
 * know about, and cannot net against, gains realised elsewhere. That's a
 * deliberate scope decision (see the project's shared-tax-settings
 * caveat), not an oversight.
 *
 * Returns on money (XIRR) reuse the engine's real `xirr()` (via
 * `xirrFromMonthlyCashflows`, since every cashflow here already falls on a
 * monthly grid) rather than porting the prototype's own simpler
 * bisection-only `irr()`. Wrapped in try/catch, returning `null` on
 * failure — the same convention the flagship Comparator uses elsewhere in
 * this codebase.
 */

export type SipSwpHoldingType = 'equity' | 'debt' | 'other';
export type SipSwpWithdrawalMode = 'fixed' | 'percent_of_corpus' | 'spread' | 'lump_sum_at_start';
export type SipSwpSellFrom = 'proportional' | 'safest_first';
export type SipSwpScenario = 'bear' | 'base' | 'bull';
export type SipSwpYearPhase = 'build' | 'derisk' | 'withdraw' | 'both' | 'hold' | 'depleted';

export interface SipSwpHoldingInput {
  key: string;
  name: string;
  type: SipSwpHoldingType;
  /** Annual return before costs, % (e.g. 10.5) — a long-run assumption, not a forecast. */
  returnPct: number;
  /** Annual expense ratio, % (e.g. 0.2), deducted from the return above. */
  expenseRatioPct: number;
  /** Allocation weight, %; renormalised across every holding passed in (the caller is expected to only pass included/"on" holdings). */
  weightPct: number;
}

export interface SipSwpOneOffWithdrawal {
  /** Simulation year (1-indexed) this is taken at the start of, on top of any SWP that month. */
  year: number;
  /** Amount, in today's rupees — converted to nominal rupees at the point it's taken. */
  amountInr: number;
}

export interface SipSwpSimulatorInput {
  holdings: readonly SipSwpHoldingInput[];
  lumpsumInr: number;
  monthlySipInr: number;
  sipStepUpPctPerYear: number;
  /** Years the SIP is paid — clamped to [0, 50]. */
  sipWindowYears: number;
  /** Simulation year withdrawals start (1-indexed) — clamped to [1, horizonYears]. */
  withdrawalStartYear: number;
  /** Total simulation horizon, years — clamped to [1, 50]. */
  horizonYears: number;

  withdrawalMode: SipSwpWithdrawalMode;
  /** 'fixed' mode: monthly withdrawal, today's rupees, before tax. */
  fixedMonthlyWithdrawalInr: number;
  /** 'fixed' mode: if true, the withdrawal rises with inflation each year; otherwise rises at fixedWithdrawalGrowthPctPerYear. */
  tieFixedWithdrawalToInflation: boolean;
  fixedWithdrawalGrowthPctPerYear: number;
  /** 'percent_of_corpus' mode: % of the corpus taken per year, recomputed at the start of each year. */
  withdrawalRatePctOfCorpus: number;
  /** 'spread' mode: years over which the corpus is run down to zero. */
  spreadOverYears: number;
  sellFrom: SipSwpSellFrom;

  /** Up to a handful of planned one-off withdrawals, on top of the SWP. */
  oneOffWithdrawals: readonly SipSwpOneOffWithdrawal[];

  /** Shift the equity share toward targetEquitySharePct in the years before withdrawals start. Needs at least one non-equity holding to do anything. */
  glide: boolean;
  /** Years before withdrawalStartYear the glide runs over — clamped to [1, 15]. */
  glideYears: number;
  targetEquitySharePct: number;
  /** Rebalance to the target allocation once a year, even outside the glide window. Selling to rebalance realises gains and is taxed like any other sale. */
  rebalanceAnnually: boolean;

  scenario: SipSwpScenario;
  inflationPct: number;

  /** The household's flat slab rate, % — applied to debt-fund gains and "other"-category short-term gains. Expected to already include cess (e.g. 31.2 for 30% + 4%), matching this codebase's convention. */
  slabRatePct: number;
  /** Equity LTCG rate, %, for gains on units held over 12 months. */
  equityLtcgRatePct: number;
  /** Equity STCG rate, %, for gains on units held 12 months or less. */
  equityStcgRatePct: number;
  /** Annual equity LTCG exemption, rupees — shared across all of the household's equity-like gains, not just this plan's (see this module's doc comment). */
  equityLtcgExemptionInr: number;
  /** "Other" (hybrid, gold, international) LTCG rate, %, for gains on units held over 24 months. No separate short-term rate — short-term "other" gains are taxed at slabRatePct instead. */
  otherLtcgRatePct: number;
  /** Cess, %, added on top of the flat equity/other LTCG and equity STCG rates. Not applied to the slab-taxed amount, which already includes cess by convention. */
  capitalGainsCessPct: number;
}

export interface SipSwpYearRow {
  /** 1-indexed simulation year. */
  year: number;
  phase: SipSwpYearPhase;
  paidInThisYearNominalInr: number;
  paidInThisYearRealInr: number;
  paidInToDateNominalInr: number;
  paidInToDateRealInr: number;
  grossWithdrawalThisYearNominalInr: number;
  grossWithdrawalThisYearRealInr: number;
  /** The one-off-withdrawal portion of the gross withdrawal above. */
  oneOffWithdrawalThisYearNominalInr: number;
  oneOffWithdrawalThisYearRealInr: number;
  taxThisYearNominalInr: number;
  taxThisYearRealInr: number;
  /** The share of this year's tax attributable to gains realised by rebalancing/de-risking sales rather than withdrawals — a reference split, not an additional charge. */
  taxOnRebalancingThisYearNominalInr: number;
  taxOnRebalancingThisYearRealInr: number;
  netWithdrawalThisYearNominalInr: number;
  netWithdrawalThisYearRealInr: number;
  corpusAtYearStartNominalInr: number;
  corpusAtYearEndNominalInr: number;
  corpusAtYearEndRealInr: number;
  equityShareAtYearEndPct: number;
  /** Gross withdrawal ÷ corpus at year start, % — null when there was no corpus at year start or no withdrawal that year. */
  withdrawalRatePct: number | null;
}

export interface SipSwpHoldingResult {
  key: string;
  name: string;
  type: SipSwpHoldingType;
  /** Renormalised allocation weight, % (sums to 100 across every holding passed in). */
  weightPct: number;
  netReturnPct: number;
  /** Value at the moment withdrawals start (month S0) — 0 if withdrawals start at month 0. */
  valueAtWithdrawalStartInr: number;
  valueAtHorizonInr: number;
  /** Signed, cumulative realised gain across every lot sold — withdrawals, one-off events, rebalancing and de-risking alike. */
  gainsRealisedInr: number;
  /** Total rupees sold over the whole plan. */
  soldOverPlanInr: number;
}

export interface SipSwpSimulatorResult {
  horizonYears: number;
  sipWindowYears: number;
  withdrawalStartYear: number;
  /** (1 + inflation)^horizonYears — divide a nominal horizon-end figure by this to get today's rupees. */
  inflationDeflatorAtHorizon: number;
  yearly: readonly SipSwpYearRow[];
  holdings: readonly SipSwpHoldingResult[];

  corpusAtWithdrawalStartNominalInr: number;
  corpusAtWithdrawalStartRealInr: number;
  /** The first SWP redemption's gross proceeds — null if the SWP never actually triggered a sale (e.g. withdrawals start after the horizon). */
  firstWithdrawalGrossInr: number | null;

  corpusAtHorizonNominalInr: number;
  corpusAtHorizonRealInr: number;
  /** Hypothetical tax if the whole corpus were sold at the horizon — not actually deducted from corpusAtHorizonNominalInr. */
  exitCapitalGainsTaxInr: number;
  exitCapitalGainsTaxRealInr: number;

  totalContributedNominalInr: number;
  totalContributedRealInr: number;
  /** Net of tax and any one-off/SWP withdrawals — negative overall for a plan still in its SIP window. */
  totalCashTakenAfterTaxNominalInr: number;
  totalCashTakenAfterTaxRealInr: number;

  /** Peak corpus, today's rupees, and the simulation year it occurred in. */
  peakCorpusRealInr: number;
  peakCorpusYear: number;

  /** Month (0-indexed from simulation start) the corpus ran out — null if it never did, or the mode empties it by design ('spread'/'lump_sum_at_start'). */
  depletionMonth: number | null;

  /** The headline comparison metric: (corpus at horizon − hypothetical exit tax) ÷ inflation deflator, plus all cash already taken (today's ₹), minus all money put in (today's ₹). */
  netResultTodayInr: number;

  /** Monthly net cashflow series: SIPs/lumpsum negative, net withdrawals and the final (corpus − exit tax) positive. Already in the shape `xirrFromMonthlyCashflows` expects. */
  monthlyCashflows: readonly number[];
  /** Annualised XIRR on monthlyCashflows, % — null if no reliable solution was found (see xirr()'s own doc comment for why that can happen). */
  xirrPct: number | null;

  /** Whether the glide path actually ran (false if `input.glide` was true but there was no non-equity holding, or the portfolio was 100% or 0% equity). */
  glideApplied: boolean;
  startingEquitySharePct: number;
}

/**
 * Per-point return adjustment the bear/base/bull scenario applies to every holding's own
 * `returnPct`, by holding type — ported verbatim from the prototype's `SCEN` object. `export`ed
 * (rather than kept module-private, as it started) so the UI layer can show the same adjustment
 * figures in its scenario picker's own caption text and compute each holding's net-of-scenario
 * return for display, without duplicating these numbers a second time.
 */
export const SCENARIO_ADJUSTMENTS: Record<SipSwpScenario, Record<SipSwpHoldingType, number>> = {
  bear: { equity: -3, other: -1.5, debt: -1 },
  base: { equity: 0, other: 0, debt: 0 },
  bull: { equity: 2, other: 1, debt: 0.5 },
};

interface SipSwpLot {
  units: number;
  costPerUnit: number;
  month: number;
}

interface SimHolding {
  input: SipSwpHoldingInput;
  weight: number;
  netReturn: number;
  monthlyGrowthFactor: number;
  nav: number;
  lots: SipSwpLot[];
  /** FIFO pointer: lots before this index are fully sold. */
  lotPointer: number;
  gainsRealisedInr: number;
  takenInr: number;
  valueAtWithdrawalStartInr: number;
  valueAtHorizonInr: number;
}

interface RealisedGainBuckets {
  eqLT: number;
  eqST: number;
  othLT: number;
  othST: number;
  debt: number;
}

interface YearAccumulator {
  paidNominalInr: number;
  paidRealInr: number;
  grossNominalInr: number;
  grossRealInr: number;
  oneOffNominalInr: number;
  oneOffRealInr: number;
  taxNominalInr: number;
  taxRealInr: number;
  netNominalInr: number;
  netRealInr: number;
  real: RealisedGainBuckets;
  swpMonths: number;
  sipMonths: number;
  /** Positive realised gain from withdrawal-driven sales this year (floored at 0 per sale). */
  gainFromWithdrawals: number;
  /** Positive realised gain from rebalancing/de-risking sales this year (floored at 0 per sale). */
  gainFromRebalancing: number;
  taxOnRebalancingNominalInr: number;
  taxOnRebalancingRealInr: number;
  startNominalInr: number;
  endNominalInr: number;
  endRealInr: number;
  equityShareFraction: number;
  phase: SipSwpYearPhase | '';
  withdrawalRate: number;
  cumulativePaidNominalInr: number;
  cumulativePaidRealInr: number;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function newYearAccumulator(): YearAccumulator {
  return {
    paidNominalInr: 0,
    paidRealInr: 0,
    grossNominalInr: 0,
    grossRealInr: 0,
    oneOffNominalInr: 0,
    oneOffRealInr: 0,
    taxNominalInr: 0,
    taxRealInr: 0,
    netNominalInr: 0,
    netRealInr: 0,
    real: { eqLT: 0, eqST: 0, othLT: 0, othST: 0, debt: 0 },
    swpMonths: 0,
    sipMonths: 0,
    gainFromWithdrawals: 0,
    gainFromRebalancing: 0,
    taxOnRebalancingNominalInr: 0,
    taxOnRebalancingRealInr: 0,
    startNominalInr: 0,
    endNominalInr: 0,
    endRealInr: 0,
    equityShareFraction: 0,
    phase: '',
    withdrawalRate: 0,
    cumulativePaidNominalInr: 0,
    cumulativePaidRealInr: 0,
  };
}

function buildSimHoldings(input: SipSwpSimulatorInput): SimHolding[] {
  const adjustments = SCENARIO_ADJUSTMENTS[input.scenario];
  const holdings = input.holdings.map((h): SimHolding => {
    const netReturn = (h.returnPct + adjustments[h.type] - h.expenseRatioPct) / 100;
    return {
      input: h,
      weight: Math.max(0, h.weightPct),
      netReturn,
      monthlyGrowthFactor: Math.pow(1 + Math.max(-0.99, netReturn), 1 / 12),
      nav: 1,
      lots: [],
      lotPointer: 0,
      gainsRealisedInr: 0,
      takenInr: 0,
      valueAtWithdrawalStartInr: 0,
      valueAtHorizonInr: 0,
    };
  });
  const weightSum = holdings.reduce((a, h) => a + h.weight, 0);
  for (const h of holdings) h.weight = weightSum > 0 ? h.weight / weightSum : 1 / Math.max(1, holdings.length);
  return holdings;
}

function valueOf(h: SimHolding): number {
  let units = 0;
  for (let i = h.lotPointer; i < h.lots.length; i++) units += h.lots[i]!.units;
  return units * h.nav;
}

function totalValue(holdings: readonly SimHolding[]): number {
  return holdings.reduce((sum, h) => sum + valueOf(h), 0);
}

function safetyRank(type: SipSwpHoldingType): number {
  return type === 'debt' ? 0 : type === 'other' ? 1 : 2;
}

/**
 * Prices the five realised-gain buckets for a year (or the hypothetical
 * exit) through the engine's existing per-lot tax functions — see this
 * module's doc comment for the composition rules and the debt-fund
 * always-slab simplification.
 */
function taxOnRealisedGains(
  gains: RealisedGainBuckets,
  rules: { equity: CapitalGainsRules['equity']; otherAssets: CapitalGainsRules['otherAssets']; debtFunds: CapitalGainsRules['debtFunds'] },
  slabRate: number,
  cessRate: number,
): number {
  const eqLT = equityGainsTax({ gain: gains.eqLT, holdingMonths: rules.equity.holdingPeriodMonthsForLtcg }, rules.equity);
  const eqST = equityGainsTax({ gain: gains.eqST, holdingMonths: 0 }, rules.equity);
  const othLT = otherAssetGainsTax({ gain: gains.othLT, holdingMonths: rules.otherAssets.holdingPeriodMonthsForLtcg }, rules.otherAssets);
  const othST = otherAssetGainsTax({ gain: gains.othST, holdingMonths: 0 }, rules.otherAssets);
  const debt = debtFundGainsTax({ gain: gains.debt, holdingMonths: 0, acquiredOnOrAfterSlabTaxationDate: true }, rules.debtFunds);

  const flatTax = (eqLT.kind === 'flat' ? eqLT.tax : 0) + (eqST.kind === 'flat' ? eqST.tax : 0) + (othLT.kind === 'flat' ? othLT.tax : 0);
  const slabTaxableAmount = (othST.kind === 'slab' ? othST.amount : 0) + (debt.kind === 'slab' ? debt.amount : 0);
  return flatTax * (1 + cessRate) + slabTaxableAmount * slabRate;
}

/**
 * Simulates a SIP building a portfolio and (optionally) an SWP drawing it
 * down, month by month, with FIFO-lot tax accounting. See this module's
 * doc comment for the full design.
 *
 * `fixedMonthlyOverrideInr`, when given, replaces `fixedMonthlyWithdrawalInr`
 * for this call only — it has no effect unless `input.withdrawalMode` is
 * `'fixed'`. Used internally by `sipSwpSustainableMonthlyWithdrawal`'s
 * binary search; exposed because it's genuinely useful to any other caller
 * doing the same kind of search.
 */
export function simulateSipSwp(input: SipSwpSimulatorInput, fixedMonthlyOverrideInr?: number): SipSwpSimulatorResult {
  const Y = clampInt(input.horizonYears, 1, 50);
  const N = Y * 12;
  const W = clampInt(input.sipWindowYears, 0, Y);
  const WM = W * 12;
  const SS = clampInt(input.withdrawalStartYear, 1, Y);
  const S0 = (SS - 1) * 12;

  const inflationRate = input.inflationPct / 100;
  const slabRate = input.slabRatePct / 100;
  const cessRate = input.capitalGainsCessPct / 100;
  const stepUpRate = input.sipStepUpPctPerYear / 100;
  const lumpsum = Math.max(0, input.lumpsumInr);
  const sip = Math.max(0, input.monthlySipInr);

  const fixedWithdrawal = fixedMonthlyOverrideInr ?? Math.max(0, input.fixedMonthlyWithdrawalInr);
  const fixedGrowthRate = input.tieFixedWithdrawalToInflation ? inflationRate : input.fixedWithdrawalGrowthPctPerYear / 100;
  const withdrawalRateOfCorpus = input.withdrawalRatePctOfCorpus / 100;
  const spreadMonths = Math.max(1, Math.round(input.spreadOverYears)) * 12;

  const equityRules: CapitalGainsRules['equity'] = {
    actSections: {},
    holdingPeriodMonthsForLtcg: 12,
    ltcgRate: input.equityLtcgRatePct / 100,
    ltcgExemptionPerYear: input.equityLtcgExemptionInr,
    stcgRate: input.equityStcgRatePct / 100,
  };
  const otherAssetsRules: CapitalGainsRules['otherAssets'] = {
    holdingPeriodMonthsForLtcg: 24,
    ltcgRate: input.otherLtcgRatePct / 100,
    stcgTaxedAtSlabRate: true,
  };
  // Debt gains here are always priced via the always-slab branch (acquiredOnOrAfterSlabTaxationDate:
  // true, below) — a simulation starting today can never hold a pre-April-2023 "grandfathered" unit.
  // These two fields exist only to satisfy DebtFundGainsRules' shape and are never actually read.
  const debtFundsRules: CapitalGainsRules['debtFunds'] = {
    slabTaxationAppliesFrom: '2023-04-01',
    specifiedFundDebtShareThreshold: 0.65,
    grandfatheredHoldingPeriodMonthsForLtcg: 24,
    grandfatheredLtcgRate: 0.125,
  };
  const rules = { equity: equityRules, otherAssets: otherAssetsRules, debtFunds: debtFundsRules };

  const holdings = buildSimHoldings(input);
  const E0 = holdings.reduce((a, h) => a + (h.input.type === 'equity' ? h.weight : 0), 0);
  const glide = input.glide && E0 > 0 && E0 < 1;
  const glideYears = clampInt(input.glideYears, 1, 15);
  const glideStartMonth = Math.max(0, S0 - glideYears * 12);
  const targetEquityShare = Math.max(0, Math.min(100, input.targetEquitySharePct)) / 100;

  function equityTargetAt(t: number): number {
    if (!glide || t < glideStartMonth) return E0;
    const f = Math.min(1, (t - glideStartMonth) / (glideYears * 12));
    return E0 + (targetEquityShare - E0) * f;
  }
  function targetWeightsAt(t: number): number[] {
    if (!glide) return holdings.map((h) => h.weight);
    const E = equityTargetAt(t);
    return holdings.map((h) => (h.input.type === 'equity' ? (h.weight * E) / E0 : (h.weight * (1 - E)) / (1 - E0)));
  }

  const years: YearAccumulator[] = [];
  for (let k = 0; k <= Y; k++) years.push(newYearAccumulator());

  function buy(h: SimHolding, amount: number, month: number): void {
    if (amount <= 0) return;
    h.lots.push({ units: amount / h.nav, costPerUnit: h.nav, month });
  }

  function sellFromHolding(h: SimHolding, amount: number, month: number, yearIndex: number, isRebalance: boolean): number {
    let need = amount / h.nav;
    let proceeds = 0;
    const yr = years[yearIndex]!;
    while (need > 1e-12 && h.lotPointer < h.lots.length) {
      const lot = h.lots[h.lotPointer]!;
      const qty = Math.min(lot.units, need);
      const gain = qty * (h.nav - lot.costPerUnit);
      const age = month - lot.month;
      if (h.input.type === 'equity') {
        if (age > 12) yr.real.eqLT += gain;
        else yr.real.eqST += gain;
      } else if (h.input.type === 'other') {
        if (age > 24) yr.real.othLT += gain;
        else yr.real.othST += gain;
      } else {
        yr.real.debt += gain;
      }
      if (isRebalance) yr.gainFromRebalancing += Math.max(gain, 0);
      else yr.gainFromWithdrawals += Math.max(gain, 0);
      h.gainsRealisedInr += gain;
      lot.units -= qty;
      need -= qty;
      proceeds += qty * h.nav;
      if (lot.units <= 1e-12) h.lotPointer++;
    }
    h.takenInr += proceeds;
    return proceeds;
  }

  function redeem(amount: number, month: number, yearIndex: number): number {
    const tot = totalValue(holdings);
    if (tot <= 0 || amount <= 0) return 0;
    const clamped = Math.min(amount, tot);
    let proceeds = 0;
    if (input.sellFrom === 'safest_first') {
      const order = [...holdings].sort((a, b) => safetyRank(a.input.type) - safetyRank(b.input.type));
      let left = clamped;
      for (const h of order) {
        if (left <= 0) break;
        const v = valueOf(h);
        const take = Math.min(v, left);
        proceeds += sellFromHolding(h, take, month, yearIndex, false);
        left -= take;
      }
    } else {
      for (const h of holdings) {
        const v = valueOf(h);
        proceeds += sellFromHolding(h, (clamped * v) / tot, month, yearIndex, false);
      }
    }
    return proceeds;
  }

  function taxOf(gains: RealisedGainBuckets): number {
    return taxOnRealisedGains(gains, rules, slabRate, cessRate);
  }

  let contributedNominal = 0;
  let contributedReal = 0;
  let cashTakenNominal = 0;
  let cashTakenReal = 0;
  const monthlyCashflows: number[] = new Array(N + 1).fill(0);
  let percentOfCorpusMonthlyAmount = 0;
  let depletionMonth: number | null = null;
  let peakCorpusReal = 0;
  let peakCorpusYear = 0;
  let corpusAtWithdrawalStart: number | null = null;
  let firstWithdrawalGross: number | null = null;

  for (let t = 0; t <= N; t++) {
    const deflator = Math.pow(1 + inflationRate, t / 12);

    if (t % 12 === 0 && t > 0) {
      const justEndedYear = t / 12;
      const yr = years[justEndedYear]!;
      const value = totalValue(holdings);
      yr.endNominalInr = value;
      yr.endRealInr = value / deflator;
      yr.equityShareFraction = value > 0 ? holdings.reduce((a, h) => a + (h.input.type === 'equity' ? valueOf(h) : 0), 0) / value : 0;
      if (value / deflator > peakCorpusReal) {
        peakCorpusReal = value / deflator;
        peakCorpusYear = justEndedYear;
      }

      const tax = taxOf(yr.real);
      yr.taxNominalInr = tax;
      yr.taxRealInr = tax / deflator;
      const gainSum = yr.gainFromWithdrawals + yr.gainFromRebalancing;
      yr.taxOnRebalancingNominalInr = gainSum > 0 ? (tax * yr.gainFromRebalancing) / gainSum : 0;
      yr.taxOnRebalancingRealInr = yr.taxOnRebalancingNominalInr / deflator;

      monthlyCashflows[t]! -= tax;
      cashTakenNominal -= tax;
      cashTakenReal -= tax / deflator;

      yr.netNominalInr = yr.grossNominalInr - tax;
      yr.netRealInr = yr.grossRealInr - tax / deflator;

      if (tax > yr.grossNominalInr && t < N) {
        const shortfall = tax - yr.grossNominalInr;
        const proceeds = redeem(shortfall, t, justEndedYear + 1);
        monthlyCashflows[t]! += proceeds;
        cashTakenNominal += proceeds;
        cashTakenReal += proceeds / deflator;
      }
    }

    if (t === N) break;

    const currentYear = Math.floor(t / 12) + 1;
    const yr = years[currentYear]!;
    if (t % 12 === 0) yr.startNominalInr = totalValue(holdings);
    if (t === S0) {
      corpusAtWithdrawalStart = totalValue(holdings);
      for (const h of holdings) h.valueAtWithdrawalStartInr = valueOf(h);
    }

    if (t % 12 === 0 && t > 0 && (input.rebalanceAnnually || (glide && t >= glideStartMonth && t <= S0))) {
      const tw = targetWeightsAt(t);
      const tot = totalValue(holdings);
      if (tot > 0) {
        let cash = 0;
        holdings.forEach((h, i) => {
          const over = valueOf(h) - tw[i]! * tot;
          if (over > 1) cash += sellFromHolding(h, over, t, currentYear, true);
        });
        const under = holdings.map((h, i) => Math.max(0, tw[i]! * tot - valueOf(h)));
        const underSum = under.reduce((a, b) => a + b, 0);
        holdings.forEach((h, i) => {
          if (underSum > 0) buy(h, (cash * under[i]!) / underSum, t);
        });
      }
    }

    // contributions
    const own = (t < WM ? sip * Math.pow(1 + stepUpRate, Math.floor(t / 12)) : 0) + (t === 0 ? lumpsum : 0);
    if (own > 0) {
      const tw2 = targetWeightsAt(t);
      holdings.forEach((h, i) => buy(h, own * tw2[i]!, t));
      contributedNominal += own;
      contributedReal += own / deflator;
      yr.paidNominalInr += own;
      yr.paidRealInr += own / deflator;
      monthlyCashflows[t]! -= own;
      if (t < WM) yr.sipMonths++;
    }

    // one-off withdrawals
    for (const event of input.oneOffWithdrawals) {
      const eventYear = Math.round(event.year);
      if (eventYear < 1 || eventYear > Y || (eventYear - 1) * 12 !== t) continue;
      const proceeds = redeem(Math.max(0, event.amountInr) * deflator, t, currentYear);
      yr.oneOffNominalInr += proceeds;
      yr.oneOffRealInr += proceeds / deflator;
      yr.grossNominalInr += proceeds;
      yr.grossRealInr += proceeds / deflator;
      monthlyCashflows[t]! += proceeds;
      cashTakenNominal += proceeds;
      cashTakenReal += proceeds / deflator;
    }

    // SWP
    if (t >= S0 && depletionMonth === null) {
      const tot = totalValue(holdings);
      let gross = 0;
      if (input.withdrawalMode === 'fixed') {
        gross = fixedWithdrawal * Math.pow(1 + inflationRate, S0 / 12) * Math.pow(1 + fixedGrowthRate, Math.floor((t - S0) / 12));
      } else if (input.withdrawalMode === 'percent_of_corpus') {
        if ((t - S0) % 12 === 0) percentOfCorpusMonthlyAmount = (tot * withdrawalRateOfCorpus) / 12;
        gross = percentOfCorpusMonthlyAmount;
      } else if (input.withdrawalMode === 'spread') {
        const monthsRemaining = S0 + spreadMonths - t;
        gross = monthsRemaining > 0 ? tot / monthsRemaining : 0;
      } else if (input.withdrawalMode === 'lump_sum_at_start') {
        gross = t === S0 ? tot : 0;
      }
      if (gross > 0) {
        const proceeds = redeem(gross, t, currentYear);
        if (firstWithdrawalGross === null) firstWithdrawalGross = proceeds;
        yr.grossNominalInr += proceeds;
        yr.grossRealInr += proceeds / deflator;
        yr.swpMonths++;
        monthlyCashflows[t]! += proceeds;
        cashTakenNominal += proceeds;
        cashTakenReal += proceeds / deflator;
      }
      if (totalValue(holdings) < 1 && t < N - 1 && input.withdrawalMode !== 'lump_sum_at_start' && input.withdrawalMode !== 'spread') {
        depletionMonth = t;
      }
    }

    // growth
    for (const h of holdings) h.nav *= h.monthlyGrowthFactor;
  }

  // exit valuation: hypothetical "sell everything now" at t===N, unsold lots only, state unmutated
  const finalValue = totalValue(holdings);
  const horizonDeflator = Math.pow(1 + inflationRate, Y);
  const exitGains: RealisedGainBuckets = { eqLT: 0, eqST: 0, othLT: 0, othST: 0, debt: 0 };
  for (const h of holdings) {
    for (let i = h.lotPointer; i < h.lots.length; i++) {
      const lot = h.lots[i]!;
      const gain = lot.units * (h.nav - lot.costPerUnit);
      const age = N - lot.month;
      if (h.input.type === 'equity') {
        if (age > 12) exitGains.eqLT += gain;
        else exitGains.eqST += gain;
      } else if (h.input.type === 'other') {
        if (age > 24) exitGains.othLT += gain;
        else exitGains.othST += gain;
      } else {
        exitGains.debt += gain;
      }
    }
    h.valueAtHorizonInr = valueOf(h);
  }
  const exitTax = taxOf(exitGains);
  monthlyCashflows[N] = monthlyCashflows[N]! + (finalValue - exitTax);

  // per-year phase + withdrawal rate
  for (let k = 1; k <= Y; k++) {
    const yr = years[k]!;
    const monthStart = (k - 1) * 12;
    const depleted = depletionMonth !== null && monthStart > depletionMonth;
    const sipOn = yr.sipMonths > 0;
    const swpOn = yr.swpMonths > 0;
    const deRisking = glide && monthStart + 11 >= glideStartMonth && monthStart < S0;
    yr.phase = depleted ? 'depleted' : sipOn && swpOn ? 'both' : sipOn ? (deRisking ? 'derisk' : 'build') : swpOn ? 'withdraw' : deRisking ? 'derisk' : 'hold';
    yr.withdrawalRate = yr.startNominalInr > 0 ? yr.grossNominalInr / yr.startNominalInr : 0;
  }
  let cumPaidNominal = 0;
  let cumPaidReal = 0;
  for (let k = 1; k <= Y; k++) {
    const yr = years[k]!;
    cumPaidNominal += yr.paidNominalInr;
    cumPaidReal += yr.paidRealInr;
    yr.cumulativePaidNominalInr = cumPaidNominal;
    yr.cumulativePaidRealInr = cumPaidReal;
  }

  const yearly: SipSwpYearRow[] = [];
  for (let k = 1; k <= Y; k++) {
    const yr = years[k]!;
    yearly.push({
      year: k,
      phase: yr.phase as SipSwpYearPhase,
      paidInThisYearNominalInr: yr.paidNominalInr,
      paidInThisYearRealInr: yr.paidRealInr,
      paidInToDateNominalInr: yr.cumulativePaidNominalInr,
      paidInToDateRealInr: yr.cumulativePaidRealInr,
      grossWithdrawalThisYearNominalInr: yr.grossNominalInr,
      grossWithdrawalThisYearRealInr: yr.grossRealInr,
      oneOffWithdrawalThisYearNominalInr: yr.oneOffNominalInr,
      oneOffWithdrawalThisYearRealInr: yr.oneOffRealInr,
      taxThisYearNominalInr: yr.taxNominalInr,
      taxThisYearRealInr: yr.taxRealInr,
      taxOnRebalancingThisYearNominalInr: yr.taxOnRebalancingNominalInr,
      taxOnRebalancingThisYearRealInr: yr.taxOnRebalancingRealInr,
      netWithdrawalThisYearNominalInr: yr.netNominalInr,
      netWithdrawalThisYearRealInr: yr.netRealInr,
      corpusAtYearStartNominalInr: yr.startNominalInr,
      corpusAtYearEndNominalInr: yr.endNominalInr,
      corpusAtYearEndRealInr: yr.endRealInr,
      equityShareAtYearEndPct: yr.equityShareFraction * 100,
      withdrawalRatePct: yr.startNominalInr > 0 && yr.grossNominalInr > 0 ? yr.withdrawalRate * 100 : null,
    });
  }

  const holdingResults: SipSwpHoldingResult[] = holdings.map((h) => ({
    key: h.input.key,
    name: h.input.name,
    type: h.input.type,
    weightPct: h.weight * 100,
    netReturnPct: h.netReturn * 100,
    valueAtWithdrawalStartInr: h.valueAtWithdrawalStartInr,
    valueAtHorizonInr: h.valueAtHorizonInr,
    gainsRealisedInr: h.gainsRealisedInr,
    soldOverPlanInr: h.takenInr,
  }));

  let xirrPct: number | null;
  try {
    xirrPct = xirrFromMonthlyCashflows(monthlyCashflows) * 100;
  } catch {
    xirrPct = null;
  }

  const corpusAtWithdrawalStartNominal = corpusAtWithdrawalStart ?? 0;
  const corpusAtWithdrawalStartReal = corpusAtWithdrawalStart !== null ? corpusAtWithdrawalStart / Math.pow(1 + inflationRate, S0 / 12) : 0;

  return {
    horizonYears: Y,
    sipWindowYears: W,
    withdrawalStartYear: SS,
    inflationDeflatorAtHorizon: horizonDeflator,
    yearly,
    holdings: holdingResults,
    corpusAtWithdrawalStartNominalInr: corpusAtWithdrawalStartNominal,
    corpusAtWithdrawalStartRealInr: corpusAtWithdrawalStartReal,
    firstWithdrawalGrossInr: firstWithdrawalGross,
    corpusAtHorizonNominalInr: finalValue,
    corpusAtHorizonRealInr: finalValue / horizonDeflator,
    exitCapitalGainsTaxInr: exitTax,
    exitCapitalGainsTaxRealInr: exitTax / horizonDeflator,
    totalContributedNominalInr: contributedNominal,
    totalContributedRealInr: contributedReal,
    totalCashTakenAfterTaxNominalInr: cashTakenNominal,
    totalCashTakenAfterTaxRealInr: cashTakenReal,
    peakCorpusRealInr: peakCorpusReal,
    peakCorpusYear,
    depletionMonth,
    netResultTodayInr: (finalValue - exitTax) / horizonDeflator + cashTakenReal - contributedReal,
    monthlyCashflows,
    xirrPct,
    glideApplied: glide,
    startingEquitySharePct: E0 * 100,
  };
}

/**
 * The largest fixed monthly withdrawal (today's money, following the
 * input's own yearly-increase setting) that doesn't deplete the corpus
 * before the horizon — binary search, same bounds and iteration counts as
 * the prototype's own `sustainable()`: doubles the upper bound up to 20
 * times looking for a depleting value, then 26 bisection iterations.
 * Forces `withdrawalMode: 'fixed'` but otherwise keeps every other setting
 * (including one-off events) intact. Returns `null` when
 * `withdrawalStartYear` is already past `horizonYears`.
 */
export function sipSwpSustainableMonthlyWithdrawal(input: SipSwpSimulatorInput): number | null {
  if (input.withdrawalStartYear > input.horizonYears) return null;
  const forcedFixedInput: SipSwpSimulatorInput = { ...input, withdrawalMode: 'fixed' };

  let lo = 0;
  let hi = 1e5;
  for (let j = 0; j < 20 && simulateSipSwp(forcedFixedInput, hi).depletionMonth === null; j++) hi *= 2;
  for (let i = 0; i < 26; i++) {
    const mid = (lo + hi) / 2;
    const result = simulateSipSwp(forcedFixedInput, mid);
    if (result.depletionMonth === null && result.corpusAtHorizonNominalInr > 0) lo = mid;
    else hi = mid;
  }
  return lo;
}
