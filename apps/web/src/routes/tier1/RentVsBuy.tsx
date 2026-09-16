import { useMemo, useState } from 'react';

import { formatINR } from '@fincalc/ui';

import { Amount } from '../../components/Amount';
import { Callout, CalcShell, NumberField, SubmitButton } from '../../components/CalcShell';
import { ResultChart } from '../../components/ResultChart';
import { buildLayerOneComparison, SUPPORTED_CITIES, type LayerOneResult } from '../../lib/scenario-builder';

/**
 * Door 2 ("Should I rent or buy?") and Tier 1's "Rent vs Buy" module
 * (brief §3, §4) are the same underlying question with the same required
 * output — full opportunity-cost treatment of the down payment, and a
 * break-even year — so both route here rather than duplicating the
 * Allocation Comparator's Buy-vs-Rent-and-invest mechanism a second time.
 * `buildLayerOneComparison` already computes all four horizons (5/10/15/25
 * years) in one call; this page reads the break-even year straight off
 * that table instead of re-running the comparison per horizon.
 *
 * Phase 9.1: the terminal-net-worth-by-horizon chart is the exact same
 * shape the Comparator already draws with `ResultChart` — reused as-is
 * rather than redrawn, since `layerOne.result`/`horizonsMonths` are the
 * same `ComparisonResult` shape in both places.
 */
interface BreakEven {
  crosses: boolean;
  year: 5 | 10 | 15 | 25;
  buyNW: number;
  rentNW: number;
}

const BREAK_EVEN_YEARS = [5, 10, 15, 25] as const;

function computeBreakEven(layerOne: LayerOneResult | null): BreakEven | null {
  if (!layerOne) return null;
  const [buyComparison, rentComparison] = layerOne.result.scenarios;
  const crossIndex = layerOne.horizonsMonths.findIndex(
    (_, i) => buyComparison!.perHorizon[i]!.terminalNetWorth >= rentComparison!.perHorizon[i]!.terminalNetWorth,
  );
  const idx = crossIndex === -1 ? layerOne.horizonsMonths.length - 1 : crossIndex;
  return {
    crosses: crossIndex !== -1,
    year: BREAK_EVEN_YEARS[idx]!,
    buyNW: buyComparison!.perHorizon[idx]!.terminalNetWorth,
    rentNW: rentComparison!.perHorizon[idx]!.terminalNetWorth,
  };
}

export function RentVsBuy() {
  const [monthlyIncome, setMonthlyIncome] = useState(450_000);
  const [monthlyBudget, setMonthlyBudget] = useState(155_000);
  const [submitted, setSubmitted] = useState(false);

  const outcome = useMemo<{ ok: true; value: LayerOneResult } | { ok: false; error: string } | null>(() => {
    if (!submitted) return null;
    try {
      const value = buildLayerOneComparison({
        city: 'hyderabad',
        monthlyHouseholdIncomeNet: monthlyIncome,
        monthlyHousingBudget: monthlyBudget,
        horizonYears: 25,
      });
      return { ok: true, value };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something about these numbers didn't compute. Try different values.";
      return { ok: false, error: message };
    }
  }, [submitted, monthlyIncome, monthlyBudget]);

  const layerOne = outcome?.ok ? outcome.value : null;
  const error = outcome && !outcome.ok ? outcome.error : null;

  // Deliberately not useMemo: `layerOne` is already the stable output of
  // the memo above, and this is a cheap read over a 4-element array — a
  // second memo here isn't worth it, and the equivalent for-loop version
  // tripped the React Compiler's manual-memoization-preservation check.
  const breakEven = computeBreakEven(layerOne);

  return (
    <CalcShell
      title="Should I rent or buy?"
      subtitle="Buying a home your budget can support, versus renting an equivalent home and investing the difference — on equal monthly outflow, after tax, including the opportunity cost of the down payment."
      back="home"
      backLabel="← FinCalc"
      form={
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(true);
          }}
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-ink">City</span>
            <select className="rounded-sm border border-hairline bg-paper px-3 py-2 text-ink" defaultValue={SUPPORTED_CITIES[0].id} disabled>
              {SUPPORTED_CITIES.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </label>
          <NumberField label="Household income, per month (take-home)" value={monthlyIncome} onChange={setMonthlyIncome} />
          <NumberField label="Monthly housing budget" value={monthlyBudget} onChange={setMonthlyBudget} />
          <SubmitButton>Compare →</SubmitButton>
        </form>
      }
    >
      {error && <Callout>{error}</Callout>}

      {layerOne && breakEven && (
        <section className="flex flex-col gap-8" aria-label="Rent vs buy result">
          <p className="font-serif-heading max-w-md text-2xl leading-snug text-ink sm:text-3xl">
            {breakEven.crosses ? (
              <>
                Buying pulls ahead of renting-and-investing by <span className="text-rust">year {breakEven.year}</span>.
              </>
            ) : (
              <>
                Renting-and-investing stays ahead of buying through year {breakEven.year}, the longest horizon we project.
              </>
            )}
          </p>

          <ResultChart result={layerOne.result} horizonsMonths={layerOne.horizonsMonths} />

          <div className="overflow-x-auto">
            <table className="w-full min-w-[320px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-ink-muted">
                  <th className="py-2 pr-3 font-normal">Horizon</th>
                  <th className="py-2 pr-3 font-normal">Buy</th>
                  <th className="py-2 pr-3 font-normal">Rent &amp; invest</th>
                </tr>
              </thead>
              <tbody>
                {[5, 10, 15, 25].map((y, i) => {
                  const [buyComparison, rentComparison] = layerOne.result.scenarios;
                  return (
                    <tr key={y} className="border-b border-hairline/60">
                      <td className="py-2 pr-3 align-top text-ink-muted">{y}yr</td>
                      <td className="py-2 pr-3 align-top"><Amount value={buyComparison!.perHorizon[i]!.terminalNetWorth} className="text-ink" /></td>
                      <td className="py-2 pr-3 align-top"><Amount value={rentComparison!.perHorizon[i]!.terminalNetWorth} className="text-ink" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {layerOne.result.parityWarnings.length > 0 && (
            <ul className="flex flex-col gap-2">
              {layerOne.result.parityWarnings.map((w, i) => (
                <li key={i} className="rounded-sm border border-ochre bg-ochre/10 px-4 py-3 text-sm text-ink">⚠ {w.message}</li>
              ))}
            </ul>
          )}

          <div className="rounded-sm border border-hairline px-4 py-4 text-sm text-ink-muted">
            <p className="mb-2 text-ink">Assumptions used</p>
            <ul className="flex flex-col gap-1">
              {layerOne.assumptions.map((a) => (
                <li key={a.id}>{a.label}: <span className="font-mono tabular-nums text-ink">{(a.rate * 100).toFixed(1)}%</span></li>
              ))}
              <li>Sized home: <Amount value={layerOne.buy.propertyPrice} className="text-ink" /> ({formatINR(layerOne.buy.loanPrincipal, { compact: true })} loan)</li>
              <li>Assumed rent: <Amount value={layerOne.rent.assumedMonthlyRent} className="text-ink" />/month</li>
            </ul>
          </div>
        </section>
      )}
    </CalcShell>
  );
}
