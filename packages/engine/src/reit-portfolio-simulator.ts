import type { CapitalGainsRules } from '@fincalc/data';

import { reitGainsTax } from './tax/capital-gains';

/**
 * The REIT Portfolio Builder's multi-strategy, lot-tracked simulator —
 * ported from a hand-built single-file prototype (reit-simulator.html,
 * saved as the project doc `reit-simulator.html`) that the user built and
 * verified separately, treated as the spec, not code to copy.
 *
 * Deliberately NOT built on `positions/reit.ts`'s `reitPosition()`. That
 * function is value-based (a rupee NAV that grows via a growth series, one
 * aggregate cost-basis number, distributions computed monthly as a % of
 * current NAV) and is load-bearing for the flagship Comparator's Phase 4
 * golden tests (the founding scenario, the canonical-failure-case
 * regression). This simulator is unit-based (price per unit, units held,
 * lot-by-lot cost-per-unit) — every mechanic here (per-lot return-of-
 * capital erosion, lot-level long/short-term capital-gains split at exit,
 * brokerage-inflated cost per unit, reinvestment buying more units,
 * quarterly per-unit distribution-per-unit growth) needs that unit-based
 * shape and cannot be expressed as a rupee percentage of NAV. Strategy 3's
 * auto SIP off-ramp sharpens this further: next month's contribution has to
 * depend on what the *previous quarter actually paid out*, a stateful,
 * simulation-time decision — `reitPosition()`'s `monthlyContribution` is a
 * pure function of month, decided upfront, and can't express that. So
 * `reitPosition()` is left completely untouched; this module reuses only
 * the tax-*rate* layer that already matches the prototype exactly (see
 * below), not `reitPosition()`'s simulation loop.
 *
 * Confirmed alignment with the existing engine's REIT tax rules before
 * porting (packages/data/src/reit-distributions.ts, capital-gains.ts):
 * return-of-capital is untaxed on receipt, reduces cost basis, and the
 * excess once basis is exhausted is taxed as Other Sources at slab rate —
 * identical mechanism to this file's `rocU`/`excess` handling below.
 * Dividend is exempt from FY2026-27 regardless of the SPV's regime
 * election — identical to this simulator's `taxDividendComponent` default
 * of `false`. None of these 5 REITs carry a `rental` component (all 5 hold
 * their assets via SPV structures — see reit-portfolio-snapshot.ts's
 * module doc comment), so this simulator's 3-component split (interest/
 * dividend/return-of-capital) is not a narrowing of the engine's 4-
 * component `ReitComponentSplit`, just its rental fraction pinned at 0 for
 * every REIT this pack ships.
 *
 * `reitGainsTax()` (tax/capital-gains.ts) is reused directly for pricing
 * the netted long-term and short-term gain buckets at exit — it already
 * applies the right rate/exemption per bucket. It doesn't do the lot-by-
 * lot netting itself (it prices one already-netted {gain, holdingMonths}
 * bucket at a time), so that cross-lot netting — including the prototype's
 * short-term-losses-offset-long-term-gains-and-vice-versa rule — is ported
 * here in `nettedGains()`. `reitGainsTax()` also has no cess parameter
 * (the flagship Comparator's `exit.ts` adds cess/surcharge separately at
 * the household level); this module applies the user-supplied
 * `capitalGainsCessPct` itself, matching the prototype's own
 * `(1+cgcess/100)` multiplier exactly.
 */

export type ReitPortfolioStrategy = 'withdraw' | 'reinvest_harvest' | 'auto_offramp';

export type ReitReinvestmentSplit = 'allocation' | 'same_reit';

