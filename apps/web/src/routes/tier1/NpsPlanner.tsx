import { useMemo, useState } from 'react';
import { CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { formatINR } from '@fincalc/ui';
import { getNpsRules, type NpsRules } from '@fincalc/data';
import {
  simulateNps,
  type NpsActiveAllocationInput,
  type NpsAllocationMode,
  type NpsLifecycleFund,
  type NpsReturnAssumptions,
  type NpsSector,
  type NpsSimulationResult,
  type NpsSimulatorInput,
} from '@fincalc/engine';

import { Card, FieldRow, Segmented, SliderField, Stepper } from '../../components/GraphiteFields';
import { GraphiteModuleHeader, TickerItem, TickerLabel } from '../../components/GraphiteModuleHeader';
import { GRAPHITE_CSS_VARS, graphiteChartColors, useGraphiteTheme, type GraphiteTheme } from '../../lib/graphite-theme';
import { useSharedTaxSettings } from '../../lib/shared-tax-settings';

/**
 * National Pension System (NPS, Tier I only) planner — the fourth Graphite
 * module, built from scratch like EPF/VPF (no prototype HTML exists for
 * this one either) — see claude/pf-nps-research-and-plan.md for the dated
 * research into the official NPS Trust Pension Calculator this module's
 * input/output shape follows, and claude/decisions-and-workflow.md for the
 * approved outline (Phase 15) this was built against. v1 scope decision
 * from that outline: Tier I only — no Tier II, no partial withdrawals.
 *
 * Same architecture as the other three Graphite modules: the shared
 * `.graphite` theme and topbar, the same five form primitives. This module
 * uses `useSharedTaxSettings()` for exactly one field — the shared
 * inflation assumption, behind the "Today's ₹ / Future ₹" toggle (Phase
 * 16) — none of that hook's other fields (slab rate, capital-gains rates)
 * apply here, since NPS's lump-sum exemption and annuity taxation aren't
 * slab-rate or capital-gains driven in a way those fields model; the
 * tax-benefit figures shown here (80CCD) are sourced directly from the
 * `nps-rules` pack and presented as reference information, not wired into
 * a computed deduction.
 *
 * `@fincalc/engine`'s `simulateNps()` takes every pack-sourced figure (the
 * lifecycle glide table, the sector's exit slabs, the lump-sum exemption
 * fraction) as plain input fields rather than a separate rules parameter —
 * this file is what calls `getNpsRules()` once and threads the relevant
 * slice into the simulator's input on every change, same pattern as
 * `defaultFormState()` in the other modules reading `@fincalc/data` once
 * to seed its defaults.
 *
 * Active Choice's four weights (Equity/Corporate Debt/Government
 * Securities/Alternative) are kept normalized to 100 in the UI layer
 * (`normalizeActiveAllocation` below) — the engine itself tolerates
 * non-100 weights (it weights the non-equity blended return by the three
 * non-equity weights' own relative proportions, not by their sum), but a
 * planning tool showing a subscriber "your mix" should keep the numbers
 * honest at a glance.
 */

function rupee(v: number): string {
  return formatINR(v, { decimals: 0 });
}
function rupeeCompact(v: number): string {
  return formatINR(v, { compact: true, decimals: 2 });
}
function pct(v: number, decimals = 1): string {
  return `${v.toFixed(decimals)}%`;
}
function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

const LIFECYCLE_LABELS: Record<NpsLifecycleFund, string> = { LC75: 'LC75 — aggressive', LC50: 'LC50 — moderate', LC25: 'LC25 — conservative' };

/** Re-balances the four Active Choice weights to sum to 100 after one of them changes, respecting the sector's equity cap and the alternative-assets cap. Corporate Debt and Government Securities absorb the remainder, keeping their existing ratio to each other unless one of them is the field that changed. */
function normalizeActiveAllocation(
  target: NpsActiveAllocationInput,
  changed: keyof NpsActiveAllocationInput,
  maxEquityPct: number,
  maxAlternativePct: number,
): NpsActiveAllocationInput {
  const equityPct = clamp(target.equityPct, 0, maxEquityPct);
  const alternativePct = clamp(target.alternativePct, 0, maxAlternativePct);
  const remainder = Math.max(0, 100 - equityPct - alternativePct);

  if (changed === 'corporateDebtPct') {
    const corporateDebtPct = clamp(target.corporateDebtPct, 0, remainder);
    return { equityPct, corporateDebtPct, governmentSecuritiesPct: remainder - corporateDebtPct, alternativePct };
  }
  if (changed === 'governmentSecuritiesPct') {
    const governmentSecuritiesPct = clamp(target.governmentSecuritiesPct, 0, remainder);
    return { equityPct, corporateDebtPct: remainder - governmentSecuritiesPct, governmentSecuritiesPct, alternativePct };
  }
  const cgSum = target.corporateDebtPct + target.governmentSecuritiesPct;
  if (cgSum > 0) {
    const scale = remainder / cgSum;
    return { equityPct, corporateDebtPct: target.corporateDebtPct * scale, governmentSecuritiesPct: target.governmentSecuritiesPct * scale, alternativePct };
  }
  return { equityPct, corporateDebtPct: remainder * 0.65, governmentSecuritiesPct: remainder * 0.35, alternativePct };
}

interface FormState {
  currentAge: number;
  retirementAge: number;
  employeeMonthlyContributionInr: number;
  contributionStepUpPctPerYear: number;
  monthlySalaryInr: number;
  salaryGrowthPctPerYear: number;
  employerContributionPctOfSalary: number;
  allocationMode: NpsAllocationMode;
  activeAllocation: NpsActiveAllocationInput;
  lifecycleFund: NpsLifecycleFund;
  sector: NpsSector;
  returnAssumptions: NpsReturnAssumptions;
  openingCorpusInr: number;
  annuityRatePct: number;
  lumpSumWithdrawalPct: number;
  /** Old vs new income-tax regime — used only to pick which 80CCD figures to display below, not wired into any computed deduction. */
  taxRegime: 'old' | 'new';
}

function defaultFormState(): FormState {
  return {
    currentAge: 30,
    retirementAge: 60,
    employeeMonthlyContributionInr: 10_000,
    contributionStepUpPctPerYear: 7,
    monthlySalaryInr: 80_000,
    salaryGrowthPctPerYear: 7,
    employerContributionPctOfSalary: 10,
    allocationMode: 'auto',
    activeAllocation: { equityPct: 50, corporateDebtPct: 30, governmentSecuritiesPct: 15, alternativePct: 5 },
    lifecycleFund: 'LC50',
    sector: 'non_government',
    returnAssumptions: { equityPct: 11, corporateDebtPct: 7.5, governmentSecuritiesPct: 7, alternativePct: 9 },
    openingCorpusInr: 0,
    annuityRatePct: 6,
    lumpSumWithdrawalPct: 60,
    taxRegime: 'new',
  };
}

function toSimulatorInput(form: FormState, rules: NpsRules, inflationPct: number): NpsSimulatorInput {
  const exitSlabs = form.sector === 'government' ? rules.exit.governmentSlabs : rules.exit.nonGovernmentSlabs;
  return {
    currentAge: form.currentAge,
    retirementAge: form.retirementAge,
    employeeMonthlyContributionInr: form.employeeMonthlyContributionInr,
    contributionStepUpPctPerYear: form.contributionStepUpPctPerYear,
    monthlySalaryInr: form.monthlySalaryInr,
    salaryGrowthPctPerYear: form.salaryGrowthPctPerYear,
    employerContributionPctOfSalary: form.employerContributionPctOfSalary,
    allocationMode: form.allocationMode,
    activeAllocation: form.activeAllocation,
    lifecycleFund: form.lifecycleFund,
    lifecycleGlideTable: rules.autoChoice.lifecycles[form.lifecycleFund] ?? [],
    sector: form.sector,
    returnAssumptions: form.returnAssumptions,
    openingCorpusInr: form.openingCorpusInr,
    annuityRatePct: form.annuityRatePct,
    lumpSumWithdrawalPct: form.lumpSumWithdrawalPct,
    exitSlabs,
    lumpSumTaxExemptFractionOfCorpus: rules.exit.lumpSumTaxExemptFractionOfCorpus,
    inflationPct,
  };
}

/* ---------- charts ---------- */

function CorpusChart({ result, showFutureRupees, theme }: { result: NpsSimulationResult; showFutureRupees: boolean; theme: GraphiteTheme }) {
  const colors = graphiteChartColors(theme);
  const data = result.yearly.map((y) => ({
    year: y.year,
    corpus: showFutureRupees ? y.corpusAtYearEndInr : y.corpusAtYearEndRealInr,
    contributed: showFutureRupees ? y.contributedToDateInr : y.contributedToDateRealInr,
  }));
  return (
    <div className="h-72 w-full" role="img" aria-label="NPS Tier I corpus and money contributed to date, by year">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.rule} vertical={false} />
          <XAxis dataKey="year" tickFormatter={(v: number) => `Yr ${v}`} tick={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, fill: colors.ink2 }} axisLine={{ stroke: colors.rule }} tickLine={false} />
          <YAxis tickFormatter={(v: number) => rupeeCompact(v)} tick={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, fill: colors.ink2 }} axisLine={false} tickLine={false} width={64} />
          <Tooltip
            formatter={(v, name) => [rupeeCompact(Number(v)), name === 'corpus' ? 'Corpus' : 'Contributed to date']}
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

