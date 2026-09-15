import { useMemo, useState } from 'react';

import { getFixedIncomeRules, type FixedIncomeProduct } from '@fincalc/data';
import { annualContributionFutureValue, compoundAnnualContributions, compoundAnnually, compoundAtFrequency } from '@fincalc/engine';

import { Amount } from '../../components/Amount';
import { CalcShell, NumberField, SelectField, SubmitButton } from '../../components/CalcShell';

const RULES = getFixedIncomeRules();
const PRODUCT_IDS = Object.keys(RULES.products);
const PRODUCT_OPTIONS = PRODUCT_IDS.map((id) => ({ value: id, label: RULES.products[id]!.label }));

// Products whose interest is paid out periodically rather than compounded
// back into the balance (see each product's own `notes` in the data pack):
// SCSS pays quarterly, POMIS pays monthly. Modelled as simple, non-
// compounding interest over the tenure rather than run through any of the
// compounding primitives below.
const PAYOUT_PRODUCTS = new Set(['scss', 'pomis']);

const FREQUENCY: Record<FixedIncomeProduct['compounding'], number> = { annual: 1, quarterly: 4, monthly: 12 };

/**
 * Tier 1 module 5 (brief §3): FD, RD, PPF, SSY, EPF, VPF, NSC (plus KVP,
 * SCSS, POMIS and the Post Office Time Deposit ladder, shipped in the same
 * `fixed-income` data pack) — current rates and lock-in rules, sourced and
 * cited (see the pack's own citations, Phase 6).
 *
 * Compounding is genuinely product-shape-dependent, not one formula: a
 * lumpsum product compounding quarterly (Post Office Time Deposit) needs
 * `compoundAtFrequency`; PPF/SSY's annual-contribution/annual-compounding
 * shape needs `compoundAnnualContributions`; EPF/VPF/RD have a monthly
 * contribution but annually-credited interest — approximated here as 12
 * months of contribution treated as one annual deposit (the same
 * documented simplification the data pack already uses for PPF: deposit
 * early in the year, one annual compounding step), not modelled to the
 * exact monthly-running-balance mechanics real EPF uses. SCSS/POMIS pay
 * interest out rather than compounding it — simple interest over the
 * tenure, principal returned at the end.
 */
export function FixedIncomeCalculator() {
  const [productId, setProductId] = useState('ppf');
  const [amount, setAmount] = useState(150_000);
  const [years, setYears] = useState(15);
  const [submitted, setSubmitted] = useState(false);

  const product = RULES.products[productId]!;

  const result = useMemo(() => {
    if (!submitted) return null;
    const rate = product.rate;

    if (PAYOUT_PRODUCTS.has(productId)) {
      const totalInterest = amount * rate * years;
      return { maturityValue: amount, totalInterest, totalContributed: amount, isPayout: true };
    }

    if (product.contributionMode === 'recurring_annual') {
      const maturityValue = annualContributionFutureValue(amount, rate, years);
      const rows = compoundAnnualContributions(() => amount, () => rate, years);
      const totalContributed = rows.reduce((s, r) => s + r.contribution, 0);
      return { maturityValue, totalInterest: maturityValue - totalContributed, totalContributed, isPayout: false };
    }

    if (product.contributionMode === 'recurring_monthly') {
      const annualDeposit = amount * 12;
      const maturityValue = annualContributionFutureValue(annualDeposit, rate, years);
      const totalContributed = annualDeposit * years;
      return { maturityValue, totalInterest: maturityValue - totalContributed, totalContributed, isPayout: false };
    }

    // lumpsum or flexible (POSA)
    const periodsPerYear = FREQUENCY[product.compounding];
    const maturityValue =
      periodsPerYear === 1 ? compoundAnnually(amount, rate, years) : compoundAtFrequency(amount, rate, years, periodsPerYear);
    return { maturityValue, totalInterest: maturityValue - amount, totalContributed: amount, isPayout: false };
  }, [submitted, productId, amount, years, product]);

  return (
    <CalcShell
      title="Fixed income: FD, RD, PPF, SSY, EPF, VPF, NSC & more"
      subtitle="Government small-savings schemes, EPF/VPF and the Post Office rate ladder — current rates, lock-in and tax treatment, all sourced and dated."
    >
      <form
        className="mt-8 flex max-w-sm flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(true);
        }}
      >
        <SelectField label="Product" value={productId} onChange={setProductId} options={PRODUCT_OPTIONS} />
        <NumberField
          label={
            product.contributionMode === 'recurring_annual'
              ? 'Annual contribution'
              : product.contributionMode === 'recurring_monthly'
                ? 'Monthly contribution'
                : 'Amount'
          }
          hint={product.minContribution ? `Minimum ${product.minContribution.toLocaleString('en-IN')} — shown for reference, not enforced by this field.` : undefined}
          value={amount}
          onChange={setAmount}
          // Deliberately min={0}, not product.minContribution: the real
          // minimum varies by product (₹250 for SSY, ₹1,000 for NSC, none
          // for EPF...) and a nonzero min that doesn't share a step-aligned
          // offset with this field's fixed step breaks native HTML5
          // validation the same way the EMI/loan-tenure fields did (Phase
          // 6) — the real minimum is shown as a hint instead.
          min={0}
          max={product.maxContributionPerYear ?? undefined}
        />
        <NumberField label="Years" value={years} onChange={setYears} step={1} min={1} max={40} />

        <div className="rounded-sm border border-hairline px-4 py-3 text-xs text-ink-muted">
          <p>
            Rate: <span className="font-mono tabular-nums text-ink">{(product.rate * 100).toFixed(2)}%</span> · Compounding: {product.compounding} ·{' '}
            {product.tenureYears ? `Typical tenure: ${product.tenureYears.toFixed(1)} years · ` : ''}
            {product.lockInYears !== null ? `Lock-in: ${product.lockInYears} years · ` : ''}
            {product.section80C ? 'Section 80C eligible' : 'Not Section 80C eligible'}
          </p>
          {product.notes && <p className="mt-2">{product.notes}</p>}
        </div>

        <SubmitButton>Calculate →</SubmitButton>
      </form>

      {result && (
        <section className="mt-14 flex max-w-md flex-col gap-8" aria-label="Fixed income result">
          <div>
            <p className="text-sm text-ink-muted">{result.isPayout ? 'Principal returned at maturity' : 'Maturity value'}</p>
            <Amount value={result.maturityValue} compact={false} className="font-serif-heading text-4xl text-rust" />
          </div>
          <dl className="grid grid-cols-2 gap-y-4 text-sm">
            <dt className="text-ink-muted">{result.isPayout ? 'Total interest paid out over the tenure' : 'Total interest earned'}</dt>
            <dd className="text-right"><Amount value={result.totalInterest} className="text-moss" /></dd>
            <dt className="text-ink-muted">Total contributed</dt>
            <dd className="text-right"><Amount value={result.totalContributed} className="text-ink" /></dd>
          </dl>
        </section>
      )}
    </CalcShell>
  );
}
