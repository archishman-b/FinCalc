import { useMemo, useState } from 'react';

import { compoundContributions, compoundLumpsum, deflateToToday, sipFutureValue } from '@fincalc/engine';

import { Amount } from '../../components/Amount';
import { CalcShell, NumberField, SelectField, SubmitButton } from '../../components/CalcShell';
import { GrowthChart } from '../../components/charts';

type Mode = 'sip' | 'stepup' | 'lumpsum' | 'goal';

const MODES: { value: Mode; label: string }[] = [
  { value: 'sip', label: 'SIP (flat monthly)' },
  { value: 'stepup', label: 'Step-up SIP' },
  { value: 'lumpsum', label: 'Lumpsum' },
  { value: 'goal', label: 'Goal SIP (solve the contribution)' },
];

/**
 * Tier 1 module 4 (brief §3): SIP, step-up SIP, lumpsum and goal SIP —
 * one engine mechanism (`compoundContributions`/`compoundLumpsum`,
 * Phase 1) driven by which mode is selected, plus real (inflation-
 * adjusted) output via `deflateToToday` (brief §3: "real as well as
 * nominal"). Goal SIP is a closed form, not a numeric solver: future
 * value is linear in a flat monthly contribution, so the contribution
 * needed for a target corpus is `target / sipFutureValue(1, rate, months)`.
 *
 * Phase 9.1: a year-by-year invested-vs-value series backs the growth
 * chart — for 'stepup' it's read straight off `compoundContributions`'s
 * own monthly rows (aggregated to yearly), and for the other three modes
 * (each a closed-form single number, not a running schedule) it's the
 * same closed form evaluated at every year instead of just the final one.
 */
