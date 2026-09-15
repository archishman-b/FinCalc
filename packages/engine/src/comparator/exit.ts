/**
 * Exit economics: what a position is actually worth to the household if
 * sold at a given horizon — brokerage, illiquidity haircut, and capital-
 * gains tax (equity/REIT/debt-fund/property routes from tax/capital-
 * gains.ts), per the ExitConfig the Scenario builder declared for it.
 *
 * Capital-gains tax on a *flat*-taxed gain (equity/REIT/property LTCG,
 * grandfathered debt LTCG) is computed as rate × taxable amount + cess,
 * using `rules.surcharge.capitalGainsCap` for the surcharge slab —
 * deliberately without capital-gains-specific marginal relief (a narrow,
 * threshold-crossing-only carve-out; modelling it would need the same
 * relief machinery income-tax.ts already has for ordinary income, applied
 * to a different, less-common trigger). A *slab*-taxed gain (short-term
 * property/debt-fund/equity, or a post-2023 debt-fund unit regardless of
 * holding period) is taxed at the household's actual marginal rate for
 * that exit year via an incremental computeIncomeTax call — this
 * correctly captures progressivity, surcharge and marginal relief on
 * ordinary income, since slab gains simply add to otherSourcesIncome.
 *
 * Every position is treated as a single lot acquired at month 1 (or
 * `acquisitionFy`, if the ExitConfig overrides it) for holding-period
 * purposes — a real SIP/REIT SIP has a mix of lots, each with its own
 * acquisition date, so the last 1-3 years of contributions before a
 * horizon can be mis-classified STCG-vs-LTCG. Documented simplification,
 * not a guess: it applies identically to every scenario compared, so it
 * doesn't introduce cross-scenario asymmetry, and for the 5/10/15/25-year
 * horizons this tool targets, it affects only a small tail of recent
 * contributions.
 */

import type { CapitalGainsRules, CostInflationIndexRules } from '@fincalc/data';

import {
  computePropertyGains,
  debtFundGainsTax,
  equityGainsTax,
  reitGainsTax,
  type FlatTaxedGain,
  type GainTaxResult,
} from '../tax/capital-gains';
import { computeIncomeTax } from '../tax/income-tax';
import type { IncomeTaxRules } from '@fincalc/data';
import type { MonthlyRow, Position } from '../types';

import { fyForMonth } from './fiscal-year';
import type { ExitConfig } from './types';

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface ExitResult {
  positionId: string;
  grossProceeds: number;
  exitCosts: number;
  netSaleValue: number;
  costOfAcquisition: number;
  capitalGainsTax: number;
  /** grossProceeds − liabilityBalance − exitCosts − capitalGainsTax. What actually lands in the household's terminal net worth. */
  netProceedsAfterTax: number;
}

function cumulativeCashOut(rows: readonly MonthlyRow[], throughMonth: number): number {
  let total = 0;
  for (const row of rows) {
    if (row.month <= throughMonth) total += row.cashOut;
  }
  return round2(total);
}

/** rate × taxable + surcharge (capitalGainsCap-limited, no marginal relief) + cess. */
function taxFlatGain(gain: FlatTaxedGain, otherIncomeThisFy: number, rules: IncomeTaxRules): number {
  if (gain.taxableAmount <= 0) return 0;
  const totalIncomeForSurchargeSlab = otherIncomeThisFy + gain.taxableAmount;
  let surchargeRate = 0;
  const sorted = [...rules.surcharge.slabs].sort((a, b) => a.above - b.above);
  for (const slab of sorted) {
    if (totalIncomeForSurchargeSlab > slab.above) surchargeRate = Math.min(slab.rate, rules.surcharge.capitalGainsCap);
  }
  const surcharge = round2(gain.tax * surchargeRate);
  const cess = round2((gain.tax + surcharge) * rules.cess);
  return round2(gain.tax + surcharge + cess);
}

/** Incremental tax the gain itself causes: computeIncomeTax(otherSources + gain) − computeIncomeTax(otherSources alone), holding every other input fixed. Captures progressivity, surcharge and marginal relief on ordinary income correctly. */
function taxSlabGainIncrementally(
  gainAmount: number,
  baseOtherSourcesIncome: number,
  restOfIncomeTaxInput: Parameters<typeof computeIncomeTax>[0],
  rules: IncomeTaxRules,
): number {
  if (gainAmount <= 0) return 0;
  const without = computeIncomeTax({ ...restOfIncomeTaxInput, otherSourcesIncome: baseOtherSourcesIncome }, rules).totalTaxPayable;
  const withGain = computeIncomeTax({ ...restOfIncomeTaxInput, otherSourcesIncome: round2(baseOtherSourcesIncome + gainAmount) }, rules).totalTaxPayable;
  return Math.max(0, round2(withGain - without));
}

