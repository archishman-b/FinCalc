import { useMemo, useState } from 'react';

import { deflateToToday } from '@fincalc/engine';
import { getReitInstruments, getReitInstrumentsAsOf } from '@fincalc/data';

import {
  buildReitPortfolio,
  defaultAssumptions,
  equalWeights,
  REIT_DISPLAY,
  sumWeights,
  weightsAreValid,
  type ReitAssumption,
  type ReitId,
} from '../../lib/reit-portfolio';
import { usePalette } from '../../lib/theme';
import { Amount } from '../../components/Amount';
import { CalcShell, Callout, NumberField, SubmitButton } from '../../components/CalcShell';
import { BreakdownBarChart, GrowthWithIncomeChart } from '../../components/charts';

/**
 * Tier-line module (added Sept 2026, alongside the home-page re-theme):
 * "position REITs as a mix of SIPs and buying a house" — a lumpsum and/or
 * monthly SIP deployed across a user-weighted bucket of India's 5 major
 * listed REITs, showing distribution income (the rental-yield analogue)
 * alongside NAV appreciation (the paper-gain analogue), per the brief §3
 * REIT Portfolio Builder spec. The blending itself lives in
 * lib/reit-portfolio.ts, on top of the engine's existing `reitPosition` —
 * see that Position's own doc comment for the four-component tax model,
 * already built and tested before this page existed.
 *
 * Scope, disclosed rather than silently assumed: this shows accumulation
 * only (distributions received, NAV mark-to-market) — it does not model
 * selling the units and paying exit capital-gains tax, the same way the
 * SIP calculator shows future value without modelling redemption tax.
 * Exit CGT is real and the engine already has what it needs for it
 * (reit.ts's costBasisRemaining, capital-gains.ts's `reit` rules) — it's a
 * natural next step once this integrates with the Comparator, not missing
 * by oversight.
 *
 * The reference data (packages/data/src/reit-reference.ts) is explicit
 * that it's user-supplied and not yet cross-checked against exchange
 * filings — the Assumptions area below surfaces that rather than
 * presenting the defaults as verified fact. The same data backs the
 * collapsed "Historical REIT reference" panel in the form column: a
 * quick, non-obstructive look at each REIT's current price/yield/CAGR/PE
 * before the user commits to a weight split — tagged with its `asOf`
 * date since it's a snapshot, not a live feed (wiring that up is future
 * work, not attempted here).
 *
 * The monthly-income callout below is the module's other new surface:
 * the brief's "equate dividend yields at a point of time as somewhat
 * equivalent to rental yields" use case, made literal by averaging the
 * final year's gross distributions into a single monthly rupee figure
 * (ReitPortfolioResult.monthlyIncomeAtHorizonNominal) and then deflating
 * both it and the headline final value to today's rupees with the same
 * `deflateToToday` SipCalculator.tsx already uses — nominal and real
 * side by side, never real alone.
 */

const YEARS_DEFAULT = 10;
const LUMPSUM_DEFAULT = 500_000;
const MONTHLY_SIP_DEFAULT = 10_000;
const INFLATION_DEFAULT_PCT = 6;