export interface ReitPortfolioSimulatorReitInput {
  id: string;
  name: string;
  /** Unit price at simulation start (month 0), rupees. */
  priceInr: number;
  /** Annualised distribution yield at month 0, as a percent (5.85 means 5.85%), not a decimal fraction. */
  distributionYieldPct: number;
  /** The three distribution components, as percents of the total; renormalised if they don't sum to 100 (matching the prototype's own tolerant behaviour, not a hard validation error). */
  interestPct: number;
  dividendPct: number;
  returnOfCapitalPct: number;
  /** Per-REIT unit-price growth override, %/yr. Omitted (or `null`) falls back to the simulation's global `unitPriceGrowthPct`. */
  growthOverridePct?: number | null;
  /** Reference-only trailing price CAGR since listing, %/yr — used only by `rankWeightsByPriceGrowth` when every included REIT shares the same model growth rate (the prototype's "tilt to price growth" preset). Not used by the simulation itself. */
  priceCagrSinceListingPct?: number | null;
  /** Allocation weight, %; renormalised across included REITs (equal split if every weight is 0 or the set is empty of positive weights). */
  weightPct: number;
}

export interface ReitPortfolioSimulatorInput {
  reits: readonly ReitPortfolioSimulatorReitInput[];
  lumpsumInr: number;
  monthlySipInr: number;
  sipStepUpPctPerYear: number;
  /** Brokerage/STT, % of each buy, deducted before computing units purchased (inflates effective cost-per-unit). */
  brokeragePct: number;
  /** Years the SIP is paid — clamped to [1, 40]. */
  contributionWindowYears: number;
  /** Total simulation horizon, years — clamped to [contributionWindowYears, 40]. */
  horizonYears: number;
  /** % of post-window payouts taken as cash in the 'reinvest_harvest'/'auto_offramp' strategies; the rest is reinvested. Ignored (treated as 0% harvest, i.e. always reinvest) during the contribution window, and ignored entirely for 'withdraw'. */
  harvestPct: number;
  /** Global annual unit-price growth, %/yr, used by any REIT without its own `growthOverridePct`. */
  unitPriceGrowthPct: number;
  /** If true, each REIT's distribution-per-unit grows at that REIT's own unit-price growth rate (keeps today's yield roughly constant over time). If false, every REIT's distribution-per-unit grows at `distributionGrowthPct` instead. */
  tieDistributionGrowthToPrice: boolean;
  /** Used only when `tieDistributionGrowthToPrice` is false. */
  distributionGrowthPct: number;
  inflationPct: number;
  /** The household's marginal rate on interest/return-of-capital-excess (and dividend, if `taxDividendComponent`), as a percent — e.g. 31.2 for 30% + 4% cess. */
  slabRatePct: number;
  /** FY2025-26: true if the SPV opted into the concessional regime (dividend taxable). FY2026-27: dividend is exempt regardless — leave false. */
  taxDividendComponent: boolean;
  ltcgRatePct: number;
  stcgRatePct: number;
  ltcgExemptionInr: number;
  capitalGainsCessPct: number;
  /** Where a reinvested payout goes: pooled and redistributed by allocation weight, or back into the same REIT that paid it. Reinvestment happens in the same quarter as the payout. */
  reinvestmentSplit: ReitReinvestmentSplit;
}

export interface ReitPortfolioYearRow {
  /** 1-indexed calendar year of the simulation (year 1 = months 1-12). */
  year: number;
  phase: 'contributing' | 'self_funding' | 'off_ramp' | 'harvesting' | 'holding';
  paidInThisYearNominalInr: number;
  paidInToDateNominalInr: number;
  paidInToDateRealInr: number;
  postTaxPayoutsThisYearNominalInr: number;
  postTaxPayoutsThisYearRealInr: number;
  reinvestedThisYearNominalInr: number;
  reinvestedThisYearRealInr: number;
  cashTakenThisYearNominalInr: number;
  cashTakenThisYearRealInr: number;
  taxOnPayoutsThisYearNominalInr: number;
  taxOnPayoutsThisYearRealInr: number;
  outOfPocketThisYearNominalInr: number;
  outOfPocketThisYearRealInr: number;
  valueNominalInr: number;
  valueRealInr: number;
  /** (value - exit capital-gains tax, both as of this year-end) ÷ inflation deflator to this year. */
  exitNetRealInr: number;
  /** The headline "net if sold" figure at this point: exitNetRealInr + cumulative cash taken (real) - cumulative contributed (real). */
  netIfSoldRealInr: number;
}

