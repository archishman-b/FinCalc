import { useMemo, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { formatINR } from '@fincalc/ui';
import { getEpfRules, getFixedIncomeRules } from '@fincalc/data';
import { simulateEpfVpf, type EpfVpfSimulationResult, type EpfVpfSimulatorInput } from '@fincalc/engine';

import { Card, FieldRow, Segmented, SliderField, Stepper } from '../../components/GraphiteFields';
import { GraphiteModuleHeader, TickerItem, TickerLabel } from '../../components/GraphiteModuleHeader';
import { GRAPHITE_CSS_VARS, graphiteChartColors, useGraphiteTheme, type GraphiteTheme } from '../../lib/graphite-theme';
import { useSharedTaxSettings } from '../../lib/shared-tax-settings';

/**
 * EPF & VPF planner — the third Graphite module (REIT income, SIP & SWP,
 * now this), built from scratch rather than ported from a prototype (no
 * hand-built EPF HTML file exists the way reit-simulator.html and
 * sip-swp-planner.html did) — see claude/pf-nps-research-and-plan.md for
 * the dated research into EPFO's own Member Pension Calculator this module
 * takes its input/output shape from, and claude/decisions-and-workflow.md
 * for the approved outline (Phase 15) this was built against.
 *
 * Follows the same architecture as the other two Graphite modules rather
 * than inventing a fourth pattern: the shared `.graphite` theme and topbar
 * (`lib/graphite-theme.ts`, `components/GraphiteModuleHeader.tsx`), the
 * same five form primitives (`components/GraphiteFields.tsx`), and the
 * household slab rate from `useSharedTaxSettings()` (used here only to
 * estimate the tax on the Budget-2021 taxable-interest slice — EPF/VPF
 * isn't a capital-gains instrument, so none of that hook's gains-rate
 * fields apply). All EPF/EPS mechanics live in `@fincalc/engine`'s
 * `simulateEpfVpf()` — this file is presentation only: it builds that
 * simulator's input directly from form state (the form state IS
 * `EpfVpfSimulatorInput`, with no separate mapping step, since there's no
 * holdings-array-style restructuring needed) and renders the result.
 *
 * Like REIT income and SIP & SWP, this module shows every figure in both
 * nominal (future) and real (today's money) terms via a `showFutureRupees`
 * toggle (Phase 16) — `simulateEpfVpf()` now takes the shared inflation
 * assumption as an input and produces a parallel `...RealInr` figure
 * alongside every nominal one (see that module's own "Nominal vs. real"
 * doc comment for the deflation convention).
 */

function rupee(v: number): string {
  return formatINR(v, { decimals: 0 });
}
function rupeeCompact(v: number): string {
  return formatINR(v, { compact: true, decimals: 2 });
}
function pct(v: number, decimals = 2): string {
  return `${v.toFixed(decimals)}%`;
}

/** Everything `EpfVpfSimulatorInput` needs except `inflationPct`, which comes from the shared tax/inflation store instead of this module's own form state — see `EpfVpfPlanner()`. */
type EpfFormState = Omit<EpfVpfSimulatorInput, 'inflationPct'>;

function defaultFormState(): EpfFormState {
  const epf = getEpfRules();
  const fixedIncome = getFixedIncomeRules();
  return {
    currentAge: 30,
    retirementAge: 58,
    monthlyBasicPlusDaInr: 40_000,
    salaryGrowthPctPerYear: 7,
    employeeContributionRatePct: epf.contribution.employeeRate * 100,
    vpfContributionRatePct: 0,
    employerContributionRatePct: epf.contribution.employerRate * 100,
    wageCeilingInr: epf.contribution.wageCeilingInr,
    epsShareOfEmployerRatePct: epf.contribution.epsShareOfEmployerRate * 100,
    epfInterestRatePct: (fixedIncome.products.epf?.rate ?? 0.0825) * 100,
    openingBalanceInr: 0,
    openingPensionableServiceYears: 0,
    taxableInterestThresholdPerYearInr: epf.taxableInterest.thresholdWithEmployerContributionInr,
    epsPensionDivisor: epf.eps.pensionDivisor,
    epsPensionableSalaryCeilingInr: epf.eps.pensionableSalaryCeilingInr,
    planUntilAge: 85,
  };
}

/* ---------- charts ---------- */

function CorpusChart({ result, showFutureRupees, theme }: { result: EpfVpfSimulationResult; showFutureRupees: boolean; theme: GraphiteTheme }) {
  const colors = graphiteChartColors(theme);
  const data = result.yearly.map((y) => ({
    year: y.year,
    corpus: showFutureRupees ? y.closingBalanceInr : y.closingBalanceRealInr,
    contributed: showFutureRupees ? y.contributedToDateInr : y.contributedToDateRealInr,
  }));
  return (
    <div className="h-72 w-full" role="img" aria-label="EPF/VPF corpus and money contributed to date, by year">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.rule} vertical={false} />
          <XAxis dataKey="year" tickFormatter={(v: number) => `Yr ${v}`} tick={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, fill: colors.ink2 }} axisLine={{ stroke: colors.rule }} tickLine={false} />
          <YAxis tickFormatter={(v: number) => rupeeCompact(v)} tick={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, fill: colors.ink2 }} axisLine={false} tickLine={false} width={64} />
          <Tooltip
            formatter={(v, name) => [rupeeCompact(Number(v)), name === 'corpus' ? 'Corpus (EPF + VPF)' : 'Contributed to date (employee + employer EPF)']}
            labelFormatter={(v) => `Year ${v}`}
            contentStyle={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, background: colors.paper, border: `1px solid ${colors.rule}`, borderRadius: 4 }}
          />
          <Legend formatter={(v) => (v === 'corpus' ? 'Corpus' : 'Contributed to date')} wrapperStyle={{ fontSize: 11.5, fontFamily: 'ui-sans-serif, system-ui, sans-serif' }} />
          <Line isAnimationActive={false} type="monotone" dataKey="corpus" name="corpus" stroke={colors.accent} strokeWidth={2.5} dot={false} />
          <Line isAnimationActive={false} type="monotone" dataKey="contributed" name="contributed" stroke={colors.line2} strokeWidth={1.75} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function ContributionMixChart({ result, showFutureRupees, theme }: { result: EpfVpfSimulationResult; showFutureRupees: boolean; theme: GraphiteTheme }) {
  const colors = graphiteChartColors(theme);
  const data = result.yearly.map((y) => ({
    year: y.year,
    employee: showFutureRupees ? y.employeeContributionThisYearInr : y.employeeContributionThisYearRealInr,
    employerEpf: showFutureRupees ? y.employerEpfContributionThisYearInr : y.employerEpfContributionThisYearRealInr,
    employerEps: showFutureRupees ? y.employerEpsContributionThisYearInr : y.employerEpsContributionThisYearRealInr,
  }));
  const labels: Record<string, string> = { employee: 'Employee (incl. VPF)', employerEpf: 'Employer → EPF', employerEps: 'Employer → EPS' };
  return (
    <div className="h-64 w-full" role="img" aria-label="Employee and employer contributions, split by destination, by year">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.rule} vertical={false} />
          <XAxis dataKey="year" tickFormatter={(v: number) => `Yr ${v}`} tick={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, fill: colors.ink2 }} axisLine={{ stroke: colors.rule }} tickLine={false} />
          <YAxis tickFormatter={(v: number) => rupeeCompact(v)} tick={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, fill: colors.ink2 }} axisLine={false} tickLine={false} width={60} />
          <Tooltip formatter={(v, name) => [rupeeCompact(Number(v)), labels[String(name)] ?? String(name)]} labelFormatter={(v) => `Year ${v}`} contentStyle={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, background: colors.paper, border: `1px solid ${colors.rule}`, borderRadius: 4 }} />
          <Legend formatter={(v) => labels[v] ?? v} wrapperStyle={{ fontSize: 11.5, fontFamily: 'ui-sans-serif, system-ui, sans-serif' }} />
          <Bar isAnimationActive={false} dataKey="employee" name="employee" stackId="c" fill={colors.line2} fillOpacity={0.8} />
          <Bar isAnimationActive={false} dataKey="employerEpf" name="employerEpf" stackId="c" fill={colors.accent} fillOpacity={0.8} />
          <Bar isAnimationActive={false} dataKey="employerEps" name="employerEps" stackId="c" fill={colors.s3} fillOpacity={0.8} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function PensionPayoutChart({ result, showFutureRupees, theme }: { result: EpfVpfSimulationResult; showFutureRupees: boolean; theme: GraphiteTheme }) {
  const colors = graphiteChartColors(theme);
  const data = result.payoutYearly.map((y) => ({
    age: y.age,
    cumulative: showFutureRupees ? y.cumulativePensionReceivedInr : y.cumulativePensionReceivedRealInr,
  }));
  return (
    <div className="h-56 w-full" role="img" aria-label="Cumulative EPS pension received since retirement, by age">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.rule} vertical={false} />
          <XAxis dataKey="age" tickFormatter={(v: number) => `Age ${v}`} tick={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, fill: colors.ink2 }} axisLine={{ stroke: colors.rule }} tickLine={false} />
          <YAxis tickFormatter={(v: number) => rupeeCompact(v)} tick={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, fill: colors.ink2 }} axisLine={false} tickLine={false} width={64} />
          <Tooltip
            formatter={(v) => [rupeeCompact(Number(v)), 'Cumulative pension received']}
            labelFormatter={(v) => `Age ${v}`}
            contentStyle={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, background: colors.paper, border: `1px solid ${colors.rule}`, borderRadius: 4 }}
          />
          <Line isAnimationActive={false} type="monotone" dataKey="cumulative" name="cumulative" stroke={colors.accent} strokeWidth={2.5} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- main route ---------- */

