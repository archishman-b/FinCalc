/**
 * The Comparator itself — brief §3's flagship module and §6 Phase 4's
 * deliverable. See the module doc comment in types.ts for the overall
 * design; this file is the orchestration: equalise outflow, sweep
 * surplus, tax annually, exit at each horizon, audit for parity.
 *
 * @fincalc/data ships income-tax and capital-gains rule packs for
 * FY2025-26 and FY2026-27 only (Phase 2). A 25-year comparison runs well
 * past both. Rather than guess at unreleased Union Budgets, this module
 * freezes every FY beyond what's shipped at `LATEST_SHIPPED_FY`'s rules —
 * a documented simplification, not a prediction, and one every scenario
 * in a comparison is subject to identically, so it doesn't introduce
 * cross-scenario asymmetry. Pass a custom `resolveIncomeTaxRules` /
 * `resolveCapitalGainsRules` on HouseholdTaxConfig to override.
 */

import { getCapitalGainsRules, getIncomeTaxRules } from '@fincalc/data';
import type { CapitalGainsRules, CostInflationIndexRules, IncomeTaxRules } from '@fincalc/data';

import { sipPosition } from '../positions/sip';
import { xirrFromMonthlyCashflows } from '../xirr';
import type { MarketContext, Month, MonthlyRow, Position, SeriesId } from '../types';

import { computeExitResult } from './exit';
import { fiscalYearsInHorizon, fyForMonth, monthRangeForFy } from './fiscal-year';
import { buildIncomeTaxInputForFy, computeAnnualTax } from './household-tax';
import { runParityAuditor } from './parity-auditor';
import type {
  CompareOptions,
  ComparisonResult,
  ExitConfig,
  HorizonResult,
  HouseholdTaxConfig,
  Scenario,
  ScenarioComparisonResult,
} from './types';

export const LATEST_SHIPPED_FY = '2026-27';

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function defaultResolveIncomeTaxRules(fy: string): IncomeTaxRules {
  try {
    return getIncomeTaxRules(fy);
  } catch {
    return getIncomeTaxRules(LATEST_SHIPPED_FY);
  }
}

function defaultResolveCapitalGainsRules(fy: string): CapitalGainsRules {
  try {
    return getCapitalGainsRules(fy);
  } catch {
    return getCapitalGainsRules(LATEST_SHIPPED_FY);
  }
}

function projectAllPositions(scenario: Scenario, ctx: MarketContext, maxHorizon: number): Map<string, MonthlyRow[]> {
  const rows = new Map<string, MonthlyRow[]>();
  for (const position of scenario.positions) {
    rows.set(position.id, position.project(maxHorizon, ctx));
  }
  return rows;
}

export interface OwnOutflowResult {
  positionRows: Map<string, MonthlyRow[]>;
  /** Net cash cost of this scenario's own dedicated positions before that year's income tax, per month. */
  ownNetBeforeTax: number[];
  /** Same, with each FY's income tax added into that FY's last (or horizon-truncating) month. */
  ownNetWithTax: number[];
  annualTaxByFy: Map<string, ReturnType<typeof computeAnnualTax>>;
}

/**
 * Pass 1 for one scenario: what this scenario costs on its own, including
 * the annual income tax its own positions' taxable income generates —
 * independent of any other scenario, and independent of the equalisation
 * target (which is only known once every scenario's own cost is known).
 */
export function computeOwnMonthlyOutflow(
  scenario: Scenario,
  ctx: MarketContext,
  maxHorizon: number,
  startFy: string,
  household: HouseholdTaxConfig,
): OwnOutflowResult {
  const positionRows = projectAllPositions(scenario, ctx, maxHorizon);
  const resolveIncomeTaxRules = household.resolveIncomeTaxRules ?? defaultResolveIncomeTaxRules;

  const ownNetBeforeTax = new Array<number>(maxHorizon).fill(0);
  for (const rows of positionRows.values()) {
    for (const row of rows) {
      ownNetBeforeTax[row.month - 1] = round2((ownNetBeforeTax[row.month - 1] ?? 0) + row.cashOut - row.cashIn);
    }
  }

  const ownNetWithTax = ownNetBeforeTax.slice();
  const annualTaxByFy = new Map<string, ReturnType<typeof computeAnnualTax>>();
  for (const fy of fiscalYearsInHorizon(startFy, maxHorizon)) {
    const range = monthRangeForFy(startFy, fy, maxHorizon);
    if (!range) continue;
    const rules = resolveIncomeTaxRules(fy);
    const result = computeAnnualTax(scenario, positionRows, range.start, range.end, fy, household, rules, maxHorizon);
    annualTaxByFy.set(fy, result);
    const taxMonthIndex = range.end - 1;
    ownNetWithTax[taxMonthIndex] = round2((ownNetWithTax[taxMonthIndex] ?? 0) + result.incomeTaxResult.totalTaxPayable);
  }

  return { positionRows, ownNetBeforeTax, ownNetWithTax, annualTaxByFy };
}