export interface ReitPortfolioReitResult {
  id: string;
  name: string;
  /** Renormalised allocation weight, % (sums to 100 across included REITs). */
  weightPct: number;
  /** Post-tax yield today, as a percent, computed at the simulation's starting tax settings — reference figure, not derived from the simulation path. */
  postTaxYieldTodayPct: number;
  valueAtHorizonInr: number;
  /** Final-year post-tax payout generated, monthly average, rupees (whether taken as cash or reinvested). */
  finalYearPostTaxPayoutPerMonthInr: number;
  taxPaidOnPayoutsInr: number;
}

export interface ReitPortfolioSimulationResult {
  strategy: ReitPortfolioStrategy;
  contributionWindowYears: number;
  horizonYears: number;
  /** (1 + inflation)^horizonYears — divide a nominal horizon-end figure by this to get today's rupees. */
  inflationDeflatorAtHorizon: number;
  reits: readonly ReitPortfolioReitResult[];
  yearly: readonly ReitPortfolioYearRow[];
  portfolioValueAtHorizonInr: number;
  exitCapitalGainsTaxInr: number;
  totalContributedNominalInr: number;
  totalContributedRealInr: number;
  totalTaxPaidOnPayoutsInr: number;
  totalCashTakenNominalInr: number;
  totalCashTakenRealInr: number;
  /** Final-year post-tax payout generated, monthly average, across all REITs, rupees. */
  finalYearPostTaxPayoutPerMonthInr: number;
  /** Final-year cash actually taken, monthly average, across all REITs, rupees. */
  finalYearCashTakenPerMonthInr: number;
  /** Month the auto off-ramp latched (strategy 'auto_offramp' only) — null if it never triggered within the contribution window, or for the other two strategies. */
  offRampMonth: number | null;
  /** The headline comparison metric: (portfolio value at horizon − exit capital-gains tax) ÷ inflation deflator, plus all cash already taken (real), minus all money put in (real) — in today's rupees. */
  netResultTodayInr: number;
}