export function EpfVpfPlanner() {
  const { theme, toggle: toggleTheme } = useGraphiteTheme();
  const taxSettings = useSharedTaxSettings();
  const [form, setForm] = useState<EpfFormState>(() => defaultFormState());
  const [showFutureRupees, setShowFutureRupees] = useState(false);

  const simulatorInput = useMemo<EpfVpfSimulatorInput>(
    () => ({ ...form, inflationPct: taxSettings.settings.inflationPct }),
    [form, taxSettings.settings.inflationPct],
  );
  const result = useMemo(() => simulateEpfVpf(simulatorInput), [simulatorInput]);
  const unit = showFutureRupees ? 'future ₹' : "today's ₹";

  const estimatedTaxOnTaxableInterestInr =
    (showFutureRupees ? result.totalTaxableInterestInr : result.totalTaxableInterestRealInr) * (taxSettings.settings.slabRatePct / 100);

  function update(patch: Partial<EpfFormState>) {
    setForm((f) => ({ ...f, ...patch }));
  }
  function resetToDefaults() {
    setForm(defaultFormState());
  }

  const tickerContent = (
    <>
      <TickerLabel>EPF/EPS rules in effect</TickerLabel>
      <TickerItem label="EPF/VPF rate" value={pct(form.epfInterestRatePct)} highlight="annual" />
      <TickerItem label="Wage ceiling" value={rupee(form.wageCeilingInr)} highlight="EPS cap" />
      <TickerItem label="EPS share" value={pct(form.epsShareOfEmployerRatePct)} highlight="of employer's 12%" />
    </>
  );

  return (
    <div className="graphite -m-4 min-h-screen" data-theme={theme}>
      <style>{GRAPHITE_CSS_VARS}</style>
      <GraphiteModuleHeader active="epf-vpf" moduleLabel="EPF & VPF" theme={theme} onToggleTheme={toggleTheme} ticker={tickerContent} />

      <div className="mx-auto max-w-[1400px] p-4 sm:p-6">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--acctext)' }}>
            {result.yearsSimulated}-year plan to retirement
          </span>
          <div className="flex items-center gap-2 text-[11.5px]" style={{ color: 'var(--muted)' }}>
            <span>Figures shown in</span>
            <Segmented options={[{ value: 'today', label: "Today's ₹" }, { value: 'future', label: 'Future ₹' }]} value={showFutureRupees ? 'future' : 'today'} onChange={(v) => setShowFutureRupees(v === 'future')} />
          </div>
        </div>
        <p className="mb-5 max-w-[70ch] text-lg leading-snug" style={{ color: 'var(--ink)' }}>
          Contributing {rupee(form.monthlyBasicPlusDaInr * ((form.employeeContributionRatePct + form.vpfContributionRatePct) / 100))} a month today, growing with
          your salary, your EPF + VPF corpus reaches{' '}
          <strong style={{ color: 'var(--acctext)' }}>
            {rupeeCompact(showFutureRupees ? result.corpusAtRetirementInr : result.corpusAtRetirementRealInr)}
          </strong>{' '}
          at retirement, {unit}. Your employer's EPS contributions separately build towards an estimated pension of{' '}
          <strong style={{ color: 'var(--acctext)' }}>
            {rupee(showFutureRupees ? result.epsMonthlyPensionEstimateInr : result.epsMonthlyPensionEstimateRealInr)}/month
          </strong>
          .
        </p>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
          {/* ---------- sidebar ---------- */}
          <aside
            className="graphite-scroll rounded-lg border p-4 lg:sticky lg:top-[76px] lg:max-h-[calc(100vh-100px)] lg:overflow-y-auto"
            style={{ background: 'var(--rail)', borderColor: 'var(--rule)' }}
          >
            <h2 className="mb-2 mt-1 text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--acctext)' }}>
              You
            </h2>
            <SliderField label="Current age" value={form.currentAge} onChange={(v) => update({ currentAge: Math.round(v) })} min={18} max={65} step={1} />
            <SliderField label="Retirement age" value={form.retirementAge} onChange={(v) => update({ retirementAge: Math.round(v) })} min={19} max={70} step={1} />
            <SliderField
              label="Plan pension until age"
              hint="EPS pension payout horizon — a stand-in for life expectancy"
              value={form.planUntilAge}
              onChange={(v) => update({ planUntilAge: Math.round(v) })}
              min={form.retirementAge}
              max={100}
              step={1}
            />

            <h2 className="mb-2 mt-4 border-t pt-3 text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--acctext)', borderColor: 'var(--rule)' }}>
              Existing balance
            </h2>
            <FieldRow label="Opening EPF + VPF balance (₹)">
              <Stepper value={form.openingBalanceInr} onChange={(v) => update({ openingBalanceInr: v })} step={50_000} min={0} />
            </FieldRow>
            <FieldRow label="Pensionable service so far (yrs)">
              <Stepper value={form.openingPensionableServiceYears} onChange={(v) => update({ openingPensionableServiceYears: v })} step={1} min={0} max={45} />
            </FieldRow>

            <h2 className="mb-2 mt-4 border-t pt-3 text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--acctext)', borderColor: 'var(--rule)' }}>
              Salary
            </h2>
            <FieldRow label="Monthly Basic + DA (₹)" hint="the wage base every contribution is computed from">
              <Stepper value={form.monthlyBasicPlusDaInr} onChange={(v) => update({ monthlyBasicPlusDaInr: v })} step={1_000} min={0} />
            </FieldRow>
            <SliderField label="Salary growth" hint="% a year" value={form.salaryGrowthPctPerYear} onChange={(v) => update({ salaryGrowthPctPerYear: v })} min={0} max={20} step={0.5} suffix="%" />

            <h2 className="mb-2 mt-4 border-t pt-3 text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--acctext)', borderColor: 'var(--rule)' }}>
              Contributions
            </h2>
            <FieldRow label="Employee (mandatory)" hint="statutorily 12% of Basic + DA">
              <Stepper value={form.employeeContributionRatePct} onChange={(v) => update({ employeeContributionRatePct: v })} step={1} min={0} max={20} suffix="%" />
            </FieldRow>
            <SliderField label="VPF top-up" hint="voluntary, on top of the mandatory 12%" value={form.vpfContributionRatePct} onChange={(v) => update({ vpfContributionRatePct: v })} min={0} max={88} step={1} suffix="%" />
            <FieldRow label="Employer (total)" hint="statutorily 12%, before the EPS/EPF split">
              <Stepper value={form.employerContributionRatePct} onChange={(v) => update({ employerContributionRatePct: v })} step={1} min={0} max={20} suffix="%" />
            </FieldRow>

            <h2 className="mb-2 mt-4 border-t pt-3 text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--acctext)', borderColor: 'var(--rule)' }}>
              EPF/EPS rules <span className="font-normal normal-case" style={{ color: 'var(--muted)' }}>· sourced, editable</span>
            </h2>
            <FieldRow label="Wage ceiling (₹/month)" hint="EPS share applies only up to this much wage">
              <Stepper value={form.wageCeilingInr} onChange={(v) => update({ wageCeilingInr: v })} step={1_000} min={0} />
            </FieldRow>
            <FieldRow label="EPS share of employer's 12%" hint="diverted to the pension scheme">
              <Stepper value={form.epsShareOfEmployerRatePct} onChange={(v) => update({ epsShareOfEmployerRatePct: v })} step={0.01} min={0} max={12} suffix="%" />
            </FieldRow>
            <FieldRow label="EPF/VPF interest rate" hint="% a year, EPFO-declared">
              <Stepper value={form.epfInterestRatePct} onChange={(v) => update({ epfInterestRatePct: v })} step={0.05} min={0} max={15} suffix="%" />
            </FieldRow>
            <FieldRow label="Tax-free interest threshold (₹/yr)" hint="above this, interest on your own contribution is taxable">
              <Stepper value={form.taxableInterestThresholdPerYearInr} onChange={(v) => update({ taxableInterestThresholdPerYearInr: v })} step={10_000} min={0} />
            </FieldRow>
            <FieldRow label="EPS pension divisor">
              <Stepper value={form.epsPensionDivisor} onChange={(v) => update({ epsPensionDivisor: v })} step={1} min={1} max={100} />
            </FieldRow>
            <FieldRow label="EPS pensionable salary cap (₹)">
              <Stepper value={form.epsPensionableSalaryCeilingInr} onChange={(v) => update({ epsPensionableSalaryCeilingInr: v })} step={1_000} min={0} />
            </FieldRow>

            <h2 className="mb-2 mt-4 border-t pt-3 text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--acctext)', borderColor: 'var(--rule)' }}>
              Tax <span className="font-normal normal-case" style={{ color: 'var(--muted)' }}>· shared with REIT income &amp; SIP &amp; SWP</span>
            </h2>
            <FieldRow label="Your slab rate" hint="applied to the taxable-interest slice below">
              <Stepper value={taxSettings.settings.slabRatePct} onChange={(v) => taxSettings.updateSettings({ slabRatePct: v })} step={0.01} min={0} max={45} suffix="%" />
            </FieldRow>
            <FieldRow label="Inflation" hint="% a year, for the today's-money figure above">
              <Stepper value={taxSettings.settings.inflationPct} onChange={(v) => taxSettings.updateSettings({ inflationPct: v })} step={0.5} min={0} max={12} suffix="%" />
            </FieldRow>

            <button type="button" onClick={resetToDefaults} className="mt-2 h-8 w-full rounded border text-xs font-medium" style={{ borderColor: 'var(--rule)', color: 'var(--ink)' }}>
              Reset to defaults
            </button>
          </aside>

          {/* ---------- main content ---------- */}
          <main className="flex min-w-0 flex-col gap-5">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              <Card>
                <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
                  Corpus at retirement
                </div>
                <div className="num mb-0.5 text-[28px] font-medium leading-none tracking-tight">
                  {rupeeCompact(showFutureRupees ? result.corpusAtRetirementInr : result.corpusAtRetirementRealInr)}
                </div>
                <div className="text-[11px]" style={{ color: 'var(--muted)' }}>
                  {rupeeCompact(showFutureRupees ? result.corpusAtRetirementRealInr : result.corpusAtRetirementInr)} in {showFutureRupees ? "today's" : 'future'} money
                </div>
              </Card>
              <Card>
                <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
                  Total interest earned
                </div>
                <div className="num mb-0.5 text-[28px] font-medium leading-none tracking-tight">
                  {rupeeCompact(showFutureRupees ? result.totalInterestEarnedInr : result.totalInterestEarnedRealInr)}
                </div>
                <div className="text-[11px]" style={{ color: 'var(--muted)' }}>
                  of which {rupeeCompact(showFutureRupees ? result.totalTaxableInterestInr : result.totalTaxableInterestRealInr)} taxable (~{rupeeCompact(estimatedTaxOnTaxableInterestInr)} tax at your slab rate)
                </div>
              </Card>
              <Card>
                <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
                  Estimated EPS pension
                </div>
                <div className="num mb-0.5 text-[28px] font-medium leading-none tracking-tight">
                  {rupee(showFutureRupees ? result.epsMonthlyPensionEstimateInr : result.epsMonthlyPensionEstimateRealInr)}/mo
                </div>
                <div className="text-[11px]" style={{ color: 'var(--muted)' }}>
                  {result.pensionableServiceYears} yrs service × {rupeeCompact(showFutureRupees ? result.epsPensionableSalaryInr : result.epsPensionableSalaryRealInr)} salary ÷ {form.epsPensionDivisor}
                </div>
              </Card>
            </div>

            <Card>
              <h2 className="mb-1 text-[15px] font-semibold">Corpus growth</h2>
              <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
                EPF + VPF balance vs. money contributed to date (employee + employer's EPF share — EPS contributions are tracked separately and never compound into this balance).
              </p>
              <CorpusChart result={result} showFutureRupees={showFutureRupees} theme={theme} />
            </Card>

            <Card>
              <h2 className="mb-1 text-[15px] font-semibold">Where contributions go</h2>
              <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
                Each year's employee (+ VPF) contribution, employer's EPF share, and employer's EPS share — the EPS share grows only up to the wage ceiling.
              </p>
              <ContributionMixChart result={result} showFutureRupees={showFutureRupees} theme={theme} />
            </Card>

            <Card>
              <h2 className="mb-2 text-[15px] font-semibold">Year by year</h2>
              <div className="max-h-96 overflow-auto rounded-md border" style={{ borderColor: 'var(--rule)' }}>
                <table className="w-full text-xs">
                  <thead style={{ background: 'var(--panel)', position: 'sticky', top: 0 }}>
                    <tr>
                      {['Year', 'Age', 'Monthly wage', 'Employee', 'Employer → EPF', 'Employer → EPS', 'Interest', 'Taxable interest', 'Closing balance'].map((h) => (
                        <th key={h} className="border-b p-2 text-right first:text-left" style={{ borderColor: 'var(--rule)' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.yearly.map((y) => (
                      <tr key={y.year}>
                        <td className="border-b p-2" style={{ borderColor: 'var(--rule)' }}>{y.year}</td>
                        <td className="border-b p-2 text-right num" style={{ borderColor: 'var(--rule)' }}>{y.age}</td>
                        <td className="border-b p-2 text-right num" style={{ borderColor: 'var(--rule)' }}>{rupee(showFutureRupees ? y.monthlyBasicPlusDaInr : y.monthlyBasicPlusDaRealInr)}</td>
                        <td className="border-b p-2 text-right num" style={{ borderColor: 'var(--rule)' }}>{rupee(showFutureRupees ? y.employeeContributionThisYearInr : y.employeeContributionThisYearRealInr)}</td>
                        <td className="border-b p-2 text-right num" style={{ borderColor: 'var(--rule)' }}>{rupee(showFutureRupees ? y.employerEpfContributionThisYearInr : y.employerEpfContributionThisYearRealInr)}</td>
                        <td className="border-b p-2 text-right num" style={{ borderColor: 'var(--rule)' }}>{rupee(showFutureRupees ? y.employerEpsContributionThisYearInr : y.employerEpsContributionThisYearRealInr)}</td>
                        <td className="border-b p-2 text-right num" style={{ borderColor: 'var(--rule)' }}>{rupee(showFutureRupees ? y.interestCreditedThisYearInr : y.interestCreditedThisYearRealInr)}</td>
                        <td className="border-b p-2 text-right num" style={{ borderColor: 'var(--rule)' }}>{rupee(showFutureRupees ? y.taxableInterestThisYearInr : y.taxableInterestThisYearRealInr)}</td>
                        <td className="border-b p-2 text-right num" style={{ borderColor: 'var(--rule)' }}>{rupee(showFutureRupees ? y.closingBalanceInr : y.closingBalanceRealInr)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card>
              <h2 className="mb-1 text-[15px] font-semibold">Pension payout after retirement</h2>
              <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
                {result.payoutYearsSimulated > 0 ? (
                  <>
                    A flat {rupee(showFutureRupees ? result.epsMonthlyPensionEstimateInr : result.epsMonthlyPensionEstimateRealInr)}/month EPS pension, received for{' '}
                    {result.payoutYearsSimulated} {result.payoutYearsSimulated === 1 ? 'year' : 'years'} (through age {form.planUntilAge}), totals{' '}
                    <strong style={{ color: 'var(--acctext)' }}>
                      {rupeeCompact(showFutureRupees ? result.totalPensionReceivedInr : result.totalPensionReceivedRealInr)}
                    </strong>{' '}
                    — no cost-of-living escalation and no life-expectancy modelling beyond this one horizon you've chosen. The EPF + VPF corpus itself has no mandated
                    annuity; by law it's withdrawn separately as the lump sum shown above.
                  </>
                ) : (
                  'Set "Plan pension until age" above your retirement age in the sidebar to see a year-by-year payout timeline.'
                )}
              </p>
              {result.payoutYearsSimulated > 0 && (
                <>
                  <PensionPayoutChart result={result} showFutureRupees={showFutureRupees} theme={theme} />
                  <div className="mt-3 max-h-64 overflow-auto rounded-md border" style={{ borderColor: 'var(--rule)' }}>
                    <table className="w-full text-xs">
                      <thead style={{ background: 'var(--panel)', position: 'sticky', top: 0 }}>
                        <tr>
                          {['Year', 'Age', 'Pension this year', 'Cumulative received'].map((h) => (
                            <th key={h} className="border-b p-2 text-right first:text-left" style={{ borderColor: 'var(--rule)' }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.payoutYearly.map((y) => (
                          <tr key={y.year}>
                            <td className="border-b p-2" style={{ borderColor: 'var(--rule)' }}>{y.year}</td>
                            <td className="border-b p-2 text-right num" style={{ borderColor: 'var(--rule)' }}>{y.age}</td>
                            <td className="border-b p-2 text-right num" style={{ borderColor: 'var(--rule)' }}>
                              {rupee(showFutureRupees ? y.pensionReceivedThisYearInr : y.pensionReceivedThisYearRealInr)}
                            </td>
                            <td className="border-b p-2 text-right num" style={{ borderColor: 'var(--rule)' }}>
                              {rupee(showFutureRupees ? y.cumulativePensionReceivedInr : y.cumulativePensionReceivedRealInr)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Card>

            <Card>
              <h2 className="mb-2 text-[15px] font-semibold">Assumptions &amp; data</h2>
              <ul className="list-disc space-y-1.5 pl-5 text-xs" style={{ color: 'var(--ink2)' }}>
                <li>
                  Every figure can be shown in future (nominal) or today's (real) rupees via the toggle above — today's-money figures deflate by this year's own
                  elapsed-inflation factor, resolved once per simulation year rather than per month (see <code>epf-vpf-simulator.ts</code>'s own doc comment) —
                  a coarser grid than REIT income and SIP &amp; SWP's per-month deflation, acceptable at this module's annual reporting granularity.
                </li>
                <li>EPFO credits interest once a year on a monthly running balance; this simulator compounds monthly throughout instead — a standard approximation, immaterial at these rates over realistic horizons.</li>
                <li>
                  The employer's 12% contribution is split by law: {pct(form.epsShareOfEmployerRatePct)} of wages up to the {rupee(form.wageCeilingInr)} ceiling goes to the Employees'
                  Pension Scheme (EPS) — a separate, non-compounding, defined-benefit track — the remainder joins this EPF/VPF balance. The wage ceiling was raised from ₹15,000 to
                  ₹25,000 effective 17 Sep 2026 — see claude/pf-nps-research-and-plan.md for sourcing.
                </li>
                <li>
                  Interest on the employee's own contribution (mandatory + VPF) above the threshold shown, in a year, is taxable at slab rate as "income from other sources" (Budget 2021) —
                  estimated here at your slab rate, not auto-deducted from the corpus.
                </li>
                <li>
                  The EPS pension estimate uses the textbook formula (pensionable salary × pensionable service ÷ divisor), with pensionable salary averaged over the last 5 years' wage,
                  capped at the pensionable-salary ceiling. It does not model the "weightage" rule (service beyond 20 years adds a bonus 2 years) — not independently confirmed against a
                  primary EPFO source this session — so treat it as an approximate estimate, not a precise EPFO-grade quote.
                </li>
                <li>
                  The pension payout timeline above simply extends that flat monthly EPS pension forward through "Plan pension until age," with no cost-of-living escalation and no
                  mortality/life-expectancy actuarial modelling — it's a horizon you choose, not an actuarial projection. Real-terms figures there keep discounting past retirement
                  (continuing the same inflation factor rather than resetting it), unlike the cumulative corpus/contribution totals above.
                </li>
                <li>Not modelled: withdrawal TDS, partial/advance withdrawals, job changes and UAN transfers, and the ₹7.5L aggregate-employer-contribution ceiling across PF + NPS + superannuation.</li>
              </ul>
            </Card>
          </main>
        </div>
      </div>
    </div>
  );
}
