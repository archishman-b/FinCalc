/**
 * Aggregates a scenario's dedicated positions' taxable-by-head income for
 * one financial year and runs it through the ordinary income-tax engine
 * (tax/income-tax.ts) — the household-level computation Phase 3's Position
 * architecture deliberately deferred (see decisions-and-workflow.md,
 * "Position architecture (Phase 3)").
 *
 * Two household-level rules live here rather than in any Position, exactly
 * per that Phase 3 decision: the Section 24(b)/22 self-occupied interest
 * deduction (needs the *household's* regime, which a Position never sees),
 * and the new-regime restriction on setting a house-property loss off
 * against salary (computeIncomeTax's `capHousePropertyLossSetOff` now
 * handles the mechanics; this module is what actually sums the loss and
 * hands it over).
 *
 * `rentPaidAnnual` for HRA is supplied directly by the caller's
 * `HouseholdTaxConfig.hraTemplate`, not derived from a rental_expense
 * Position's `cashOut` — that stream mixes the month-1 security deposit
 * into cashOut, and a Position doesn't expose its pure rent component
 * separately (by design: it only emits the combined MonthlyRow stream).
 */

import type { IncomeTaxRules } from '@fincalc/data';
import { computeIncomeTax } from '../tax/income-tax';
import type { IncomeTaxInput, IncomeTaxResult } from '../tax/income-tax';
import type { MonthlyRow, Position } from '../types';

import type { HouseholdTaxConfig, Scenario } from './types';

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Positions exposing their wrapped loan's raw amortisation — real-estate Positions (loanAmortization) and the bare loan Position (amortization) both qualify structurally; only 'owned_property' actually needs this here (Section 24(b)/22). */
function selfOccupiedInterestForRange(position: Position, monthsStart: number, monthsEnd: number, maxHorizon: number): number {
  if (position.kind !== 'owned_property') return 0;
  const withAmortization = position as Position & { loanAmortization?: (months: number) => Array<{ month: number; interest: number }> };
  if (typeof withAmortization.loanAmortization !== 'function') return 0;
  const rows = withAmortization.loanAmortization(maxHorizon);
  let interest = 0;
  for (const row of rows) {
    if (row.month >= monthsStart && row.month <= monthsEnd) interest += row.interest;
  }
  return round2(interest);
}

export interface AnnualTaxResult {
  fy: string;
  monthStart: number;
  monthEnd: number;
  housePropertyIncome: number;
  otherSourcesIncomePositions: number;
  selfOccupiedHomeLoanInterest: number;
  /** The exact IncomeTaxInput this FY's regular (non-capital-gains) tax was computed from — reused by exit.ts so an exit-year capital gain is taxed incrementally against the household's real regular income for that same year, not recomputed from scratch. */
  incomeTaxInput: IncomeTaxInput;
  incomeTaxResult: IncomeTaxResult;
}

/** Sums a scenario's dedicated positions' `taxable.house_property` / `taxable.other_sources` for [monthStart, monthEnd] and the Section 24(b)/22 self-occupied interest, and builds the full IncomeTaxInput for that FY (regular income only — no capital gains). */
export function buildIncomeTaxInputForFy(
  scenario: Scenario,
  positionRows: ReadonlyMap<string, readonly MonthlyRow[]>,
  monthStart: number,
  monthEnd: number,
  fy: string,
  household: HouseholdTaxConfig,
  maxHorizon: number,
): { input: IncomeTaxInput; housePropertyIncome: number; otherSourcesIncomePositions: number; selfOccupiedHomeLoanInterest: number } {
  let housePropertyIncome = 0;
  let otherSourcesIncomePositions = 0;
  let selfOccupiedHomeLoanInterest = 0;

  for (const position of scenario.positions) {
    const rows = positionRows.get(position.id) ?? [];
    for (const row of rows) {
      if (row.month < monthStart || row.month > monthEnd) continue;
      housePropertyIncome += row.taxable.house_property ?? 0;
      otherSourcesIncomePositions += row.taxable.other_sources ?? 0;
    }
    selfOccupiedHomeLoanInterest += selfOccupiedInterestForRange(position, monthStart, monthEnd, maxHorizon);
  }
  housePropertyIncome = round2(housePropertyIncome);
  otherSourcesIncomePositions = round2(otherSourcesIncomePositions);
  selfOccupiedHomeLoanInterest = round2(selfOccupiedHomeLoanInterest);

  const otherSourcesBaseline = household.otherSourcesIncomeAnnual?.(fy) ?? 0;
  const section80d = household.section80d?.(fy);

  const input: IncomeTaxInput = {
    regime: household.regime,
    age: household.age,
    ...(household.grossSalaryAnnual ? { grossSalary: household.grossSalaryAnnual(fy) } : {}),
    housePropertyIncome,
    otherSourcesIncome: round2(otherSourcesIncomePositions + otherSourcesBaseline),
    ...(household.hraTemplate
      ? {
          hra: {
            basicSalaryAnnual: household.hraTemplate.basicSalaryAnnual,
            hraReceivedAnnual: household.hraTemplate.hraReceivedAnnual,
            rentPaidAnnual: household.hraTemplate.rentPaidAnnual(fy),
            isMetro: household.hraTemplate.isMetro,
          },
        }
      : {}),
    ...(household.section80c ? { section80c: household.section80c(fy) } : {}),
    ...(section80d ? { section80d } : {}),
    ...(selfOccupiedHomeLoanInterest ? { selfOccupiedHomeLoanInterest } : {}),
  };

  return { input, housePropertyIncome, otherSourcesIncomePositions, selfOccupiedHomeLoanInterest };
}

/**
 * Sums `taxable.house_property` / `taxable.other_sources` across every
 * dedicated position's rows for [monthStart, monthEnd], adds the
 * household's non-Position baseline income and deductions for this FY,
 * applies the Section 24(b)/22 self-occupied deduction, and runs
 * `computeIncomeTax`. Capital-gains income never appears here — it's
 * realised only at an explicit exit horizon (exit.ts), never accrued
 * annually, matching how every capital-gains function in this engine
 * already works.
 */
export function computeAnnualTax(
  scenario: Scenario,
  positionRows: ReadonlyMap<string, readonly MonthlyRow[]>,
  monthStart: number,
  monthEnd: number,
  fy: string,
  household: HouseholdTaxConfig,
  rules: IncomeTaxRules,
  maxHorizon: number,
): AnnualTaxResult {
  const { input, housePropertyIncome, otherSourcesIncomePositions, selfOccupiedHomeLoanInterest } = buildIncomeTaxInputForFy(
    scenario,
    positionRows,
    monthStart,
    monthEnd,
    fy,
    household,
    maxHorizon,
  );
  const incomeTaxResult = computeIncomeTax(input, rules);
  return {
    fy,
    monthStart,
    monthEnd,
    housePropertyIncome,
    otherSourcesIncomePositions,
    selfOccupiedHomeLoanInterest,
    incomeTaxInput: input,
    incomeTaxResult,
  };
}