export function SipCalculator() {
  const [mode, setMode] = useState<Mode>('sip');
  const [amount, setAmount] = useState(25_000);
  const [ratePct, setRatePct] = useState(11);
  const [years, setYears] = useState(15);
  const [stepUpPct, setStepUpPct] = useState(10);
  const [inflationPct, setInflationPct] = useState(6);
  const [submitted, setSubmitted] = useState(false);

  const result = useMemo(() => {
    if (!submitted) return null;
    const rate = ratePct / 100;
    const months = Math.round(years * 12);

    let nominalFV: number;
    let totalInvested: number;
    let solvedMonthlyContribution: number | null = null;
    let yearlyRows: { year: number; invested: number; value: number }[];

    if (mode === 'lumpsum') {
      nominalFV = compoundLumpsum(amount, rate, months);
      totalInvested = amount;
      yearlyRows = Array.from({ length: years }, (_, i) => ({
        year: i + 1,
        invested: amount,
        value: compoundLumpsum(amount, rate, (i + 1) * 12),
      }));
    } else if (mode === 'goal') {
      const unitFV = sipFutureValue(1, rate, months);
      solvedMonthlyContribution = unitFV > 0 ? amount / unitFV : 0;
      nominalFV = amount;
      totalInvested = solvedMonthlyContribution * months;
      const contribution = solvedMonthlyContribution;
      yearlyRows = Array.from({ length: years }, (_, i) => ({
        year: i + 1,
        invested: contribution * (i + 1) * 12,
        value: sipFutureValue(contribution, rate, (i + 1) * 12),
      }));
    } else if (mode === 'stepup') {
      const stepUp = stepUpPct / 100;
      const rows = compoundContributions((month) => amount * Math.pow(1 + stepUp, Math.floor((month - 1) / 12)), () => rate, months);
      nominalFV = rows[rows.length - 1]?.closingValue ?? 0;
      totalInvested = rows.reduce((s, r) => s + r.contribution, 0);
      yearlyRows = [];
      let cumulativeInvested = 0;
      for (let i = 0; i < rows.length; i += 12) {
        const chunk = rows.slice(i, i + 12);
        cumulativeInvested += chunk.reduce((s, r) => s + r.contribution, 0);
        yearlyRows.push({
          year: Math.floor(i / 12) + 1,
          invested: cumulativeInvested,
          value: chunk[chunk.length - 1]?.closingValue ?? 0,
        });
      }
    } else {
      nominalFV = sipFutureValue(amount, rate, months);
      totalInvested = amount * months;
      yearlyRows = Array.from({ length: years }, (_, i) => ({
        year: i + 1,
        invested: amount * (i + 1) * 12,
        value: sipFutureValue(amount, rate, (i + 1) * 12),
      }));
    }

    const realFV = deflateToToday(nominalFV, inflationPct / 100, months);

    return { nominalFV, realFV, totalInvested, wealthGain: nominalFV - totalInvested, solvedMonthlyContribution, yearlyRows };
  }, [submitted, mode, amount, ratePct, years, stepUpPct, inflationPct]);

  return (
    <CalcShell
      title="SIP, step-up SIP, lumpsum & goal calculator"
      subtitle="Nominal and inflation-adjusted (real, today's-rupee) future value for a plain SIP, a step-up SIP, a lumpsum, or solving for the SIP a target corpus needs."
      form={
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(true);
          }}
        >
          <SelectField label="Mode" value={mode} onChange={setMode} options={MODES} />
          <NumberField
            label={mode === 'lumpsum' ? 'Lumpsum amount' : mode === 'goal' ? 'Target corpus' : 'Monthly contribution'}
            value={amount}
            onChange={setAmount}
            // A fixed step regardless of mode: the default (₹25,000) must stay a
            // valid step value across every mode's own default, and this project
            // already hit the class of bug where a per-mode step silently
            // invalidated the un-changed default via HTML5's native step-mismatch
            // validation (see EmiCalculator/LoanRefinance/FixedIncomeCalculator's
            // min/step fixes, Phase 6) — one step value sidesteps it entirely.
            step={1000}
          />
          <NumberField label="Expected return, annual (%)" value={ratePct} onChange={setRatePct} step={0.5} min={0} max={30} />
          <NumberField label="Years" value={years} onChange={setYears} step={1} min={1} max={50} />
          {mode === 'stepup' && (
            <NumberField label="Step-up per year (%)" value={stepUpPct} onChange={setStepUpPct} step={1} min={0} max={50} />
          )}
          <NumberField
            label="Inflation, annual (%, for the real-value figure)"
            value={inflationPct}
            onChange={setInflationPct}
            step={0.5}
            min={0}
            max={20}
            required={false}
          />
          <SubmitButton>Calculate →</SubmitButton>
        </form>
      }
    >
      {result && (
        <section className="flex flex-col gap-8" aria-label="SIP result">
          {result.solvedMonthlyContribution !== null && (
            <div>
              <p className="text-sm text-ink-muted">Monthly SIP needed</p>
              <Amount value={result.solvedMonthlyContribution} compact={false} className="font-serif-heading text-4xl text-rust" />
            </div>
          )}
          <dl className="grid max-w-md grid-cols-2 gap-y-4 text-sm">
            <dt className="text-ink-muted">Future value (nominal)</dt>
            <dd className="text-right"><Amount value={result.nominalFV} className="text-ink" /></dd>
            <dt className="text-ink-muted">Future value in today&rsquo;s rupees (real)</dt>
            <dd className="text-right"><Amount value={result.realFV} className="text-ink" /></dd>
            <dt className="text-ink-muted">Total invested</dt>
            <dd className="text-right"><Amount value={result.totalInvested} className="text-ink" /></dd>
            <dt className="text-ink-muted">Wealth gained</dt>
            <dd className="text-right"><Amount value={result.wealthGain} className="text-moss" /></dd>
          </dl>

          <div>
            <p className="mb-3 text-sm text-ink">Growth over time</p>
            <GrowthChart data={result.yearlyRows} ariaLabel="Invested amount versus resulting value, year by year" />
          </div>
        </section>
      )}
    </CalcShell>
  );
}