function EquityGlideChart({ result, theme }: { result: NpsSimulationResult; theme: GraphiteTheme }) {
  // Equity share is a ratio, not a rupee figure — nothing to deflate, so this chart takes no showFutureRupees prop.
  const colors = graphiteChartColors(theme);
  const data = result.yearly.map((y) => ({ year: y.year, equity: y.equitySharePct }));
  return (
    <div className="h-56 w-full" role="img" aria-label="Equity share of the portfolio, by year">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.rule} vertical={false} />
          <XAxis dataKey="year" tickFormatter={(v: number) => `Yr ${v}`} tick={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, fill: colors.ink2 }} axisLine={{ stroke: colors.rule }} tickLine={false} />
          <YAxis domain={[0, 100]} tickFormatter={(v: number) => `${Math.round(v)}%`} tick={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, fill: colors.ink2 }} axisLine={false} tickLine={false} width={44} />
          <Tooltip formatter={(v) => [`${Number(v).toFixed(0)}%`, 'Equity share']} labelFormatter={(v) => `Year ${v}`} contentStyle={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, background: colors.paper, border: `1px solid ${colors.rule}`, borderRadius: 4 }} />
          <Line isAnimationActive={false} type="monotone" dataKey="equity" stroke={colors.accent} strokeWidth={2.25} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- main route ---------- */

