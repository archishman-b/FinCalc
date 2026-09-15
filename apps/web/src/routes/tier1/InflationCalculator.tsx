import { useMemo, useState } from 'react';

import { compoundLumpsum, deflateToToday, realRate } from '@fincalc/engine';

import { Amount } from '../../components/Amount';
import { CalcShell, NumberField, SubmitButton } from '../../components/CalcShell';

/**
 * General (all-India) CPI inflation, August 2026: 4.82% year-on-year —
 * Ministry of Statistics and Programme Implementation (MoSPI) release,
 * cross-checked against rateinflation.com's tracker of the same PIB
 * figure. Category-specific sub-indices (education, healthcare), which
 * the brief also asks for, could not be found from a currently-notified
 * MoSPI/PIB source in this research pass — rather than ship a guessed
 * number for either, this calculator ships only the one sourced figure
 * as a starting point and lets the user type their own rate for any
 * category, labelling it themselves. Flagged as an open item, same as
 * this project's other documented research gaps.
 */
const GENERAL_CPI_RATE_PCT = 4.82;

/** Tier 1 module 8 (brief §3): inflating a today's-rupee amount forward, and the real (inflation-adjusted) return on an investment — both direct reads off `compoundLumpsum`/`deflateToToday`/`realRate` (Phase 1). */
export function InflationCalculator() {
  const [amountToday, setAmountToday] = useState(1_000_000);
  const [category, setCategory] = useState('General CPI');
  const [inflationPct, setInflationPct] = useState(GENERAL_CPI_RATE_PCT);
  const [years, setYears] = useState(10);
  const [nominalReturnPct, setNominalReturnPct] = useState(11);
  const [submitted, setSubmitted] = useState(false);

  const result = useMemo(() => {
    if (!submitted) return null;
    const inflation = inflationPct / 100;
    const months = Math.round(years * 12);
    const futureCost = compoundLumpsum(amountToday, inflation, months);
    const realValueOfFutureCost = deflateToToday(futureCost, inflation, months);
    const real = realRate(nominalReturnPct / 100, inflation);
    return { futureCost, realValueOfFutureCost, real };
  }, [submitted, amountToday, inflationPct, years, nominalReturnPct]);

  return (
    <CalcShell
      title="Inflation & real return"
      subtitle="What today's rupees will cost in the future, and what an investment's return is actually worth once inflation is netted out."
    >
      <form
        className="mt-8 flex max-w-sm flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(true);
        }}
      >
        <NumberField label="Amount, today's rupees" value={amountToday} onChange={setAmountToday} step={10000} />
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink">Category (for your own reference)</span>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-sm border border-hairline bg-paper px-3 py-2 text-ink"
          />
        </label>
        <NumberField
          label="Inflation rate, annual (%)"
          hint={`General CPI (Aug 2026, MoSPI): ${GENERAL_CPI_RATE_PCT}% — education/healthcare sub-indices aren't sourced yet; enter your own assumption.`}
          value={inflationPct}
          onChange={setInflationPct}
          step={0.01}
          min={0}
          max={30}
        />
        <NumberField label="Years" value={years} onChange={setYears} step={1} min={1} max={50} />
        <NumberField label="An investment's nominal return, annual (%) — for the real-return figure below" value={nominalReturnPct} onChange={setNominalReturnPct} step={0.5} min={-20} max={40} required={false} />
        <SubmitButton>Calculate →</SubmitButton>
      </form>

      {result && (
        <section className="mt-14 flex max-w-md flex-col gap-8" aria-label="Inflation result">
          <div>
            <p className="text-sm text-ink-muted">{category || 'This'} will cost, in {years} years</p>
            <Amount value={result.futureCost} compact={false} className="font-serif-heading text-4xl text-rust" />
          </div>
          <dl className="grid grid-cols-2 gap-y-4 text-sm">
            <dt className="text-ink-muted">That future cost, in today&rsquo;s purchasing power</dt>
            <dd className="text-right"><Amount value={result.realValueOfFutureCost} className="text-ink" /></dd>
            <dt className="text-ink-muted">Real return at {nominalReturnPct}% nominal, {inflationPct}% inflation</dt>
            <dd className={`text-right font-mono tabular-nums ${result.real >= 0 ? 'text-moss' : 'text-ochre'}`}>{(result.real * 100).toFixed(2)}%</dd>
          </dl>
        </section>
      )}
    </CalcShell>
  );
}