/**
 * For a `reit`-treatment exit, the correct capital-gains cost basis is
 * `ReitDistributionRow.costBasisRemaining` at the horizon month — it
 * already accounts for every month's return-of-capital reduction, per
 * reit.ts's own doc comment on why that field exists. exit.ts only sees
 * the base `Position`/`MonthlyRow` shape (by design, matching every other
 * Position in this engine), so it can't reach `.distributions()` itself —
 * this duck-types the richer ReitPosition shape (the same pattern
 * household-tax.ts uses for `loanAmortization`) and fills the cost basis
 * in automatically unless the caller already supplied one explicitly.
 */
export function resolveExitConfigWithReitCostBasis(
  position: Position,
  config: ExitConfig | undefined,
  ctx: MarketContext,
  horizonMonths: number,
): ExitConfig | undefined {
  if (!config || config.capitalGainsTreatment !== 'reit' || config.costOfAcquisition !== undefined) return config;
  const withDistributions = position as Position & {
    distributions?: (months: number, ctx: MarketContext) => Array<{ costBasisRemaining: number }>;
  };
  if (typeof withDistributions.distributions !== 'function') return config;
  const rows = withDistributions.distributions(horizonMonths, ctx);
  const costBasisRemaining = rows[horizonMonths - 1]?.costBasisRemaining;
  return costBasisRemaining === undefined ? config : { ...config, costOfAcquisition: costBasisRemaining };
}

/**
 * Pass 2 for one scenario, given the equalised target every scenario in
 * the comparison must be charged each month (already computed by
 * `compare()` as the max across scenarios — or, for `solveHurdleRate`,
 * frozen from a prior real comparison so a hypothetical rate shift is
 * evaluated under the same outflow commitment). Builds the sweep
 * position, runs exit economics at every requested horizon, and computes
 * XIRR.
 */
