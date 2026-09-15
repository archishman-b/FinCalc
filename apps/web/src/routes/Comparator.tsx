import { useMemo, useState } from 'react';

import { formatINR } from '@fincalc/ui';

import { Amount } from '../components/Amount';
import { ResultChart } from '../components/ResultChart';
import {
  buildLayerOneComparison,
  computeHurdleSentence,
  HORIZON_OPTIONS,
  SUPPORTED_CITIES,
  type HorizonYears,
  type LayerOneResult,
} from '../lib/scenario-builder';
import { navigate } from '../lib/router';

/** Layer 1 (brief §4): six inputs at most, a real answer in about a minute. This flow uses four — city, household income, housing budget, horizon — exactly what the brief specifies, with everything else defaulted and shown in the assumptions strip below the result. */
export function Comparator() {
  const [monthlyIncome, setMonthlyIncome] = useState(450_000);
  const [monthlyBudget, setMonthlyBudget] = useState(155_000);
  const [horizonYears, setHorizonYears] = useState<HorizonYears>(15);
  const [submitted, setSubmitted] = useState(false);

  // A single discriminated result rather than a value plus a setState-in-useMemo
  // side effect: buildLayerOneComparison can throw on degenerate inputs (see
  // its own RangeError guards), and deriving both the success and failure
  // case from one memo keeps this a pure render-time computation.
  const outcome = useMemo<{ ok: true; value: LayerOneResult } | { ok: false; error: string } | null>(() => {
    if (!submitted) return null;
    try {
      const value = buildLayerOneComparison({
        city: 'hyderabad',
        monthlyHouseholdIncomeNet: monthlyIncome,
        monthlyHousingBudget: monthlyBudget,
        horizonYears,
      });
      return { ok: true, value };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something about these numbers didn't compute. Try different values.";
      return { ok: false, error: message };
    }
  }, [submitted, monthlyIncome, monthlyBudget, horizonYears]);

  const layerOne = outcome?.ok ? outcome.value : null;
  const error = outcome && !outcome.ok ? outcome.error : null;
  const hurdle = useMemo(() => (layerOne ? computeHurdleSentence(layerOne) : null), [layerOne]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 py-10 sm:px-8">
      <button
        type="button"
        onClick={() => navigate('home')}
        className="w-fit text-sm text-ink-muted hover:text-rust focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rust"
      >
        ← FinCalc
      </button>

      <h1 className="mt-8 text-3xl leading-tight text-ink sm:text-4xl">Where should this money go?</h1>
      <p className="mt-3 max-w-md text-ink-muted">
        We&rsquo;ll size a representative home your budget can support, and compare buying it against renting an equivalent
        home and investing the difference — on equal monthly outflow, after tax.
      </p>

      <form
        className="mt-8 flex max-w-sm flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(true);
        }}
      >
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink">City</span>
          <select
            className="rounded-sm border border-hairline bg-paper px-3 py-2 text-ink"
            defaultValue={SUPPORTED_CITIES[0].id}
            disabled
          >
            {SUPPORTED_CITIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-ink-muted">More cities as stamp-duty data ships.</span>
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink">Household income, per month (take-home)</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1000}
            required
            value={monthlyIncome}
            onChange={(e) => setMonthlyIncome(Number(e.target.value))}
            className="rounded-sm border border-hairline bg-paper px-3 py-2 font-mono tabular-nums text-ink"
          />
          <span className="text-xs text-ink-muted">{formatINR(monthlyIncome, { compact: true })}/month</span>
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink">Monthly housing budget</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1000}
            required
            value={monthlyBudget}
            onChange={(e) => setMonthlyBudget(Number(e.target.value))}
            className="rounded-sm border border-hairline bg-paper px-3 py-2 font-mono tabular-nums text-ink"
          />
          <span className="text-xs text-ink-muted">{formatINR(monthlyBudget, { compact: true })}/month</span>
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink">Horizon</span>
          <select
            className="rounded-sm border border-hairline bg-paper px-3 py-2 text-ink"
            value={horizonYears}
            onChange={(e) => setHorizonYears(Number(e.target.value) as HorizonYears)}
          >
            {HORIZON_OPTIONS.map((y) => (
              <option key={y} value={y}>
                {y} years
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          className="mt-2 w-fit rounded-sm bg-rust px-5 py-2.5 text-paper hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rust"
        >
          Compare scenarios →
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-8 max-w-md rounded-sm border border-ochre bg-ochre/10 px-4 py-3 text-sm text-ink">
          {error}
        </p>
      )}

      {layerOne && <ComparatorResult layerOne={layerOne} hurdleText={hurdle} horizonYears={horizonYears} />}

      <footer className="mt-16 max-w-md space-y-1 text-sm text-ink-muted">
        <p>Runs entirely in your browser. No backend, no accounts, nothing you enter leaves this page.</p>
        <p>Information, not advice — FinCalc is not SEBI- or IRDAI-registered investment advice.</p>
      </footer>
    </main>
  );
}