interface SimReit {
  input: ReitPortfolioSimulatorReitInput;
  weight: number;
  priceAtStart: number;
  /** Initial annualised distribution-per-unit, rupees. */
  dpuAtStart: number;
  interestFraction: number;
  dividendFraction: number;
  returnOfCapitalFraction: number;
  priceGrowthRate: number;
  distributionGrowthRate: number;
  lots: { units: number; costPerUnit: number; month: number }[];
  taxPaidInr: number;
  /** Pending amount to reinvest back into this same REIT (reinvestmentSplit === 'same_reit' only), carried from a quarter's distribution to the next month's contribution. */
  pendingSameReitReinvestment: number;
  /** Year-indexed (1..horizonYears) cumulative post-tax payout generated, rupees. Index 0 unused. */
  yearlyNetPayout: number[];
  /** Year-indexed cumulative cash actually taken, rupees. Index 0 unused. */
  yearlyCashTaken: number[];
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function resolvedHorizon(input: ReitPortfolioSimulatorInput): { windowYears: number; horizonYears: number } {
  const windowYears = clampInt(input.contributionWindowYears, 1, 40);
  const horizonYears = clampInt(input.horizonYears, windowYears, 40);
  return { windowYears, horizonYears };
}

/** Post-tax yield %, today, for a single REIT at the given tax settings — `yield * (1 - slab * (interestFraction + (taxDividend ? dividendFraction : 0)))`. Reference-only figure (also used by the "tilt to net yield" allocation preset); not part of the month-by-month simulation. */
export function reitPostTaxYieldPct(reit: Pick<ReitPortfolioSimulatorReitInput, 'distributionYieldPct' | 'interestPct' | 'dividendPct' | 'returnOfCapitalPct'>, slabRatePct: number, taxDividendComponent: boolean): number {
  const total = reit.interestPct + reit.dividendPct + reit.returnOfCapitalPct || 1;
  const fi = reit.interestPct / total;
  const fd = reit.dividendPct / total;
  return reit.distributionYieldPct * (1 - (slabRatePct / 100) * (fi + (taxDividendComponent ? fd : 0)));
}

/**
 * Rank-based allocation weights (%, summing to 100): the REIT scoring
 * lowest on `score` gets rank 1 and the smallest weight, the one scoring
 * highest gets the largest. With N REITs, weights follow `rank / (N*(N+1)/2)
 * * 100` — e.g. 5 REITs get 7%/13%/20%/27%/33% low-to-high. Ties share the
 * average of the ranks they'd otherwise occupy. Matches the prototype's
 * `rankWeights` exactly (used for both the "tilt to net yield" and "tilt to
 * price growth" presets).
 */
export function rankWeights<T>(items: readonly T[], score: (item: T) => number): number[] {
  const n = items.length;
  const sorted = items.map((item, i) => ({ i, v: score(item) })).sort((a, b) => a.v - b.v);
  const rank = new Array<number>(n);
  let j = 0;
  while (j < n) {
    let k = j;
    while (k + 1 < n && Math.abs(sorted[k + 1]!.v - sorted[j]!.v) < 1e-9) k++;
    const avg = (j + k) / 2 + 1;
    for (let m = j; m <= k; m++) rank[sorted[m]!.i] = avg;
    j = k + 1;
  }
  const total = (n * (n + 1)) / 2;
  return rank.map((r) => (r / total) * 100);
}

function buildSimReits(input: ReitPortfolioSimulatorInput): SimReit[] {
  const globalPriceGrowth = input.unitPriceGrowthPct / 100;
  const globalDistributionGrowth = input.distributionGrowthPct / 100;
  const reits = input.reits.map((r): SimReit => {
    const total = r.interestPct + r.dividendPct + r.returnOfCapitalPct || 1;
    const priceGrowthRate = r.growthOverridePct === undefined || r.growthOverridePct === null ? globalPriceGrowth : r.growthOverridePct / 100;
    const priceAtStart = Math.max(0.01, r.priceInr);
    return {
      input: r,
      weight: Math.max(0, r.weightPct),
      priceAtStart,
      dpuAtStart: (r.distributionYieldPct / 100) * priceAtStart,
      interestFraction: r.interestPct / total,
      dividendFraction: r.dividendPct / total,
      returnOfCapitalFraction: r.returnOfCapitalPct / total,
      priceGrowthRate,
      distributionGrowthRate: input.tieDistributionGrowthToPrice ? priceGrowthRate : globalDistributionGrowth,
      lots: [],
      taxPaidInr: 0,
      pendingSameReitReinvestment: 0,
      yearlyNetPayout: [],
      yearlyCashTaken: [],
    };
  });
  const weightSum = reits.reduce((a, r) => a + r.weight, 0);
  for (const r of reits) r.weight = weightSum > 0 ? r.weight / weightSum : 1 / Math.max(1, reits.length);
  return reits;
}

function priceAt(reit: SimReit, month: number): number {
  return reit.priceAtStart * Math.pow(1 + reit.priceGrowthRate, month / 12);
}

function sipAt(input: ReitPortfolioSimulatorInput, month: number): number {
  return Math.max(0, input.monthlySipInr) * Math.pow(1 + input.sipStepUpPctPerYear / 100, Math.floor(month / 12));
}

/** Nets every REIT's lots' gains (priced at `month`) into long-term (>12 months held) and short-term buckets, with the prototype's cross-offset rule: short-term losses offset long-term gains first, then any remaining long-term loss offsets short-term gains — both buckets floored at 0 afterward. */
function nettedGains(reits: readonly SimReit[], month: number): { longTerm: number; shortTerm: number } {
  let longTerm = 0;
  let shortTerm = 0;
  for (const reit of reits) {
    const price = priceAt(reit, month);
    for (const lot of reit.lots) {
      const gain = lot.units * (price - lot.costPerUnit);
      if (month - lot.month > 12) longTerm += gain;
      else shortTerm += gain;
    }
  }
  if (shortTerm < 0) {
    longTerm += shortTerm;
    shortTerm = 0;
  }
  if (longTerm < 0) {
    shortTerm += longTerm;
    longTerm = 0;
    if (shortTerm < 0) shortTerm = 0;
  }
  return { longTerm, shortTerm };
}

/** Prices the netted long-term/short-term gain buckets via `reitGainsTax()` (one call per bucket) and applies the cess on top — `reitGainsTax` itself has no cess parameter, matching the flagship Comparator's own separation of rate-from-cess (see this module's doc comment). */
function exitCapitalGainsTax(gains: { longTerm: number; shortTerm: number }, input: ReitPortfolioSimulatorInput): number {
  const rules: CapitalGainsRules['reit'] = {
    holdingPeriodMonthsForLtcg: 12,
    ltcgRate: input.ltcgRatePct / 100,
    ltcgExemptionPerYear: input.ltcgExemptionInr,
    stcgRate: input.stcgRatePct / 100,
  };
  const ltResult = reitGainsTax({ gain: gains.longTerm, holdingMonths: 12 }, rules);
  const stResult = reitGainsTax({ gain: gains.shortTerm, holdingMonths: 0 }, rules);
  const ltTax = ltResult.kind === 'flat' ? ltResult.tax : 0;
  const stTax = stResult.kind === 'flat' ? stResult.tax : 0;
  return (ltTax + stTax) * (1 + input.capitalGainsCessPct / 100);
}

export function simulateReitPortfolio(rawInput: ReitPortfolioSimulatorInput, strategy: ReitPortfolioStrategy): ReitPortfolioSimulationResult {
  const { windowYears: W, horizonYears: Y } = resolvedHorizon(rawInput);
  const input = rawInput;
  const N = Y * 12;
  const WM = W * 12;
  const inflationRate = input.inflationPct / 100;
  const slabRate = input.slabRatePct / 100;
  const brokerageRate = input.brokeragePct / 100;
  const harvestFraction = Math.max(0, Math.min(100, input.harvestPct)) / 100;
  const lumpsum = Math.max(0, input.lumpsumInr);

  const reits = buildSimReits(input);
  for (const r of reits) {
    r.yearlyNetPayout = new Array(Y + 1).fill(0);
    r.yearlyCashTaken = new Array(Y + 1).fill(0);
  }

  const n = reits.length;
  const yearlyOutOfPocket = new Array(Y + 1).fill(0);
  const yearlyPaidIn = new Array(Y + 2).fill(0);
  const yearlyPaidInReal = new Array(Y + 2).fill(0);
  const yearlyReinvested = new Array(Y + 1).fill(0);
  const yearlyReinvestedReal = new Array(Y + 1).fill(0);
  const yearlyTax = new Array(Y + 1).fill(0);
  const yearlyTaxReal = new Array(Y + 1).fill(0);
  const yearlyPayoutReal = new Array(Y + 1).fill(0);
  const yearlyCashReal = new Array(Y + 1).fill(0);

  const yearly: ReitPortfolioYearRow[] = [];
  let contributedNominal = 0;
  let contributedReal = 0;
  let cashTakenNominal = 0;
  let cashTakenReal = 0;
  let pooledForReinvestment = 0;
  let offRampStopped = false;
  let offRampMonth: number | null = null;
  let totalTaxPaid = 0;

  for (let t = 0; t <= N; t++) {
    if (t > 0 && t % 3 === 0) {
      const yearIndex = Math.ceil(t / 12);
      const inWindow = t <= WM;
      const reinvestFraction = strategy === 'withdraw' ? 0 : inWindow ? 1 : 1 - harvestFraction;
      let quarterNet = 0;

      for (const r of reits) {
        const dpu = (r.dpuAtStart * Math.pow(1 + r.distributionGrowthRate, t / 12)) / 4;
        const rocPerUnit = dpu * r.returnOfCapitalFraction;
        let units = 0;
        let excess = 0;
        for (const lot of r.lots) {
          if (lot.month < t) {
            units += lot.units;
            let newBasis = lot.costPerUnit - rocPerUnit;
            if (newBasis < 0) {
              excess += -newBasis * lot.units;
              newBasis = 0;
            }
            lot.costPerUnit = newBasis;
          }
        }
        const gross = units * dpu;
        const taxable = gross * r.interestFraction + (input.taxDividendComponent ? gross * r.dividendFraction : 0) + excess;
        const tax = taxable * slabRate;
        const net = gross - tax;
        r.taxPaidInr += tax;
        totalTaxPaid += tax;
        r.yearlyNetPayout[yearIndex]! += net;
        quarterNet += net;
        yearlyTax[yearIndex] += tax;
        const deflatorAtQuarter = Math.pow(1 + inflationRate, t / 12);
        yearlyTaxReal[yearIndex] += tax / deflatorAtQuarter;
        yearlyPayoutReal[yearIndex] += net / deflatorAtQuarter;
        const reinvested = net * reinvestFraction;
        const cash = net - reinvested;
        r.yearlyCashTaken[yearIndex]! += cash;
        yearlyReinvested[yearIndex] += reinvested;
        yearlyReinvestedReal[yearIndex] += reinvested / deflatorAtQuarter;
        yearlyCashReal[yearIndex] += cash / deflatorAtQuarter;
        cashTakenNominal += cash;
        cashTakenReal += cash / deflatorAtQuarter;
        if (input.reinvestmentSplit === 'same_reit') r.pendingSameReitReinvestment += reinvested;
        else pooledForReinvestment += reinvested;
      }

      if (strategy === 'auto_offramp' && !offRampStopped && t < WM && n > 0 && quarterNet / 3 >= sipAt(input, t) && input.monthlySipInr > 0) {
        offRampStopped = true;
        offRampMonth = t;
      }
    }

    if (t % 12 === 0 && t > 0) {
      const deflator = Math.pow(1 + inflationRate, t / 12);
      let value = 0;
      let payout = 0;
      let cash = 0;
      for (const r of reits) {
        const units = r.lots.reduce((a, l) => a + l.units, 0);
        value += units * priceAt(r, t);
        payout += r.yearlyNetPayout[t / 12]!;
        cash += r.yearlyCashTaken[t / 12]!;
      }
      const outOfPocket = yearlyOutOfPocket[t / 12];
      const yearIndex = t / 12;
      const gains = nettedGains(reits, t);
      const exitTax = exitCapitalGainsTax(gains, input);
      const phase: ReitPortfolioYearRow['phase'] =
        strategy === 'withdraw'
          ? t <= WM
            ? 'contributing'
            : 'holding'
          : t <= WM
            ? strategy === 'auto_offramp' && offRampStopped
              ? offRampMonth !== null && offRampMonth > t - 12
                ? 'off_ramp'
                : 'self_funding'
              : 'contributing'
            : 'harvesting';
      const exitNetReal = (value - exitTax) / deflator;
      yearly.push({
        year: yearIndex,
        phase,
        paidInThisYearNominalInr: yearlyPaidIn[yearIndex],
        paidInToDateNominalInr: contributedNominal,
        paidInToDateRealInr: contributedReal,
        postTaxPayoutsThisYearNominalInr: payout,
        postTaxPayoutsThisYearRealInr: yearlyPayoutReal[yearIndex],
        reinvestedThisYearNominalInr: yearlyReinvested[yearIndex],
        reinvestedThisYearRealInr: yearlyReinvestedReal[yearIndex],
        cashTakenThisYearNominalInr: cash,
        cashTakenThisYearRealInr: yearlyCashReal[yearIndex],
        taxOnPayoutsThisYearNominalInr: yearlyTax[yearIndex],
        taxOnPayoutsThisYearRealInr: yearlyTaxReal[yearIndex],
        outOfPocketThisYearNominalInr: outOfPocket,
        outOfPocketThisYearRealInr: outOfPocket / deflator,
        valueNominalInr: value,
        valueRealInr: value / deflator,
        exitNetRealInr: exitNetReal,
        netIfSoldRealInr: exitNetReal + cashTakenReal - contributedReal,
      });
    }

    if (t < N) {
      const pool = pooledForReinvestment;
      pooledForReinvestment = 0;
      const sip = t < WM && !(strategy === 'auto_offramp' && offRampStopped) ? sipAt(input, t) : 0;
      for (const r of reits) {
        const own = (sip + (t === 0 ? lumpsum : 0)) * r.weight;
        const add = input.reinvestmentSplit === 'same_reit' ? r.pendingSameReitReinvestment : pool * r.weight;
        r.pendingSameReitReinvestment = 0;
        const amount = own + add;
        if (amount > 0) {
          const price = priceAt(r, t);
          const units = (amount * (1 - brokerageRate)) / price;
          r.lots.push({ units, costPerUnit: amount / units, month: t });
        }
        contributedNominal += own;
        contributedReal += own / Math.pow(1 + inflationRate, t / 12);
        yearlyPaidIn[Math.floor(t / 12) + 1] += own;
        yearlyPaidInReal[Math.floor(t / 12) + 1] += own / Math.pow(1 + inflationRate, t / 12);
      }
      yearlyOutOfPocket[Math.floor(t / 12) + 1] += sip;
    }
  }

  const deflatorAtHorizon = Math.pow(1 + inflationRate, Y);
  const finalGains = nettedGains(reits, N);
  const finalValue = reits.reduce((sum, r) => {
    const price = priceAt(r, N);
    const units = r.lots.reduce((a, l) => a + l.units, 0);
    return sum + units * price;
  }, 0);
  const exitTax = exitCapitalGainsTax(finalGains, input);

  const reitResults: ReitPortfolioReitResult[] = reits.map((r) => {
    const price = priceAt(r, N);
    const units = r.lots.reduce((a, l) => a + l.units, 0);
    return {
      id: r.input.id,
      name: r.input.name,
      weightPct: r.weight * 100,
      postTaxYieldTodayPct: reitPostTaxYieldPct(r.input, input.slabRatePct, input.taxDividendComponent),
      valueAtHorizonInr: units * price,
      finalYearPostTaxPayoutPerMonthInr: r.yearlyNetPayout[Y]! / 12,
      taxPaidOnPayoutsInr: r.taxPaidInr,
    };
  });

  const finalYearPostTaxPayoutPerMonth = reits.reduce((a, r) => a + r.yearlyNetPayout[Y]!, 0) / 12;
  const finalYearCashTakenPerMonth = reits.reduce((a, r) => a + r.yearlyCashTaken[Y]!, 0) / 12;

  return {
    strategy,
    contributionWindowYears: W,
    horizonYears: Y,
    inflationDeflatorAtHorizon: deflatorAtHorizon,
    reits: reitResults,
    yearly,
    portfolioValueAtHorizonInr: finalValue,
    exitCapitalGainsTaxInr: exitTax,
    totalContributedNominalInr: contributedNominal,
    totalContributedRealInr: contributedReal,
    totalTaxPaidOnPayoutsInr: totalTaxPaid,
    totalCashTakenNominalInr: cashTakenNominal,
    totalCashTakenRealInr: cashTakenReal,
    finalYearPostTaxPayoutPerMonthInr: finalYearPostTaxPayoutPerMonth,
    finalYearCashTakenPerMonthInr: finalYearCashTakenPerMonth,
    offRampMonth,
    netResultTodayInr: (finalValue - exitTax) / deflatorAtHorizon + cashTakenReal - contributedReal,
  };
}
