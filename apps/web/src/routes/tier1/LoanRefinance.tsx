import { useMemo, useState } from 'react';

import { amortize, emi as emiOf } from '@fincalc/engine';

import { Amount } from '../../components/Amount';
import { Callout, CalcShell, NumberField, SubmitButton } from '../../components/CalcShell';

/**
 * Tier 1 module 2 (brief §3): the refinance break-even month including
 * processing fees, and the "lower EMI, longer tenure" trap shown in
 * rupees of extra interest — both read directly off two `amortize()` runs
 * over the same outstanding principal, never a bespoke formula.
 */
export function LoanRefinance() {
  const [outstandingPrincipal, setOutstandingPrincipal] = useState(7_500_000);
  const [currentRatePct, setCurrentRatePct] = useState(9.5);
  const [remainingTenureYears, setRemainingTenureYears] = useState(15);
  const [newRatePct, setNewRatePct] = useState(8.3);
  const [newTenureYears, setNewTenureYears] = useState(15);
  const [processingFee, setProcessingFee] = useState(15_000);
  const [submitted, setSubmitted] = useState(false);

  const result = useMemo(() => {
    if (!submitted) return null;
    const remainingMonths = Math.round(remainingTenureYears * 12);
    const newMonths = Math.round(newTenureYears * 12);

    const currentEmi = emiOf(outstandingPrincipal, currentRatePct / 100, remainingMonths);
    const currentRows = amortize({
      principal: outstandingPrincipal,
      annualRate: () => currentRatePct / 100,
      scheduledPayment: () => currentEmi,
      months: remainingMonths,
    });
    const currentTotalInterest = currentRows.reduce((s, r) => s + r.interest, 0);

    const newEmi = emiOf(outstandingPrincipal, newRatePct / 100, newMonths);
    const newRows = amortize({
      principal: outstandingPrincipal,
      annualRate: () => newRatePct / 100,
      scheduledPayment: () => newEmi,
      months: newMonths,
    });
    const newTotalInterest = newRows.reduce((s, r) => s + r.interest, 0);

    const monthlySaving = currentEmi - newEmi;
    const breakEvenMonths = monthlySaving > 0 ? processingFee / monthlySaving : null;
    const interestDelta = newTotalInterest - currentTotalInterest;
    const isTrap = newMonths > remainingMonths && interestDelta > 0 && monthlySaving > 0;

    return { currentEmi, newEmi, currentTotalInterest, newTotalInterest, monthlySaving, breakEvenMonths, interestDelta, isTrap, remainingMonths, newMonths };
  }, [submitted, outstandingPrincipal, currentRatePct, remainingTenureYears, newRatePct, newTenureYears, processingFee]);

  return (
    <CalcShell
      title="Loan comparison & refinance"
      subtitle="See the refinance break-even month after processing fees — and whether a lower EMI on a longer tenure is actually costing you more."
    >
      <form
        className="mt-8 flex max-w-sm flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(true);
        }}
      >
        <NumberField label="Outstanding principal" value={outstandingPrincipal} onChange={setOutstandingPrincipal} step={10000} />
        <NumberField label="Current rate, annual (%)" value={currentRatePct} onChange={setCurrentRatePct} step={0.05} min={0} max={30} />
        <NumberField label="Remaining tenure (years)" value={remainingTenureYears} onChange={setRemainingTenureYears} step={1} min={1} max={35} />
        <div className="border-t border-hairline pt-5">
          <p className="mb-3 text-sm text-ink">Refinance offer</p>
          <div className="flex flex-col gap-5">
            <NumberField label="New rate, annual (%)" value={newRatePct} onChange={setNewRatePct} step={0.05} min={0} max={30} />
            <NumberField label="New tenure (years)" value={newTenureYears} onChange={setNewTenureYears} step={1} min={1} max={35} />
            <NumberField label="Processing fee" value={processingFee} onChange={setProcessingFee} step={1000} required={false} />
          </div>
        </div>
        <SubmitButton>Compare →</SubmitButton>
      </form>

      {result && (
        <section className="mt-14 flex max-w-md flex-col gap-8" aria-label="Refinance result">
          <dl className="grid grid-cols-3 gap-y-4 text-sm">
            <dt className="text-ink-muted">EMI</dt>
            <dd className="text-right"><Amount value={result.currentEmi} compact={false} className="text-ink" /></dd>
            <dd className="text-right"><Amount value={result.newEmi} compact={false} className="text-rust" /></dd>
            <dt className="text-ink-muted">Total interest, from today</dt>
            <dd className="text-right"><Amount value={result.currentTotalInterest} className="text-ink" /></dd>
            <dd className="text-right"><Amount value={result.newTotalInterest} className="text-rust" /></dd>
          </dl>

          <div>
            <p className="text-sm text-ink-muted">Monthly saving</p>
            <Amount value={result.monthlySaving} compact={false} className="font-serif-heading text-3xl text-ink" />
            {result.breakEvenMonths !== null ? (
              <p className="mt-1 text-sm text-ink-muted">
                Break-even on the processing fee: <span className="font-mono tabular-nums text-ink">{result.breakEvenMonths.toFixed(1)} months</span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-ink-muted">The new EMI isn&rsquo;t lower, so there&rsquo;s no fee to break even on from monthly cash flow alone.</p>
            )}
          </div>

          {result.isTrap && (
            <Callout>
              ⚠ The new EMI is lower, but the longer tenure means <Amount value={result.interestDelta} className="text-ink" /> more
              total interest over the life of the loan — the classic &ldquo;lower EMI, longer tenure&rdquo; trap.
            </Callout>
          )}
          {!result.isTrap && result.interestDelta < 0 && (
            <Callout tone="positive">
              Refinancing saves <Amount value={-result.interestDelta} className="text-ink" /> in total interest as well as{' '}
              <Amount value={result.monthlySaving} className="text-ink" />/month.
            </Callout>
          )}
        </section>
      )}
    </CalcShell>
  );
}
