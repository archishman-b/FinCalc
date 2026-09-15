/**
 * Phase 8 (brief §4): "CSV of the full monthly cash-flow table for people
 * who want to check your work in Excel. Let them check your work — it
 * builds trust."
 *
 * `computeOwnMonthlyOutflow` (packages/engine/src/comparator/comparator.ts)
 * already builds exactly this, per scenario, per position, per month —
 * `Position.project()`'s own MonthlyRow shape (cashOut, cashIn, taxable —
 * a per-income-head breakdown, assetValue, liabilityBalance,
 * liquidityTier) — as part of how `compare()` itself works, and it's
 * exported from `@fincalc/engine`'s
 * public surface (comparator/index.ts re-exports the whole module). This
 * file re-runs it once, on demand (only when the user actually clicks
 * "Export CSV", not on every render), rather than the engine needing to
 * grow a new export-shaped API.
 *
 * Deliberately out of scope: the equalisation sweep itself is a
 * Comparator-internal SIP position (comparator.ts's own `sipPosition`
 * call), never returned to the caller as a Position the way a scenario's
 * *own* positions are — types.ts's module doc is explicit that the
 * Comparator "builds and owns [the sweep] internally". So this CSV can
 * report the sweep's monthly *contribution* (ScenarioComparisonResult
 * already exposes that) but not its own month-by-month asset value —
 * doing that would mean changing the engine's public surface, which is a
 * bigger, separate decision than a UI export button, so it's flagged here
 * rather than silently faked.
 */
import { computeOwnMonthlyOutflow, ENGINE_VERSION } from '@fincalc/engine';

import type { LayerOneResult } from './scenario-builder';

function csvField(value: string | number): string {
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvRow(fields: readonly (string | number)[]): string {
  return fields.map(csvField).join(',');
}

/** Builds the full monthly cash-flow CSV (as a string) for every scenario in a Layer-1 comparison, across the full horizon set (not just the currently-selected one), so one export covers every horizon the app can show. */
export function buildMonthlyCashflowCsv(layerOne: LayerOneResult): string {
  const maxHorizonMonths = Math.max(...layerOne.horizonsMonths);
  const lines: string[] = [];

  lines.push(`# FinCalc monthly cash-flow export — engine ${ENGINE_VERSION} — generated ${new Date().toISOString()}`);
  lines.push('# Information, not advice. Every figure below is this scenario’s own modelled cash flow, not a recommendation.');
  lines.push('');

  lines.push('# Per-position monthly detail (each scenario’s own dedicated positions). taxable_* columns break out MonthlyRow.taxable by income head (types.ts) — the exact per-head split the household tax engine consumes, so e.g. rental income lands in taxable_house_property, not a single undifferentiated figure.');
  lines.push(
    csvRow([
      'scenario',
      'position_id',
      'month',
      'cash_out',
      'cash_in',
      'taxable_salary',
      'taxable_house_property',
      'taxable_capital_gains',
      'taxable_other_sources',
      'asset_value',
      'liability_balance',
      'liquidity_tier',
    ]),
  );
  for (const scenario of layerOne.scenarios) {
    const { positionRows } = computeOwnMonthlyOutflow(scenario, layerOne.ctx, maxHorizonMonths, layerOne.startFy, layerOne.household);
    for (const [positionId, monthlyRows] of positionRows) {
      for (const row of monthlyRows) {
        lines.push(
          csvRow([
            scenario.name,
            positionId,
            row.month,
            row.cashOut,
            row.cashIn,
            row.taxable.salary ?? 0,
            row.taxable.house_property ?? 0,
            row.taxable.capital_gains ?? 0,
            row.taxable.other_sources ?? 0,
            row.assetValue,
            row.liabilityBalance,
            row.liquidityTier,
          ]),
        );
      }
    }
  }

  lines.push('');
  lines.push('# Equalised monthly outflow and sweep contribution (the reinvestment vehicle both scenarios share — see comparator.ts).');
  lines.push(csvRow(['scenario', 'month', 'equalised_monthly_outflow', 'sweep_contribution']));
  for (const scenarioResult of layerOne.result.scenarios) {
    for (let i = 0; i < scenarioResult.equalisedMonthlyOutflow.length; i++) {
      lines.push(
        csvRow([scenarioResult.scenarioName, i + 1, scenarioResult.equalisedMonthlyOutflow[i]!, scenarioResult.sweepContribution[i]!]),
      );
    }
  }

  lines.push('');
  lines.push('# Terminal net worth by horizon.');
  lines.push(csvRow(['scenario', 'horizon_months', 'terminal_net_worth', 'capital_deployed_into_own_positions', 'total_tax_paid_cumulative']));
  for (const scenarioResult of layerOne.result.scenarios) {
    for (const h of scenarioResult.perHorizon) {
      lines.push(csvRow([scenarioResult.scenarioName, h.horizonMonths, h.terminalNetWorth, h.capitalDeployedIntoOwnPositions, h.totalTaxPaidCumulative]));
    }
  }

  return lines.join('\r\n');
}

/** Triggers a browser download of a text payload — a plain Blob + object URL + synthetic `<a download>` click, no dependency needed for something this small. */
export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoke on a timeout rather than immediately — some browsers cancel the download if the URL is revoked synchronously after click().
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