export function ReitPortfolioBuilder() {
  const palette = usePalette();
  const [lumpsum, setLumpsum] = useState(LUMPSUM_DEFAULT);
  const [monthlySip, setMonthlySip] = useState(MONTHLY_SIP_DEFAULT);
  const [years, setYears] = useState(YEARS_DEFAULT);
  const [inflationPct, setInflationPct] = useState(INFLATION_DEFAULT_PCT);
  const [weights, setWeights] = useState<Record<ReitId, number>>(equalWeights);
  const [assumptions, setAssumptions] = useState<Record<ReitId, ReitAssumption>>(defaultAssumptions);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weightTotal = sumWeights(weights);
  const weightsOk = weightsAreValid(weights);
  const months = Math.round(years * 12);

  const result = useMemo(() => {
    if (!submitted || !weightsAreValid(weights)) return null;
    return buildReitPortfolio({ lumpsum, monthlySip, months, weights, assumptions });
  }, [submitted, lumpsum, monthlySip, months, weights, assumptions]);

  const totalTaxableOtherSources = useMemo(() => {
    if (!result) return 0;
    return Math.round(result.rows.reduce((s, r) => s + (r.taxable.other_sources ?? 0), 0) * 100) / 100;
  }, [result]);

  // Real (today's-rupees) equivalents of the two headline nominal figures —
  // the final portfolio value, and the monthly-income-at-horizon figure the
  // "rental yield equivalent" callout below is built around.
  const realFinalValue = useMemo(() => {
    if (!result) return 0;
    return deflateToToday(result.finalValue, inflationPct / 100, months);
  }, [result, inflationPct, months]);
  const monthlyIncomeAtHorizonReal = useMemo(() => {
    if (!result) return 0;
    return deflateToToday(result.monthlyIncomeAtHorizonNominal, inflationPct / 100, months);
  }, [result, inflationPct, months]);

  const historicalInstruments = getReitInstruments();
  const historicalAsOf = getReitInstrumentsAsOf();

  return (
    <CalcShell
      title="REIT Portfolio Builder"
      subtitle="A lumpsum and/or monthly SIP spread across a weighted bucket of India's 5 major listed REITs — distribution income as the rental-yield analogue, NAV growth as the paper-appreciation analogue."
      back="home"
      backLabel="← Home"
      form={
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!weightsAreValid(weights)) {
              setError(`Weights must add up to 100% — currently ${weightTotal.toFixed(1)}%.`);
              return;
            }
            setError(null);
            setSubmitted(true);
          }}
        >
          <NumberField label="Lumpsum, one-time" value={lumpsum} onChange={setLumpsum} step={50_000} min={0} required={false} />
          <NumberField label="Monthly SIP" value={monthlySip} onChange={setMonthlySip} step={1_000} min={0} required={false} />
          <NumberField label="Years" value={years} onChange={setYears} step={1} min={1} max={30} />
          <NumberField
            label="Inflation, annual (%, for the real-value figures)"
            value={inflationPct}
            onChange={setInflationPct}
            step={0.5}
            min={0}
            max={20}
            required={false}
          />

          <details className="rounded-sm border border-hairline px-3 py-2.5">
            <summary className="cursor-pointer text-sm text-ink">Historical REIT reference — as on {historicalAsOf}</summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-ink-muted">
                    <th className="pb-1.5 pr-3 font-normal">REIT</th>
                    <th className="pb-1.5 pr-3 font-normal">Price</th>
                    <th className="pb-1.5 pr-3 font-normal">Yield range</th>
                    <th className="pb-1.5 pr-3 font-normal">3Y CAGR</th>
                    <th className="pb-1.5 font-normal">P/E (TTM)</th>
                  </tr>
                </thead>
                <tbody>
                  {REIT_DISPLAY.map((r) => {
                    const instrument = historicalInstruments.find((i) => i.id === r.id);
                    if (!instrument) return null;
                    const cagr = instrument.priceCagr3y ?? instrument.priceCagr1y ?? instrument.priceCagr5y;
                    return (
                      <tr key={r.id} className="border-t border-hairline">
                        <td className="py-1.5 pr-3 text-ink">
                          <span aria-hidden="true" className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: palette[r.colorKey] }} />
                          {r.shortLabel}
                        </td>
                        <td className="py-1.5 pr-3 font-mono tabular-nums text-ink">
                          <Amount value={instrument.marketPriceInr} compact={false} />
                        </td>
                        <td className="py-1.5 pr-3 font-mono tabular-nums text-ink">
                          {(instrument.distributionYieldRangeMinPct * 100).toFixed(1)}–{(instrument.distributionYieldRangeMaxPct * 100).toFixed(1)}%
                        </td>
                        <td className="py-1.5 pr-3 font-mono tabular-nums text-ink">{cagr !== null ? `${(cagr * 100).toFixed(1)}%` : '—'}</td>
                        <td className="py-1.5 font-mono tabular-nums text-ink">{instrument.peRatioTtm.toFixed(1)}×</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-ink-muted">
                A point-in-time snapshot supplied directly, not yet cross-checked against exchange filings — the same figures the assumptions below default from. Wiring this to a live feed is planned, not built yet.
              </p>
            </div>
          </details>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 flex w-full items-baseline justify-between gap-2 text-sm text-ink">
              <span>Weight across the 5 REITs</span>
              <button
                type="button"
                onClick={() => setWeights(equalWeights())}
                className="text-xs text-ink-muted underline decoration-dotted hover:text-rust"
              >
                Split evenly
              </button>
            </legend>
            {REIT_DISPLAY.map((r) => (
              <label key={r.id} className="flex items-center gap-3 text-sm">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: palette[r.colorKey] }}
                />
                <span className="w-32 shrink-0 text-ink">{r.shortLabel}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  step={1}
                  value={Number.isFinite(weights[r.id]) ? weights[r.id] : ''}
                  onChange={(e) => setWeights({ ...weights, [r.id]: e.target.value === '' ? NaN : Number(e.target.value) })}
                  className="w-20 rounded-sm border border-hairline bg-paper px-2 py-1 font-mono tabular-nums text-ink"
                />
                <span className="text-ink-muted">%</span>
              </label>
            ))}
            <p className={`text-xs ${weightsOk ? 'text-ink-muted' : 'text-ochre'}`}>Total: {weightTotal.toFixed(1)}%{!weightsOk && ' — must equal 100%'}</p>
          </fieldset>

          <details className="rounded-sm border border-hairline px-3 py-2.5">
            <summary className="cursor-pointer text-sm text-ink">Per-REIT assumptions (advanced)</summary>
            <div className="mt-3 flex flex-col gap-4">
              <p className="text-xs text-ink-muted">
                Distribution yield defaults to each REIT&rsquo;s own trailing yield-range midpoint; NAV growth defaults to a haircut trailing price CAGR — deliberately below the historical figure. Raise either only deliberately.
              </p>
              {REIT_DISPLAY.map((r) => (
                <div key={r.id} className="flex flex-col gap-2">
                  <p className="text-sm text-ink">{r.shortLabel}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1 text-xs">
                      <span className="text-ink-muted">NAV growth, annual (%)</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step={0.1}
                        value={Math.round(assumptions[r.id].navGrowthPct * 1000) / 10}
                        onChange={(e) =>
                          setAssumptions({
                            ...assumptions,
                            [r.id]: { ...assumptions[r.id], navGrowthPct: Number(e.target.value) / 100 },
                          })
                        }
                        className="rounded-sm border border-hairline bg-paper px-2 py-1 font-mono tabular-nums text-ink"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs">
                      <span className="text-ink-muted">Distribution yield, annual (%)</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step={0.1}
                        value={Math.round(assumptions[r.id].yieldPct * 1000) / 10}
                        onChange={(e) =>
                          setAssumptions({
                            ...assumptions,
                            [r.id]: { ...assumptions[r.id], yieldPct: Number(e.target.value) / 100 },
                          })
                        }
                        className="rounded-sm border border-hairline bg-paper px-2 py-1 font-mono tabular-nums text-ink"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </details>

          {error && <Callout tone="warning">{error}</Callout>}

          <SubmitButton>Build portfolio →</SubmitButton>
        </form>
      }
    >
      {result && (
        <section className="flex flex-col gap-8" aria-label="REIT portfolio result">
          <div>
            <p className="text-sm text-ink-muted">Portfolio value at the end of year {years}</p>
            <Amount value={result.finalValue} compact={false} className="font-serif-heading text-4xl text-rust" />
            <p className="mt-1 text-sm text-ink-muted">
              ≈ <Amount value={realFinalValue} compact={false} className="text-ink-muted" /> in today&rsquo;s rupees, at {inflationPct}% assumed inflation
            </p>
          </div>

          <Callout tone="positive">
            At year {years}, this portfolio is distributing about{' '}
            <Amount value={result.monthlyIncomeAtHorizonNominal} compact={false} className="font-medium text-ink" /> a month — the rental-yield
            equivalent this tool is built to surface, the same way a rent cheque would read. In today&rsquo;s rupees, that&rsquo;s about{' '}
            <Amount value={monthlyIncomeAtHorizonReal} compact={false} className="font-medium text-ink" /> a month.
          </Callout>

          <dl className="grid max-w-md grid-cols-2 gap-y-4 text-sm">
            <dt className="text-ink-muted">Total invested</dt>
            <dd className="text-right"><Amount value={result.totalInvested} className="text-ink" /></dd>
            <dt className="text-ink-muted">Wealth gained (NAV, unrealised)</dt>
            <dd className="text-right"><Amount value={result.finalValue - result.totalInvested} className="text-moss" /></dd>
            <dt className="text-ink-muted">Total distributions received</dt>
            <dd className="text-right"><Amount value={result.totalGrossDistributions} className="text-ink" /></dd>
            <dt className="text-ink-muted">Of which taxable as Other Sources</dt>
            <dd className="text-right"><Amount value={totalTaxableOtherSources} className="text-ink" /></dd>
          </dl>

          <div>
            <p className="mb-2 text-sm text-ink">Portfolio composition</p>
            <div className="flex h-3 w-full overflow-hidden rounded-sm border border-hairline">
              {REIT_DISPLAY.filter((r) => (weights[r.id] ?? 0) > 0).map((r) => (
                <div
                  key={r.id}
                  style={{ width: `${weights[r.id]}%`, backgroundColor: palette[r.colorKey] }}
                  title={`${r.shortLabel}: ${weights[r.id]}%`}
                />
              ))}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-muted">
              {REIT_DISPLAY.map((r) => {
                const leg = result.legs.find((l) => l.reitId === r.id)!;
                return (
                  <li key={r.id} className="flex items-center gap-1.5">
                    <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: palette[r.colorKey] }} />
                    {r.shortLabel} — {leg.weightPct}%
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <p className="mb-3 text-sm text-ink">Invested vs. portfolio value over time, with annual distributions</p>
            <GrowthWithIncomeChart
              data={[...result.yearlyRows]}
              ariaLabel="Cumulative amount invested versus the blended REIT portfolio's value, year by year, with that year's own gross distributions as bars on a secondary axis"
            />
          </div>

          <div>
            <p className="mb-3 text-sm text-ink">Distribution composition over the full horizon</p>
            <BreakdownBarChart
              data={[
                { label: 'Interest', value: result.blendedComponentTotals.interest, color: palette.rust },
                { label: 'Dividend', value: result.blendedComponentTotals.dividend, color: palette.moss },
                { label: 'Rental', value: result.blendedComponentTotals.rental, color: palette.ochre },
                { label: 'Return of capital', value: result.blendedComponentTotals.returnOfCapital, color: palette.ink },
              ]}
              ariaLabel="Total distributions received over the horizon, split into interest, dividend, rental and return-of-capital components"
            />
          </div>

          <Callout tone="warning">
            Short, skewed track records: Nexus (listed 2023) and Knowledge Realty (listed 2025) have only a few years or quarters of history, largely spanning a post-pandemic office/retail recovery. A blend weighted toward them is not a forward guarantee of the same returns — the NAV-growth defaults above are already haircut below the trailing price CAGR for this reason; raise them only deliberately.
          </Callout>

          <p className="max-w-xl text-sm text-ink-muted">
            This shows distributions received and mark-to-market NAV value — it does not model selling the units and paying exit capital-gains tax, or your household&rsquo;s actual marginal rate on the taxable distribution income above.
          </p>
        </section>
      )}
    </CalcShell>
  );
}