export interface ExitTaxContext {
  startFy: string;
  horizonMonths: number;
  capitalGainsRules: CapitalGainsRules;
  cii: CostInflationIndexRules;
  incomeTaxRules: IncomeTaxRules;
  /** The household's regular (non-gain) income-tax inputs for the exit year — used as the base for the incremental slab-gain calculation. otherSourcesIncome here should exclude the gain itself. */
  regularIncomeTaxInputForExitYear: Parameters<typeof computeIncomeTax>[0];
}

export function computeExitResult(
  position: Position,
  rows: readonly MonthlyRow[],
  exitConfig: ExitConfig | undefined,
  ctx: ExitTaxContext,
): ExitResult {
  const row = rows[ctx.horizonMonths - 1];
  if (!row) throw new RangeError(`computeExitResult: position ${position.id} has no row at horizon month ${ctx.horizonMonths}`);

  const treatment = exitConfig?.capitalGainsTreatment ?? 'none';
  const grossProceeds = row.assetValue;

  if (treatment === 'none') {
    return {
      positionId: position.id,
      grossProceeds,
      exitCosts: 0,
      netSaleValue: grossProceeds,
      costOfAcquisition: 0,
      capitalGainsTax: 0,
      netProceedsAfterTax: round2(grossProceeds - row.liabilityBalance),
    };
  }

  const brokerageRate = exitConfig?.exitBrokerageRate ?? 0;
  const haircut = exitConfig?.illiquidityHaircut ?? 0;
  const exitCosts = round2(grossProceeds * (brokerageRate + haircut));
  const netSaleValue = round2(grossProceeds - exitCosts);
  const acquisitionFy = exitConfig?.acquisitionFy ?? ctx.startFy;
  const saleFy = fyForMonth(ctx.startFy, ctx.horizonMonths);
  const holdingMonths = ctx.horizonMonths; // single-lot-at-month-1 simplification — see module doc comment

  let costOfAcquisition: number;
  let gainResult: GainTaxResult;

  if (treatment === 'property') {
    costOfAcquisition = exitConfig?.costOfAcquisition ?? 0;
    const result = computePropertyGains(
      {
        saleValue: netSaleValue,
        costOfAcquisition,
        acquisitionFy,
        saleFy,
        holdingMonths,
        taxpayerType: exitConfig?.taxpayerType ?? 'resident_individual',
      },
      ctx.capitalGainsRules.property,
      ctx.cii,
    );
    gainResult = 'chosenRoute' in result ? result.result : result;
  } else if (treatment === 'reit') {
    costOfAcquisition = exitConfig?.costOfAcquisition ?? cumulativeCashOut(rows, ctx.horizonMonths);
    gainResult = reitGainsTax({ gain: netSaleValue - costOfAcquisition, holdingMonths }, ctx.capitalGainsRules.reit);
  } else if (treatment === 'debt_fund') {
    costOfAcquisition = exitConfig?.costOfAcquisition ?? cumulativeCashOut(rows, ctx.horizonMonths);
    // Every position in this engine is first contributed to at FY2025-26 or later — well after the
    // Finance Act 2023 slab-taxation cutoff for debt funds — so `true` here is a fact about every
    // position this engine can construct, not an assumed default.
    gainResult = debtFundGainsTax(
      { gain: netSaleValue - costOfAcquisition, holdingMonths, acquiredOnOrAfterSlabTaxationDate: true },
      ctx.capitalGainsRules.debtFunds,
    );
  } else {
    costOfAcquisition = exitConfig?.costOfAcquisition ?? cumulativeCashOut(rows, ctx.horizonMonths);
    gainResult = equityGainsTax({ gain: netSaleValue - costOfAcquisition, holdingMonths }, ctx.capitalGainsRules.equity);
  }

  const baseOtherSources = ctx.regularIncomeTaxInputForExitYear.otherSourcesIncome ?? 0;
  const capitalGainsTax =
    gainResult.kind === 'flat'
      ? taxFlatGain(gainResult, baseOtherSources, ctx.incomeTaxRules)
      : taxSlabGainIncrementally(gainResult.amount, baseOtherSources, ctx.regularIncomeTaxInputForExitYear, ctx.incomeTaxRules);

  return {
    positionId: position.id,
    grossProceeds,
    exitCosts,
    netSaleValue,
    costOfAcquisition,
    capitalGainsTax,
    netProceedsAfterTax: round2(netSaleValue - row.liabilityBalance - capitalGainsTax),
  };
}
