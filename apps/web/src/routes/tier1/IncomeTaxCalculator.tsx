import { useMemo, useState } from 'react';

import { getIncomeTaxRules } from '@fincalc/data';
import { computeIncomeTax, type AgeBand, type IncomeTaxResult } from '@fincalc/engine';

import { Amount } from '../../components/Amount';
import { CalcShell, NumberField, SelectField, SubmitButton } from '../../components/CalcShell';
import { GroupedComparisonChart } from '../../components/charts';

const FY_OPTIONS = [
  { value: '2026-27', label: 'FY 2026-27' },
  { value: '2025-26', label: 'FY 2025-26' },
];
const AGE_OPTIONS: { value: AgeBand; label: string }[] = [
  { value: 'under60', label: 'Under 60' },
  { value: '60to79', label: '60–79 (senior citizen)' },
  { value: '80plus', label: '80+ (super senior)' },
];

/**
 * Tier 1 module 6 (brief §3): old vs new regime, both shipped FYs, HRA,
 * 80C/80D/24(b) under the old regime, standard deduction, surcharge and
 * cess — all read straight off `computeIncomeTax` (Phase 2), run twice
 * (once per regime) so the calculator answers the actual old-vs-new
 * question rather than requiring the user to flip a toggle and remember
 * the other number.
 */
export function IncomeTaxCalculator() {
  const [fy, setFy] = useState('2026-27');
  const [age, setAge] = useState<AgeBand>('under60');
  const [grossSalary, setGrossSalary] = useState(1_800_000);
  const [otherSourcesIncome, setOtherSourcesIncome] = useState(0);
  const [rentPaidAnnual, setRentPaidAnnual] = useState(0);
  const [isMetro, setIsMetro] = useState(true);
  const [section80c, setSection80c] = useState(150_000);
  const [selfAndFamilyPremium, setSelfAndFamilyPremium] = useState(0);
  const [selfOccupiedHomeLoanInterest, setSelfOccupiedHomeLoanInterest] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  const result = useMemo(() => {
    if (!submitted) return null;
    const rules = getIncomeTaxRules(fy);
    const oldRegime: IncomeTaxResult = computeIncomeTax(
      {
        regime: 'old',
        age,
        grossSalary,
        otherSourcesIncome,
        ...(rentPaidAnnual > 0
          ? { hra: { basicSalaryAnnual: grossSalary * 0.5, hraReceivedAnnual: grossSalary * 0.2, rentPaidAnnual, isMetro } }
          : {}),
        section80c,
        ...(selfAndFamilyPremium > 0 ? { section80d: { selfAndFamilyPremium } } : {}),
        selfOccupiedHomeLoanInterest,
      },
      rules,
    );
    const newRegime: IncomeTaxResult = computeIncomeTax(
      { regime: 'new', age, grossSalary, otherSourcesIncome },
      rules,
    );

    const chartData = [
      { metric: 'Taxable income', a: oldRegime.taxableIncome, b: newRegime.taxableIncome },
      { metric: 'Total tax payable', a: oldRegime.totalTaxPayable, b: newRegime.totalTaxPayable },
    ];

    return {
      oldRegime,
      newRegime,
      better: oldRegime.totalTaxPayable <= newRegime.totalTaxPayable ? 'old' : 'new',
      chartData,
    } as const;
  }, [submitted, fy, age, grossSalary, otherSourcesIncome, rentPaidAnnual, isMetro, section80c, selfAndFamilyPremium, selfOccupiedHomeLoanInterest]);

  return (
    <CalcShell
      title="Income tax: old vs new regime"
      subtitle="Both regimes, side by side, for the FY you pick — HRA, Section 80C/80D, and self-occupied home-loan interest all apply under the old regime only, per current law."
      form={
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(true);
          }}
        >
          <SelectField label="Financial year" value={fy} onChange={setFy} options={FY_OPTIONS} />
          <SelectField label="Age" value={age} onChange={setAge} options={AGE_OPTIONS} />
          <NumberField label="Gross salary, annual" value={grossSalary} onChange={setGrossSalary} step={10000} />
          <NumberField label="Other income (interest, etc.), annual" value={otherSourcesIncome} onChange={setOtherSourcesIncome} step={10000} required={false} />
          <NumberField label="Rent paid, annual (for HRA, old regime)" value={rentPaidAnnual} onChange={setRentPaidAnnual} step={10000} required={false} />
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={isMetro} onChange={(e) => setIsMetro(e.target.checked)} className="accent-rust" />
            Metro city (Delhi, Mumbai, Kolkata, Chennai) — 50% HRA exemption cap instead of 40%
          </label>
          <NumberField label="Section 80C investment, annual (old regime)" value={section80c} onChange={setSection80c} step={10000} required={false} />
          <NumberField label="Health insurance premium, self &amp; family (Section 80D, old regime)" value={selfAndFamilyPremium} onChange={setSelfAndFamilyPremium} step={5000} required={false} />
          <NumberField label="Self-occupied home-loan interest (Section 24(b), old regime)" value={selfOccupiedHomeLoanInterest} onChange={setSelfOccupiedHomeLoanInterest} step={10000} required={false} />
          <SubmitButton>Calculate →</SubmitButton>
        </form>
      }
    >
      {result && (
        <section className="flex max-w-lg flex-col gap-8" aria-label="Income tax result">
          <p className="font-serif-heading max-w-md text-2xl leading-snug text-ink sm:text-3xl">
            The <span className="text-rust">{result.better} regime</span> is cheaper for these numbers, by{' '}
            <Amount value={Math.abs(result.oldRegime.totalTaxPayable - result.newRegime.totalTaxPayable)} className="text-rust" />.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[320px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-ink-muted">
                  <th className="py-2 pr-3 font-normal"></th>
                  <th className="py-2 pr-3 font-normal">Old regime</th>
                  <th className="py-2 pr-3 font-normal">New regime</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ['Standard deduction', 'standardDeduction'],
                    ['HRA exemption', 'hraExemption'],
                    ['Section 80C', 'section80cDeduction'],
                    ['Section 80D', 'section80dDeduction'],
                    ['Section 24(b) interest', 'section24bDeduction'],
                    ['Taxable income', 'taxableIncome'],
                    ['Tax at slab rates', 'taxAtSlabRates'],
                    ['Rebate (87A)', 'rebate87A'],
                    ['Surcharge', 'surcharge'],
                    ['Cess', 'cess'],
                  ] as const
                ).map(([label, key]) => (
                  <tr key={key} className="border-b border-hairline/60">
                    <td className="py-2 pr-3 align-top text-ink-muted">{label}</td>
                    <td className="py-2 pr-3 align-top"><Amount value={result.oldRegime[key]} className="text-ink" /></td>
                    <td className="py-2 pr-3 align-top"><Amount value={result.newRegime[key]} className="text-ink" /></td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2 pr-3 align-top text-ink">Total tax payable</td>
                  <td className="py-2 pr-3 align-top"><Amount value={result.oldRegime.totalTaxPayable} compact={false} className="font-medium text-ink" /></td>
                  <td className="py-2 pr-3 align-top"><Amount value={result.newRegime.totalTaxPayable} compact={false} className="font-medium text-ink" /></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div>
            <p className="mb-3 text-sm text-ink">Old vs. new regime, side by side</p>
            <GroupedComparisonChart
              data={result.chartData}
              seriesAName="Old regime"
              seriesBName="New regime"
              ariaLabel="Taxable income and total tax payable, old regime versus new regime"
            />
          </div>
        </section>
      )}
    </CalcShell>
  );
}