export function projectScenarioGivenTarget(
  scenario: Scenario,
  ctx: MarketContext,
  own: OwnOutflowResult,
  targetByMonth: readonly number[],
  horizonsMonths: readonly number[],
  startFy: string,
  household: HouseholdTaxConfig,
  cii: CostInflationIndexRules,
): ScenarioComparisonResult {
  const maxHorizon = targetByMonth.length;
  const resolveIncomeTaxRules = household.resolveIncomeTaxRules ?? defaultResolveIncomeTaxRules;
  const resolveCapitalGainsRules = household.resolveCapitalGainsRules ?? defaultResolveCapitalGainsRules;

  const sweepContribution = targetByMonth.map((target, i) => Math.max(0, round2(target - (own.ownNetWithTax[i] ?? 0))));
  const sweep = sipPosition(`${scenario.id}:sweep`, {
    monthlyContribution: (month: Month) => sweepContribution[month - 1] ?? 0,
    growthSeries: scenario.sweepGrowthSeries,
  });
  const sweepRows = sweep.project(maxHorizon, ctx);

  // Phase 9.12: two more projections of the *same* sweep, splitting its
  // contribution schedule into "month 1" and "every later month" so a UI
  // can show what each part grew into. compoundContributions is linear in
  // the contribution stream, so these always sum back to sweepRows exactly.
  const sweepFirstMonthOnly = sipPosition(`${scenario.id}:sweep-first-month`, {
    monthlyContribution: (month: Month) => (month === 1 ? (sweepContribution[0] ?? 0) : 0),
    growthSeries: scenario.sweepGrowthSeries,
  });
  const sweepLaterMonthsOnly = sipPosition(`${scenario.id}:sweep-later-months`, {
    monthlyContribution: (month: Month) => (month === 1 ? 0 : (sweepContribution[month - 1] ?? 0)),
    growthSeries: scenario.sweepGrowthSeries,
  });
  const sweepFirstMonthRows = sweepFirstMonthOnly.project(maxHorizon, ctx);
  const sweepLaterMonthsRows = sweepLaterMonthsOnly.project(maxHorizon, ctx);

  const exitConfigByPositionId = new Map((scenario.exitConfigs ?? []).map((c) => [c.positionId, c]));
  const sweepExitConfig = { positionId: sweep.id, ...(scenario.sweepExitConfig ?? { capitalGainsTreatment: 'equity' as const }) };

  const perHorizon: HorizonResult[] = horizonsMonths.map((horizonMonths) => {
    const saleFy = fyForMonth(startFy, horizonMonths);
    const incomeTaxRules = resolveIncomeTaxRules(saleFy);
    const capitalGainsRules = resolveCapitalGainsRules(saleFy);
    const range = monthRangeForFy(startFy, saleFy, horizonMonths)!;
    const { input: regularIncomeTaxInputForExitYear } = buildIncomeTaxInputForFy(
      scenario,
      own.positionRows,
      range.start,
      range.end,
      saleFy,
      household,
      maxHorizon,
    );
    const exitCtx = { startFy, horizonMonths, capitalGainsRules, cii, incomeTaxRules, regularIncomeTaxInputForExitYear };

    let ownPositionsValueAfterTax = 0;
    let ownExitTax = 0;
    let ownAssetValue = 0;
    let ownLiabilityBalance = 0;
    for (const position of scenario.positions) {
      const rows = own.positionRows.get(position.id) ?? [];
      const config = resolveExitConfigWithReitCostBasis(position, exitConfigByPositionId.get(position.id), ctx, horizonMonths);
      const result = computeExitResult(position, rows, config, exitCtx);
      ownPositionsValueAfterTax = round2(ownPositionsValueAfterTax + result.netProceedsAfterTax);
      ownExitTax = round2(ownExitTax + result.capitalGainsTax);
      const row = rows[horizonMonths - 1];
      ownAssetValue = round2(ownAssetValue + (row?.assetValue ?? 0));
      ownLiabilityBalance = round2(ownLiabilityBalance + (row?.liabilityBalance ?? 0));
    }
    const ownExitTaxAndCosts = round2(ownAssetValue - ownLiabilityBalance - ownPositionsValueAfterTax);

    const sweepExitResult = computeExitResult(
      { id: sweep.id, kind: sweep.kind, project: sweep.project } as Position,
      sweepRows,
      sweepExitConfig,
      exitCtx,
    );
    const sweepValueAfterTax = sweepExitResult.netProceedsAfterTax;
    const sweepFirstMonthValue = sweepFirstMonthRows[horizonMonths - 1]?.assetValue ?? 0;
    const sweepLaterMonthsValue = sweepLaterMonthsRows[horizonMonths - 1]?.assetValue ?? 0;
    const sweepExitTaxAndCosts = round2(sweepFirstMonthValue + sweepLaterMonthsValue - sweepValueAfterTax);

    let capitalDeployedIntoOwnPositions = 0;
    for (let m = 0; m < horizonMonths; m++) capitalDeployedIntoOwnPositions += Math.max(0, own.ownNetWithTax[m] ?? 0);
    capitalDeployedIntoOwnPositions = round2(capitalDeployedIntoOwnPositions);

    const ownCashflows = own.ownNetWithTax.slice(0, horizonMonths).map((v) => -v);
    ownCashflows[horizonMonths - 1] = round2((ownCashflows[horizonMonths - 1] ?? 0) + ownPositionsValueAfterTax);
    const totalCashflows = targetByMonth.slice(0, horizonMonths).map((v) => -v);
    totalCashflows[horizonMonths - 1] = round2(
      (totalCashflows[horizonMonths - 1] ?? 0) + ownPositionsValueAfterTax + sweepValueAfterTax,
    );

    let xirrOwnPositions: number | null;
    try {
      xirrOwnPositions = xirrFromMonthlyCashflows(ownCashflows);
    } catch {
      xirrOwnPositions = null;
    }
    let xirrTotal: number | null;
    try {
      xirrTotal = xirrFromMonthlyCashflows(totalCashflows);
    } catch {
      xirrTotal = null;
    }

    let annualTaxWithinHorizon = 0;
    for (const [fy, result] of own.annualTaxByFy) {
      const r = monthRangeForFy(startFy, fy, horizonMonths);
      if (r) annualTaxWithinHorizon += result.incomeTaxResult.totalTaxPayable;
    }

    return {
      horizonMonths,
      ownPositionsValueAfterTax,
      sweepValueAfterTax,
      terminalNetWorth: round2(ownPositionsValueAfterTax + sweepValueAfterTax),
      capitalDeployedIntoOwnPositions,
      xirrOwnPositions,
      xirrTotal,
      totalTaxPaidCumulative: round2(annualTaxWithinHorizon + ownExitTax + sweepExitResult.capitalGainsTax),
      ownBreakdown: { assetValue: ownAssetValue, liabilityBalance: ownLiabilityBalance, exitTaxAndCosts: ownExitTaxAndCosts },
      sweepBreakdown: {
        firstMonthValue: round2(sweepFirstMonthValue),
        laterMonthsValue: round2(sweepLaterMonthsValue),
        exitTaxAndCosts: sweepExitTaxAndCosts,
      },
    };
  });

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    ownMonthlyOutflow: own.ownNetWithTax.slice(),
    equalisedMonthlyOutflow: targetByMonth.slice(),
    sweepContribution,
    perHorizon,
  };
}