export function NpsPlanner() {
  const { theme, toggle: toggleTheme } = useGraphiteTheme();
  const taxSettings = useSharedTaxSettings();
  const npsRules = useMemo(() => getNpsRules(), []);
  const [form, setForm] = useState<FormState>(() => defaultFormState());
  const [showFutureRupees, setShowFutureRupees] = useState(false);

  const maxEquityPct = form.sector === 'government' ? npsRules.activeChoice.maxEquityPctGovernment : npsRules.activeChoice.maxEquityPctNonGovernment;
  const exitSlabs = form.sector === 'government' ? npsRules.exit.governmentSlabs : npsRules.exit.nonGovernmentSlabs;
  const glideTable = npsRules.autoChoice.lifecycles[form.lifecycleFund] ?? [];

  const simulatorInput = useMemo(
    () => toSimulatorInput(form, npsRules, taxSettings.settings.inflationPct),
    [form, npsRules, taxSettings.settings.inflationPct],
  );
  const result = useMemo(() => simulateNps(simulatorInput), [simulatorInput]);
  const unit = showFutureRupees ? 'future ₹' : "today's ₹";

  function update(patch: Partial<FormState>) {
    setForm((f) => ({ ...f, ...patch }));
  }
  function updateSector(sector: NpsSector) {
    setForm((f) => {
      const cap = sector === 'government' ? npsRules.activeChoice.maxEquityPctGovernment : npsRules.activeChoice.maxEquityPctNonGovernment;
      return { ...f, sector, activeAllocation: normalizeActiveAllocation(f.activeAllocation, 'equityPct', cap, npsRules.activeChoice.maxAlternativePct) };
    });
  }
  function updateActiveAllocation(key: keyof NpsActiveAllocationInput, value: number) {
    setForm((f) => {
      const target = { ...f.activeAllocation, [key]: value };
      return { ...f, activeAllocation: normalizeActiveAllocation(target, key, maxEquityPct, npsRules.activeChoice.maxAlternativePct) };
    });
  }
  function resetToDefaults() {
    setForm(defaultFormState());
  }

  const employerContributionBenefitPct =
    form.sector === 'government' ? npsRules.taxBenefits.employerContribution.governmentBothRegimesPct
    : form.taxRegime === 'old' ? npsRules.taxBenefits.employerContribution.nonGovernmentOldRegimePct
    : npsRules.taxBenefits.employerContribution.nonGovernmentNewRegimePct;

  const tickerContent = (
    <>
      <TickerLabel>NPS Tier I rules in effect</TickerLabel>
      <TickerItem label="Sector" value={form.sector === 'government' ? 'Government' : 'Non-government'} highlight={`max equity ${pct(maxEquityPct, 0)}`} />
      <TickerItem label="Top-slab lump sum" value={pct(exitSlabs[exitSlabs.length - 1]?.maxLumpSumPct ?? 0, 0)} highlight="of corpus" />
      <TickerItem label="Lump-sum exemption" value={pct(npsRules.exit.lumpSumTaxExemptFractionOfCorpus * 100, 0)} highlight="conservative reading" />
    </>
  );

  return (
    <div className="graphite -m-4 min-h-screen" data-theme={theme}>
      <style>{GRAPHITE_CSS_VARS}</style>
      <GraphiteModuleHeader active="nps" moduleLabel="NPS (Tier I)" theme={theme} onToggleTheme={toggleTheme} ticker={tickerContent} />

      <div className="mx-auto max-w-[1400px] p-4 sm:p-6">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--acctext)' }}>
            {result.yearsSimulated}-year plan to exit
          </span>
          <div className="flex items-center gap-2 text-[11.5px]" style={{ color: 'var(--muted)' }}>
            <span>Figures shown in</span>
            <Segmented options={[{ value: 'today', label: "Today's ₹" }, { value: 'future', label: 'Future ₹' }]} value={showFutureRupees ? 'future' : 'today'} onChange={(v) => setShowFutureRupees(v === 'future')} />
          </div>
        </div>
        <p className="mb-5 max-w-[70ch] text-lg leading-snug" style={{ color: 'var(--ink)' }}>
          Your NPS Tier I corpus reaches{' '}
          <strong style={{ color: 'var(--acctext)' }}>{rupeeCompact(showFutureRupees ? result.corpusAtExitInr : result.corpusAtExitRealInr)}</strong> at exit,{' '}
          {unit}. Taking a{' '}
          {pct(result.exit.maxLumpSumAllowedPct >= form.lumpSumWithdrawalPct ? form.lumpSumWithdrawalPct : result.exit.maxLumpSumAllowedPct, 0)} lump sum (
          {rupeeCompact(showFutureRupees ? result.exit.lumpSumTakenInr : result.exit.lumpSumTakenRealInr)}, of which{' '}
          {rupeeCompact(showFutureRupees ? result.exit.lumpSumExemptInr : result.exit.lumpSumExemptRealInr)} is tax-exempt), the remaining{' '}
          {rupeeCompact(showFutureRupees ? result.exit.annuityPurchaseInr : result.exit.annuityPurchaseRealInr)} buys an annuity estimated to pay{' '}
          <strong style={{ color: 'var(--acctext)' }}>
            {rupee(showFutureRupees ? result.exit.estimatedMonthlyPensionInr : result.exit.estimatedMonthlyPensionRealInr)}/month
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
            <SliderField label="Retirement / exit age" value={form.retirementAge} onChange={(v) => update({ retirementAge: Math.round(v) })} min={19} max={75} step={1} />
            <div className="mb-1">
              <FieldRow label="Sector">
                <span />
              </FieldRow>
              <Segmented
                options={[{ value: 'non_government', label: 'Non-government' }, { value: 'government', label: 'Government' }]}
                value={form.sector}
                onChange={updateSector}
              />
              <p className="mt-1.5 text-[10.5px] leading-snug" style={{ color: 'var(--muted)' }}>
                Sets the Active Choice equity cap ({pct(maxEquityPct, 0)}) and the exit-withdrawal slabs below.
              </p>
            </div>

            <h2 className="mb-2 mt-4 border-t pt-3 text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--acctext)', borderColor: 'var(--rule)' }}>
              Existing corpus
            </h2>
            <FieldRow label="Opening Tier I corpus (₹)">
              <Stepper value={form.openingCorpusInr} onChange={(v) => update({ openingCorpusInr: v })} step={50_000} min={0} />
            </FieldRow>

            <h2 className="mb-2 mt-4 border-t pt-3 text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--acctext)', borderColor: 'var(--rule)' }}>
              Contributions
            </h2>
            <FieldRow label="Your monthly contribution (₹)">
              <Stepper value={form.employeeMonthlyContributionInr} onChange={(v) => update({ employeeMonthlyContributionInr: v })} step={500} min={0} />
            </FieldRow>
            <SliderField label="Step-up" hint="% a year" value={form.contributionStepUpPctPerYear} onChange={(v) => update({ contributionStepUpPctPerYear: v })} min={0} max={20} step={0.5} suffix="%" />
            <FieldRow label="Monthly salary (₹)" hint="basis for the employer's %">
              <Stepper value={form.monthlySalaryInr} onChange={(v) => update({ monthlySalaryInr: v })} step={5_000} min={0} />
            </FieldRow>
            <SliderField label="Salary growth" hint="% a year" value={form.salaryGrowthPctPerYear} onChange={(v) => update({ salaryGrowthPctPerYear: v })} min={0} max={20} step={0.5} suffix="%" />
            <FieldRow label="Employer contribution" hint="% of salary">
              <Stepper value={form.employerContributionPctOfSalary} onChange={(v) => update({ employerContributionPctOfSalary: v })} step={1} min={0} max={14} suffix="%" />
            </FieldRow>

            <h2 className="mb-2 mt-4 border-t pt-3 text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--acctext)', borderColor: 'var(--rule)' }}>
              Asset allocation
            </h2>
            <div className="mb-3">
              <Segmented options={[{ value: 'auto', label: 'Auto Choice' }, { value: 'active', label: 'Active Choice' }]} value={form.allocationMode} onChange={(v) => update({ allocationMode: v })} />
            </div>
            {form.allocationMode === 'auto' ? (
              <>
                <div className="mb-2 flex gap-1.5">
                  {(Object.keys(LIFECYCLE_LABELS) as NpsLifecycleFund[]).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => update({ lifecycleFund: f })}
                      className="flex-1 rounded border px-1.5 py-1.5 text-[11px] font-medium"
                      style={form.lifecycleFund === f ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)', color: 'var(--ink)' } : { borderColor: 'var(--rule)', color: 'var(--ink2)' }}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <p className="mb-3 text-[10.5px] leading-snug" style={{ color: 'var(--muted)' }}>
                  {LIFECYCLE_LABELS[form.lifecycleFund]}. Equity share glides down from {glideTable[0]?.equityPct ?? 0}% at age {glideTable[0]?.age ?? '—'} to{' '}
                  {glideTable[glideTable.length - 1]?.equityPct ?? 0}% at age {glideTable[glideTable.length - 1]?.age ?? '—'}; currently{' '}
                  {pct(result.yearly[0]?.equitySharePct ?? 0, 0)} at your age. The non-equity remainder uses one blended "debt" return (see Assumptions).
                </p>
              </>
            ) : (
              <>
                <SliderField label="Equity (E)" value={form.activeAllocation.equityPct} onChange={(v) => updateActiveAllocation('equityPct', v)} min={0} max={maxEquityPct} step={1} suffix="%" />
                <SliderField label="Corporate debt (C)" value={form.activeAllocation.corporateDebtPct} onChange={(v) => updateActiveAllocation('corporateDebtPct', v)} min={0} max={100} step={1} suffix="%" />
                <SliderField label="Government securities (G)" value={form.activeAllocation.governmentSecuritiesPct} onChange={(v) => updateActiveAllocation('governmentSecuritiesPct', v)} min={0} max={100} step={1} suffix="%" />
                <SliderField
                  label="Alternative assets (A)"
                  hint={`capped at ${pct(npsRules.activeChoice.maxAlternativePct, 0)}`}
                  value={form.activeAllocation.alternativePct}
                  onChange={(v) => updateActiveAllocation('alternativePct', v)}
                  min={0}
                  max={npsRules.activeChoice.maxAlternativePct}
                  step={0.5}
                  suffix="%"
                />
                <p className="mb-1 text-[10.5px]" style={{ color: 'var(--muted)' }}>
                  Total: {pct(form.activeAllocation.equityPct + form.activeAllocation.corporateDebtPct + form.activeAllocation.governmentSecuritiesPct + form.activeAllocation.alternativePct, 0)}{' '}
                  — kept at 100, with C and G absorbing the rest when one weight changes.
                </p>
              </>
            )}

            <h2 className="mb-2 mt-4 border-t pt-3 text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--acctext)', borderColor: 'var(--rule)' }}>
              Return assumptions <span className="font-normal normal-case" style={{ color: 'var(--muted)' }}>· illustrative, not sourced</span>
            </h2>
            <SliderField label="Equity (E)" value={form.returnAssumptions.equityPct} onChange={(v) => update({ returnAssumptions: { ...form.returnAssumptions, equityPct: v } })} min={0} max={20} step={0.5} suffix="%" />
            <SliderField label="Corporate debt (C)" value={form.returnAssumptions.corporateDebtPct} onChange={(v) => update({ returnAssumptions: { ...form.returnAssumptions, corporateDebtPct: v } })} min={0} max={15} step={0.25} suffix="%" />
            <SliderField label="Government securities (G)" value={form.returnAssumptions.governmentSecuritiesPct} onChange={(v) => update({ returnAssumptions: { ...form.returnAssumptions, governmentSecuritiesPct: v } })} min={0} max={15} step={0.25} suffix="%" />
            <SliderField label="Alternative (A)" value={form.returnAssumptions.alternativePct} onChange={(v) => update({ returnAssumptions: { ...form.returnAssumptions, alternativePct: v } })} min={0} max={20} step={0.5} suffix="%" />

            <h2 className="mb-2 mt-4 border-t pt-3 text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--acctext)', borderColor: 'var(--rule)' }}>
              At exit
            </h2>
            <SliderField label="Lump sum requested" hint="clamped to the slab's max, shown below" value={form.lumpSumWithdrawalPct} onChange={(v) => update({ lumpSumWithdrawalPct: v })} min={0} max={100} step={5} suffix="%" />
            <FieldRow label="Assumed annuity rate" hint="% a year, insurer-dependent">
              <Stepper value={form.annuityRatePct} onChange={(v) => update({ annuityRatePct: v })} step={0.25} min={0} max={12} suffix="%" />
            </FieldRow>

            <h2 className="mb-2 mt-4 border-t pt-3 text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--acctext)', borderColor: 'var(--rule)' }}>
              Tax benefits <span className="font-normal normal-case" style={{ color: 'var(--muted)' }}>· reference only</span>
            </h2>
            <Segmented options={[{ value: 'old', label: 'Old regime' }, { value: 'new', label: 'New regime' }]} value={form.taxRegime} onChange={(v) => update({ taxRegime: v })} />

            <h2 className="mb-2 mt-4 border-t pt-3 text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--acctext)', borderColor: 'var(--rule)' }}>
              Inflation <span className="font-normal normal-case" style={{ color: 'var(--muted)' }}>· shared with REIT income, SIP &amp; SWP, and EPF &amp; VPF</span>
            </h2>
            <FieldRow label="Inflation" hint="% a year, for the today's-₹ figures above">
              <Stepper value={taxSettings.settings.inflationPct} onChange={(v) => taxSettings.updateSettings({ inflationPct: v })} step={0.5} min={0} max={12} suffix="%" />
            </FieldRow>

            <button type="button" onClick={resetToDefaults} className="mt-3 h-8 w-full rounded border text-xs font-medium" style={{ borderColor: 'var(--rule)', color: 'var(--ink)' }}>
              Reset to defaults
            </button>
          </aside>

          {/* ---------- main content ---------- */}
          <main className="flex min-w-0 flex-col gap-5">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              <Card>
                <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
                  Corpus at exit
                </div>
                <div className="num mb-0.5 text-[28px] font-medium leading-none tracking-tight">
                  {rupeeCompact(showFutureRupees ? result.corpusAtExitInr : result.corpusAtExitRealInr)}
                </div>
                <div className="text-[11px]" style={{ color: 'var(--muted)' }}>
                  {rupeeCompact(showFutureRupees ? result.totalEmployeeContributedInr : result.totalEmployeeContributedRealInr)} you +{' '}
                  {rupeeCompact(showFutureRupees ? result.totalEmployerContributedInr : result.totalEmployerContributedRealInr)} employer
                </div>
              </Card>
              <Card>
                <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
                  Lump sum at exit
                </div>
                <div className="num mb-0.5 text-[28px] font-medium leading-none tracking-tight">
                  {rupeeCompact(showFutureRupees ? result.exit.lumpSumTakenInr : result.exit.lumpSumTakenRealInr)}
                </div>
                <div className="text-[11px]" style={{ color: 'var(--muted)' }}>
                  {rupeeCompact(showFutureRupees ? result.exit.lumpSumExemptInr : result.exit.lumpSumExemptRealInr)} exempt,{' '}
                  {rupeeCompact(showFutureRupees ? result.exit.lumpSumPotentiallyTaxableInr : result.exit.lumpSumPotentiallyTaxableRealInr)} potentially taxable
                </div>
              </Card>
              <Card>
                <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
                  Estimated pension
                </div>
                <div className="num mb-0.5 text-[28px] font-medium leading-none tracking-tight">
                  {rupee(showFutureRupees ? result.exit.estimatedMonthlyPensionInr : result.exit.estimatedMonthlyPensionRealInr)}/mo
                </div>
                <div className="text-[11px]" style={{ color: 'var(--muted)' }}>
                  from a {rupeeCompact(showFutureRupees ? result.exit.annuityPurchaseInr : result.exit.annuityPurchaseRealInr)} annuity purchase at {pct(form.annuityRatePct)}
                </div>
              </Card>
            </div>

            <Card>
              <h2 className="mb-1 text-[15px] font-semibold">Corpus growth</h2>
              <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
                Tier I corpus vs. money contributed to date (you + employer).
              </p>
              <CorpusChart result={result} showFutureRupees={showFutureRupees} theme={theme} />
            </Card>

            <Card>
              <h2 className="mb-1 text-[15px] font-semibold">Equity share over time</h2>
              <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
                {form.allocationMode === 'auto' ? `${LIFECYCLE_LABELS[form.lifecycleFund]}'s age-based glide.` : 'Active Choice — fixed for the whole horizon.'}
              </p>
              <EquityGlideChart result={result} theme={theme} />
            </Card>

            <Card>
              <h2 className="mb-2 text-[15px] font-semibold">Exit breakdown</h2>
              <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
                <dt style={{ color: 'var(--muted)' }}>Applicable slab's max lump sum</dt>
                <dd className="num text-right font-semibold">{pct(result.exit.maxLumpSumAllowedPct, 0)}</dd>
                <dt style={{ color: 'var(--muted)' }}>Requested</dt>
                <dd className="num text-right font-semibold">{pct(form.lumpSumWithdrawalPct, 0)}</dd>
                <dt style={{ color: 'var(--muted)' }}>Lump sum taken</dt>
                <dd className="num text-right font-semibold">{rupeeCompact(showFutureRupees ? result.exit.lumpSumTakenInr : result.exit.lumpSumTakenRealInr)}</dd>
                <dt style={{ color: 'var(--muted)' }}>— tax-exempt (≤{pct(npsRules.exit.lumpSumTaxExemptFractionOfCorpus * 100, 0)} of corpus)</dt>
                <dd className="num text-right font-semibold">{rupeeCompact(showFutureRupees ? result.exit.lumpSumExemptInr : result.exit.lumpSumExemptRealInr)}</dd>
                <dt style={{ color: 'var(--muted)' }}>— potentially taxable</dt>
                <dd className="num text-right font-semibold">{rupeeCompact(showFutureRupees ? result.exit.lumpSumPotentiallyTaxableInr : result.exit.lumpSumPotentiallyTaxableRealInr)}</dd>
                <dt className="col-span-2 my-1 h-px" style={{ background: 'var(--rule)' }} />
                <dt style={{ color: 'var(--muted)' }}>Annuity purchase</dt>
                <dd className="num text-right font-semibold">{rupeeCompact(showFutureRupees ? result.exit.annuityPurchaseInr : result.exit.annuityPurchaseRealInr)}</dd>
                <dt style={{ color: 'var(--muted)' }}>Estimated monthly pension</dt>
                <dd className="num text-right font-semibold">{rupee(showFutureRupees ? result.exit.estimatedMonthlyPensionInr : result.exit.estimatedMonthlyPensionRealInr)}</dd>
              </dl>
            </Card>

            <Card>
              <h2 className="mb-2 text-[15px] font-semibold">Tax benefits (80CCD)</h2>
              <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
                <dt style={{ color: 'var(--muted)' }}>Your contribution, 80CCD(1) — old regime only</dt>
                <dd className="num text-right font-semibold">up to {pct(npsRules.taxBenefits.selfContributionPctOfSalaryCapOldRegime, 0)} of salary</dd>
                <dt style={{ color: 'var(--muted)' }}>Additional self-contribution, 80CCD(1B) — old regime only</dt>
                <dd className="num text-right font-semibold">up to {rupeeCompact(npsRules.taxBenefits.additionalSelfContributionCapInr)}</dd>
                <dt style={{ color: 'var(--muted)' }}>Employer's contribution, 80CCD(2) — {form.taxRegime} regime, {form.sector === 'government' ? 'government' : 'non-government'}</dt>
                <dd className="num text-right font-semibold">up to {pct(employerContributionBenefitPct, 0)} of salary</dd>
              </dl>
              <p className="mt-2 text-[10.5px] leading-snug" style={{ color: 'var(--muted)' }}>
                Reference figures only — not wired into a computed deduction here; your actual benefit depends on your full return.
              </p>
            </Card>

            <Card>
              <h2 className="mb-2 text-[15px] font-semibold">Year by year</h2>
              <div className="max-h-96 overflow-auto rounded-md border" style={{ borderColor: 'var(--rule)' }}>
                <table className="w-full text-xs">
                  <thead style={{ background: 'var(--panel)', position: 'sticky', top: 0 }}>
                    <tr>
                      {['Year', 'Age', 'You contributed', 'Employer contributed', 'Equity share', 'Corpus at year end'].map((h) => (
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
                        <td className="border-b p-2 text-right num" style={{ borderColor: 'var(--rule)' }}>{rupee(showFutureRupees ? y.employeeContributionThisYearInr : y.employeeContributionThisYearRealInr)}</td>
                        <td className="border-b p-2 text-right num" style={{ borderColor: 'var(--rule)' }}>{rupee(showFutureRupees ? y.employerContributionThisYearInr : y.employerContributionThisYearRealInr)}</td>
                        <td className="border-b p-2 text-right num" style={{ borderColor: 'var(--rule)' }}>{pct(y.equitySharePct, 0)}</td>
                        <td className="border-b p-2 text-right num" style={{ borderColor: 'var(--rule)' }}>{rupee(showFutureRupees ? y.corpusAtYearEndInr : y.corpusAtYearEndRealInr)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card>
              <h2 className="mb-2 text-[15px] font-semibold">Assumptions &amp; data</h2>
              <ul className="list-disc space-y-1.5 pl-5 text-xs" style={{ color: 'var(--ink2)' }}>
                <li>Tier I only — Tier II (the voluntary, no-lock-in account) and partial withdrawals before exit are out of scope for this module.</li>
                <li>
                  Every figure can be shown in future (nominal) or today's (real) rupees via the toggle above — today's-money figures deflate by this year's own
                  elapsed-inflation factor, resolved once per simulation year rather than per month (see <code>nps-simulator.ts</code>'s own doc comment); the shared
                  inflation assumption is set in the Inflation section of the sidebar, same figure REIT income, SIP &amp; SWP, and EPF &amp; VPF use.
                </li>
                <li>
                  Auto Choice's lifecycle funds (LC75/LC50/LC25) glide equity down by age along PFRDA's published checkpoints; the non-equity remainder uses one blended "debt" return
                  (your Corporate Debt / Government Securities / Alternative assumptions, averaged) rather than a separately-sourced split for each lifecycle fund — that sub-split
                  isn't independently confirmed against a primary source.
                </li>
                <li>
                  Exit withdrawal slabs reflect PFRDA's 16 Dec 2025 relaxation (up to 80% lump sum for non-government subscribers above ₹12L corpus, up to 60% for government
                  subscribers). The lump-sum tax exemption here is conservatively capped at {pct(npsRules.exit.lumpSumTaxExemptFractionOfCorpus * 100, 0)} of the corpus — Section
                  10(12A)'s exemption has not been confirmed to have been raised to match PFRDA's new ceiling, so a lump sum taken above that fraction is flagged as potentially taxable
                  pending clarification. See claude/pf-nps-research-and-plan.md for sourcing.
                </li>
                <li>The annuity estimate is a simple yield model (purchase price × assumed rate ÷ 12), matching the official NPS Trust calculator's own approach — not a specific insurer's annuity product, which varies by provider and annuity type.</li>
                <li>Return assumptions per asset class are illustrative starting points you're expected to edit, not sourced forecasts. EPFO interest crediting conventions don't apply here — NPS returns are market-linked.</li>
                <li>Not modelled: partial withdrawals, Tier II, premature exit before the vesting period, and the ₹7.5L aggregate-employer-contribution ceiling across NPS + PF + superannuation.</li>
              </ul>
            </Card>
          </main>
        </div>
      </div>
    </div>
  );
}