function ComparatorResult({
  layerOne,
  hurdleText,
  horizonYears,
}: {
  layerOne: LayerOneResult;
  hurdleText: ReturnType<typeof computeHurdleSentence> | null;
  horizonYears: HorizonYears;
}) {
  const { result } = layerOne;

  return (
    <section className="mt-14 flex max-w-2xl flex-col gap-10" aria-label="Comparison result">
      {/* 1. Parity warnings first — brief §4: "If the assumptions aren't symmetric, the user should know that before they read a number." */}
      <div>
        {result.parityWarnings.length === 0 ? (
          <p className="rounded-sm border border-moss/40 bg-moss/10 px-4 py-3 text-sm text-ink">
            Parity check: both scenarios share the same reinvestment rate and no unacknowledged growth-rate asymmetry was
            found.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {result.parityWarnings.map((w, i) => (
              <li key={i} className="rounded-sm border border-ochre bg-ochre/10 px-4 py-3 text-sm text-ink">
                ⚠ {w.message}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 2. The hurdle-rate sentence — the headline output (brief principle 4). */}
      {hurdleText && (
        <p className="font-serif-heading max-w-md text-2xl leading-snug text-ink sm:text-3xl">
          {hurdleText.requiredRate === null ? (
            <>
              At {horizonYears} years, <span className="text-rust">{hurdleText.leadingScenarioName}</span> stays ahead of{' '}
              {hurdleText.laggingScenarioName} across every rate we can solve for in a plausible range.
            </>
          ) : (
            <>
              To match {hurdleText.leadingScenarioName}&rsquo;s outcome at {horizonYears} years,{' '}
              <span className="text-rust">{hurdleText.laggingScenarioName}</span> would need to compound at{' '}
              <span className="font-mono tabular-nums text-rust">{(hurdleText.requiredRate * 100).toFixed(1)}%</span> instead
              of the {(hurdleText.assumedRate * 100).toFixed(1)}% assumed.
            </>
          )}
        </p>
      )}

      {/* 3. One chart. */}
      <ResultChart result={result} horizonsMonths={layerOne.horizonsMonths} />

      {/* Terminal net worth + capital deployed, every horizon. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[320px] border-collapse text-sm">
          <caption className="sr-only">Terminal net worth and capital deployed by horizon</caption>
          <thead>
            <tr className="border-b border-hairline text-left text-ink-muted">
              <th className="py-2 pr-3 font-normal">Horizon</th>
              {result.scenarios.map((s) => (
                <th key={s.scenarioId} className="py-2 pr-3 font-normal">
                  {s.scenarioName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {layerOne.horizonsMonths.map((months, i) => (
              <tr key={months} className="border-b border-hairline/60">
                <td className="py-2 pr-3 align-top text-ink-muted">{months / 12}yr</td>
                {result.scenarios.map((s) => (
                  <td key={s.scenarioId} className="py-2 pr-3 align-top">
                    <Amount value={s.perHorizon[i]!.terminalNetWorth} className="block text-ink" />
                    <span className="mt-0.5 block text-xs text-ink-muted">
                      on <Amount value={s.perHorizon[i]!.capitalDeployedIntoOwnPositions} /> deployed
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* A lightweight version of the Assumptions panel — the full Layer 2 drawer is a later phase, but nothing here is hidden. */}
      <div className="rounded-sm border border-hairline px-4 py-4 text-sm text-ink-muted">
        <p className="mb-2 text-ink">Assumptions used (defaults — editable assumptions are coming in Layer 2)</p>
        <ul className="flex flex-col gap-1">
          {layerOne.assumptions.map((a) => (
            <li key={a.id}>
              {a.label}: <span className="font-mono tabular-nums text-ink">{(a.rate * 100).toFixed(1)}%</span>
            </li>
          ))}
          <li>
            Home loan: <span className="font-mono tabular-nums text-ink">8.5%</span>, 20-year tenure, 80% loan-to-value
          </li>
          <li>
            Sized home: <Amount value={layerOne.buy.propertyPrice} className="text-ink" /> purchase price (
            <Amount value={layerOne.buy.loanPrincipal} /> loan + <Amount value={layerOne.buy.entryCosts} /> stamp duty &amp;
            registration)
          </li>
          <li>
            Assumed rent for an equivalent home: <Amount value={layerOne.rent.assumedMonthlyRent} className="text-ink" />
            /month (3% gross yield)
          </li>
        </ul>
      </div>
    </section>
  );
}
