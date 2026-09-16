import { useMemo, useState } from 'react';

import { amortize, emi as emiOf } from '@fincalc/engine';

import { Amount } from '../../components/Amount';
import { CalcShell, NumberField, SubmitButton } from '../../components/CalcShell';
import { AmortizationChart } from '../../components/charts';

/**
 * Tier 1 module 1 (brief §3): reducing-balance EMI, the EMI/tenure
 * trade-off, a one-time prepayment, a step-up EMI, and total interest
 * outgo — all variations on `amortize()`/`emi()` (Phase 1), never a
 * separate calculation each.
 *
 * Phase 9.1: the amortisation schedule — until now only summarised as
 * three numbers — is now also the chart the brief and the user both
 * asked for: principal vs. interest paid each year, with the declining
 * balance overlaid, read straight off the same monthly `rows` the
 * summary numbers are computed from (yearlyRows below), never a second
 * approximation of the schedule.
 */
export function EmiCalculator() {
  const [principal, setPrincipal] = useState(5_000_000);
  const [ratePct, setRatePct] = useState(8.5);
  const [tenureYears, setTenureYears] = useState(20);
  const [stepUpPct, setStepUpPct] = useState(0);
  const [prepayAmount, setPrepayAmount] = useState(0);
  const [prepayYear, setPrepayYear] = useState(5);
  const [submitted, setSubmitted] = useState(false);

  const result = useMemo(() => {
    if (!submitted) return null;
    const annualRate = ratePct / 100;
    const tenureMonths = Math.round(tenureYears * 12);
    const baseEmi = emiOf(principal, annualRate, tenureMonths);
    const stepUp = stepUpPct / 100;

    const rows = amortize({
      principal,
      annualRate: () => annualRate,
      scheduledPayment: (month) => baseEmi * Math.pow(1 + stepUp, Math.floor((month - 1) / 12)),
      ...(prepayAmount > 0
        ? { extraPrepayment: (month: number) => (month === Math.round(prepayYear * 12) ? prepayAmount : 0) }
        : {}),
      months: tenureMonths,
    });

    const baselineRows =
      prepayAmount > 0 || stepUpPct > 0
        ? amortize({ principal, annualRate: () => annualRate, scheduledPayment: () => baseEmi, months: tenureMonths })
        : rows;

    const totalInterest = rows.reduce((sum, r) => sum + r.interest, 0);
    const totalPayment = rows.reduce((sum, r) => sum + r.totalPayment, 0);
    const baselineInterest = baselineRows.reduce((sum, r) => sum + r.interest, 0);
    const payoffMonth = rows.findIndex((r) => r.closingBalance <= 0.01) + 1 || rows.length;
    const firstYearEmi = rows[0]?.totalPayment ?? baseEmi;
    const lastEmiRow = rows[Math.min(rows.length, payoffMonth) - 1];

    // Yearly aggregation for the chart: principal repaid (scheduled + any
    // prepayment) and interest paid, summed within each 12-month block,
    // plus the balance outstanding at that year's close — the same
    // `rows` the headline numbers above are computed from, just grouped.
    const paidRows = rows.slice(0, payoffMonth);
    const yearlyRows: { year: number; principal: number; interest: number; balance: number }[] = [];
    for (let i = 0; i < paidRows.length; i += 12) {
      const chunk = paidRows.slice(i, i + 12);
      const year = Math.floor(i / 12) + 1;
      yearlyRows.push({
        year,
        principal: chunk.reduce((s, r) => s + r.scheduledPrincipal + r.prepayment, 0),
        interest: chunk.reduce((s, r) => s + r.interest, 0),
        balance: Math.max(0, chunk[chunk.length - 1]?.closingBalance ?? 0),
      });
    }

    return {
      baseEmi,
      firstYearEmi,
      lastMonthPayment: lastEmiRow?.totalPayment ?? baseEmi,
      totalInterest,
      totalPayment,
      payoffMonth,
      tenureMonths,
      interestSaved: baselineInterest - totalInterest,
      hasModification: prepayAmount > 0 || stepUpPct > 0,
      yearlyRows,
    };
  }, [submitted, principal, ratePct, tenureYears, stepUpPct, prepayAmount, prepayYear]);

  return (
    <CalcShell
      title="EMI calculator"
      subtitle="Reducing-balance EMI, with an optional one-time prepayment and step-up EMI — see exactly what each does to your total interest."
      form={
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(true);
          }}
        >
          <NumberField label="Loan amount" value={principal} onChange={setPrincipal} step={10000} />
          <NumberField label="Interest rate, annual (%)" value={ratePct} onChange={setRatePct} step={0.05} min={0} max={30} />
          <NumberField label="Tenure (years)" value={tenureYears} onChange={setTenureYears} step={1} min={1} max={35} />
          <NumberField
            label="Step-up per year (%, optional)"
            hint="EMI itself rises by this much every 12 months — a common 'step-up EMI' product."
            value={stepUpPct}
            onChange={setStepUpPct}
            step={1}
            min={0}
            max={50}
            required={false}
          />
          <NumberField
            label="One-time prepayment (₹, optional)"
            value={prepayAmount}
            onChange={setPrepayAmount}
            step={50000}
            required={false}
          />
          {prepayAmount > 0 && (
            <NumberField label="Prepayment in year" value={prepayYear} onChange={setPrepayYear} step={1} min={1} max={tenureYears} />
          )}
          <SubmitButton>Calculate →</SubmitButton>
        </form>
      }
    >
      {result && (
        <section className="flex flex-col gap-8" aria-label="EMI result">
          <div>
            <p className="text-sm text-ink-muted">Monthly EMI</p>
            <Amount value={result.baseEmi} compact={false} className="font-serif-heading text-4xl text-rust" />
            {result.hasModification && result.lastMonthPayment !== result.baseEmi && (
              <p className="mt-1 text-sm text-ink-muted">
                rising to <Amount value={result.lastMonthPayment} compact={false} className="text-ink" /> by the final
                instalment
              </p>
            )}
          </div>

          <dl className="grid max-w-md grid-cols-2 gap-y-4 text-sm">
            <dt className="text-ink-muted">Total interest paid</dt>
            <dd className="text-right"><Amount value={result.totalInterest} className="text-ink" /></dd>
            <dt className="text-ink-muted">Total repaid (principal + interest)</dt>
            <dd className="text-right"><Amount value={result.totalPayment} className="text-ink" /></dd>
            <dt className="text-ink-muted">Loan closes in</dt>
            <dd className="text-right font-mono tabular-nums text-ink">
              {(result.payoffMonth / 12).toFixed(1)} years{result.payoffMonth < result.tenureMonths ? ' (early)' : ''}
            </dd>
            {result.hasModification && (
              <>
                <dt className="text-ink-muted">Interest saved vs. a plain level EMI</dt>
                <dd className="text-right">
                  <Amount value={result.interestSaved} className={result.interestSaved >= 0 ? 'text-moss' : 'text-ochre'} />
                </dd>
              </>
            )}
          </dl>

          <div>
            <p className="mb-3 text-sm text-ink">Amortisation schedule</p>
            <AmortizationChart data={result.yearlyRows} />
          </div>
        </section>
      )}
    </CalcShell>
  );
}