export function compare(options: CompareOptions): ComparisonResult {
  const maxHorizon = Math.max(...options.horizonsMonths);
  const own = new Map<string, OwnOutflowResult>();
  for (const scenario of options.scenarios) {
    own.set(scenario.id, computeOwnMonthlyOutflow(scenario, options.ctx, maxHorizon, options.startFy, options.household));
  }

  const target = new Array<number>(maxHorizon).fill(0);
  for (let m = 0; m < maxHorizon; m++) {
    let best = options.minimumMonthlyBudget?.(m + 1) ?? 0;
    for (const result of own.values()) best = Math.max(best, result.ownNetWithTax[m] ?? 0);
    target[m] = round2(best);
  }

  const scenarios = options.scenarios.map((scenario) =>
    projectScenarioGivenTarget(
      scenario,
      options.ctx,
      own.get(scenario.id)!,
      target,
      options.horizonsMonths,
      options.startFy,
      options.household,
      options.cii,
    ),
  );

  const parityWarnings = runParityAuditor(
    options.scenarios,
    options.ctx,
    maxHorizon,
    options.growthParityThresholdPct ?? 0.02,
    options.acknowledgedGrowthAsymmetries ?? [],
  );

  return { scenarios, parityWarnings };
}

/**
 * Bisects for the annualised rate `seriesToSolve` would need to hold
 * (flat, for the whole horizon) for `scenario` to reach
 * `targetTerminalNetWorth` at `horizonMonths` — the brief's headline
 * "hurdle rate" output (§1 principle 4). Evaluated against the *same*
 * equalised monthly outflow commitment as the real comparison it's
 * being asked about (`frozenTargetByMonth`), so the hurdle rate answers
 * "what would this asset need to earn, at the household's actual
 * committed spend" rather than under some other cash-flow shape.
 */
export function solveHurdleRate(
  scenario: Scenario,
  seriesToSolve: SeriesId,
  baseCtx: MarketContext,
  frozenTargetByMonth: readonly number[],
  horizonMonths: number,
  targetTerminalNetWorth: number,
  startFy: string,
  household: HouseholdTaxConfig,
  cii: CompareOptions['cii'],
  bounds: { lo: number; hi: number } = { lo: -0.3, hi: 0.6 },
): number {
  const target = frozenTargetByMonth.slice(0, horizonMonths);

  function evaluateAt(rate: number): number {
    const wrappedCtx: MarketContext = {
      rate: (series, month) => (series === seriesToSolve ? rate : baseCtx.rate(series, month)),
      provenance: (series) => baseCtx.provenance(series),
    };
    const own = computeOwnMonthlyOutflow(scenario, wrappedCtx, horizonMonths, startFy, household);
    const result = projectScenarioGivenTarget(scenario, wrappedCtx, own, target, [horizonMonths], startFy, household, cii);
    return result.perHorizon[0]!.terminalNetWorth;
  }

  let lo = bounds.lo;
  let hi = bounds.hi;
  let loVal = evaluateAt(lo) - targetTerminalNetWorth;
  const hiVal = evaluateAt(hi) - targetTerminalNetWorth;
  if (Math.sign(loVal) === Math.sign(hiVal)) {
    throw new RangeError(
      `solveHurdleRate: target terminal net worth ${targetTerminalNetWorth} is not bracketed by rates in [${bounds.lo}, ${bounds.hi}] for series "${seriesToSolve}"`,
    );
  }
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const midVal = evaluateAt(mid) - targetTerminalNetWorth;
    if (Math.abs(midVal) < 1) return mid;
    if (Math.sign(midVal) === Math.sign(loVal)) {
      lo = mid;
      loVal = midVal;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}
