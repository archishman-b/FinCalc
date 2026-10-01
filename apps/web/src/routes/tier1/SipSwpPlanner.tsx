import { useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatINR } from '@fincalc/ui';
import {
  SCENARIO_ADJUSTMENTS,
  simulateSipSwp,
  sipSwpSustainableMonthlyWithdrawal,
  type SipSwpHoldingInput,
  type SipSwpHoldingType,
  type SipSwpScenario,
  type SipSwpSellFrom,
  type SipSwpSimulatorInput,
  type SipSwpSimulatorResult,
  type SipSwpWithdrawalMode,
} from '@fincalc/engine';

import { Card, FieldRow, Segmented, SliderField, Stepper } from '../../components/GraphiteFields';
import { GraphiteModuleHeader, TickerItem, TickerLabel } from '../../components/GraphiteModuleHeader';
import { GRAPHITE_CSS_VARS, graphiteChartColors, useGraphiteTheme, type GraphiteTheme } from '../../lib/graphite-theme';
import {
  ALLOCATION_PRESETS,
  DEFAULT_FD_RATE_PCT,
  DEFAULT_HOLDINGS,
  SIP_SWP_FORM_DEFAULTS,
  type SipSwpAllocationPresetId,
} from '../../lib/sip-swp-assumptions';
import { useSharedTaxSettings, type SharedTaxSettings } from '../../lib/shared-tax-settings';

/**
 * SIP & SWP planner — "Part B" of the two-part build, a full port of a
 * hand-built single-file prototype (sip-swp-planner.html, saved as a
 * project doc) the user verified separately and treated as the spec, not
 * code to copy. "Part A" (this route's module tab, shared Graphite theme
 * and toggle) shipped first as a placeholder; this is the real simulator.
 *
 * Follows the REIT Portfolio Builder's own architecture closely rather
 * than inventing a second pattern: the five small form components
 * (`FieldRow`/`Stepper`/`SliderField`/`Segmented`/`Card`) now live in
 * `components/GraphiteFields.tsx`, extracted out of `ReitPortfolioBuilder.tsx`
 * once this route needed the identical pieces — see that file's own module
 * doc comment. Capital-gains and inflation assumptions come from
 * `useSharedTaxSettings()` rather than a second local copy, so a rate
 * edited here is already filled in on the REIT module and vice versa (see
 * `lib/shared-tax-settings.ts` for the ₹1.25L-shared-exemption caveat this
 * implies, stated again in the Assumptions card below).
 *
 * The simulation itself is entirely `@fincalc/engine`'s `simulateSipSwp()`
 * and `sipSwpSustainableMonthlyWithdrawal()` (see sip-swp-simulator.ts for
 * why this doesn't reuse `positions/sip.ts`'s value-based helpers) — this
 * file is presentation only: it builds the simulator's input from form
 * state, runs the simulation, and renders the result. The five example
 * holdings and four allocation presets are illustrative UI defaults
 * (`lib/sip-swp-assumptions.ts`), not sourced data — every holding's
 * return, expense ratio and weight is a live, user-editable form field.
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

const TAX_TYPE_LABELS: Record<SipSwpHoldingType, string> = { equity: 'Equity', debt: 'Debt', other: 'Other' };
const WITHDRAWAL_MODE_LABELS: Record<SipSwpWithdrawalMode, string> = {
  fixed: 'Fixed amount a month',
  percent_of_corpus: 'Fixed % of the corpus',
  spread: 'Spread over N years',
  lump_sum_at_start: 'All at once',
};
const SELL_FROM_LABELS: Record<SipSwpSellFrom, string> = {
  proportional: 'All holdings in proportion',
  safest_first: 'Safest holdings first',
};

function netReturnPct(h: { returnPct: number; expenseRatioPct: number; type: SipSwpHoldingType }, scenario: SipSwpScenario): number {
  return h.returnPct + SCENARIO_ADJUSTMENTS[scenario][h.type] - h.expenseRatioPct;
}

/* ---------- form state ---------- */

interface HoldingRowState {
  key: string;
  name: string;
  on: boolean;
  type: SipSwpHoldingType;
  returnPct: number;
  expenseRatioPct: number;
  weightPct: number;
}

function defaultHoldingRows(): HoldingRowState[] {
  const weights = ALLOCATION_PRESETS[SIP_SWP_FORM_DEFAULTS.allocationPreset === 'custom' ? 'aggr' : SIP_SWP_FORM_DEFAULTS.allocationPreset].weightByKey;
  return DEFAULT_HOLDINGS.map((h) => ({
    key: h.key,
    name: h.name,
    on: true,
    type: h.type,
    returnPct: h.returnPct,
    expenseRatioPct: h.expenseRatioPct,
    weightPct: weights[h.key] ?? 0,
  }));
}

interface OneOffRowState {
  id: string;
  on: boolean;
  label: string;
  year: number;
  amountInr: number;
}

interface FormState {
  holdings: HoldingRowState[];
  lumpsumInr: number;
  monthlySipInr: number;
  sipStepUpPctPerYear: number;
  sipWindowYears: number;
  withdrawalStartYear: number;
  horizonYears: number;
  withdrawalMode: SipSwpWithdrawalMode;
  fixedMonthlyWithdrawalInr: number;
  tieFixedWithdrawalToInflation: boolean;
  fixedWithdrawalGrowthPctPerYear: number;
  withdrawalRatePctOfCorpus: number;
  spreadOverYears: number;
  sellFrom: SipSwpSellFrom;
  oneOffWithdrawals: OneOffRowState[];
  glide: boolean;
  glideYears: number;
  targetEquitySharePct: number;
  rebalanceAnnually: boolean;
  scenario: SipSwpScenario;
  fdRatePct: number;
}

function defaultFormState(): FormState {
  return {
    holdings: defaultHoldingRows(),
    lumpsumInr: SIP_SWP_FORM_DEFAULTS.lumpsumInr,
    monthlySipInr: SIP_SWP_FORM_DEFAULTS.monthlySipInr,
    sipStepUpPctPerYear: SIP_SWP_FORM_DEFAULTS.sipStepUpPctPerYear,
    sipWindowYears: SIP_SWP_FORM_DEFAULTS.sipWindowYears,
    withdrawalStartYear: SIP_SWP_FORM_DEFAULTS.withdrawalStartYear,
    horizonYears: SIP_SWP_FORM_DEFAULTS.horizonYears,
    withdrawalMode: SIP_SWP_FORM_DEFAULTS.withdrawalMode,
    fixedMonthlyWithdrawalInr: SIP_SWP_FORM_DEFAULTS.fixedMonthlyWithdrawalInr,
    tieFixedWithdrawalToInflation: SIP_SWP_FORM_DEFAULTS.tieFixedWithdrawalToInflation,
    fixedWithdrawalGrowthPctPerYear: SIP_SWP_FORM_DEFAULTS.fixedWithdrawalGrowthPctPerYear,
    withdrawalRatePctOfCorpus: SIP_SWP_FORM_DEFAULTS.withdrawalRatePctOfCorpus,
    spreadOverYears: SIP_SWP_FORM_DEFAULTS.spreadOverYears,
    sellFrom: SIP_SWP_FORM_DEFAULTS.sellFrom,
    oneOffWithdrawals: [],
    glide: SIP_SWP_FORM_DEFAULTS.glide,
    glideYears: SIP_SWP_FORM_DEFAULTS.glideYears,
    targetEquitySharePct: SIP_SWP_FORM_DEFAULTS.targetEquitySharePct,
    rebalanceAnnually: SIP_SWP_FORM_DEFAULTS.rebalanceAnnually,
    scenario: SIP_SWP_FORM_DEFAULTS.scenario,
    fdRatePct: DEFAULT_FD_RATE_PCT,
  };
}

function toSimulatorInput(form: FormState, tax: SharedTaxSettings): SipSwpSimulatorInput {
  const holdings: SipSwpHoldingInput[] = form.holdings
    .filter((h) => h.on)
    .map((h) => ({
      key: h.key,
      name: h.name,
      type: h.type,
      returnPct: h.returnPct,
      expenseRatioPct: h.expenseRatioPct,
      weightPct: h.weightPct,
    }));
  return {
    holdings,
    lumpsumInr: form.lumpsumInr,
    monthlySipInr: form.monthlySipInr,
    sipStepUpPctPerYear: form.sipStepUpPctPerYear,
    sipWindowYears: form.sipWindowYears,
    withdrawalStartYear: form.withdrawalStartYear,
    horizonYears: form.horizonYears,
    withdrawalMode: form.withdrawalMode,
    fixedMonthlyWithdrawalInr: form.fixedMonthlyWithdrawalInr,
    tieFixedWithdrawalToInflation: form.tieFixedWithdrawalToInflation,
    fixedWithdrawalGrowthPctPerYear: form.fixedWithdrawalGrowthPctPerYear,
    withdrawalRatePctOfCorpus: form.withdrawalRatePctOfCorpus,
    spreadOverYears: form.spreadOverYears,
    sellFrom: form.sellFrom,
    oneOffWithdrawals: form.oneOffWithdrawals.filter((e) => e.on).map((e) => ({ year: e.year, amountInr: e.amountInr })),
    glide: form.glide,
    glideYears: form.glideYears,
    targetEquitySharePct: form.targetEquitySharePct,
    rebalanceAnnually: form.rebalanceAnnually,
    scenario: form.scenario,
    inflationPct: tax.inflationPct,
    slabRatePct: tax.slabRatePct,
    equityLtcgRatePct: tax.equityLtcgRatePct,
    equityStcgRatePct: tax.equityStcgRatePct,
    equityLtcgExemptionInr: tax.equityLtcgExemptionInr,
    otherLtcgRatePct: tax.otherLtcgRatePct,
    capitalGainsCessPct: tax.capitalGainsCessPct,
  };
}

/* ---------- charts ---------- */

function CorpusChart({ result, showFutureRupees, theme }: { result: SipSwpSimulatorResult; showFutureRupees: boolean; theme: GraphiteTheme }) {
  const colors = graphiteChartColors(theme);
  const data = result.yearly.map((y) => ({
    year: y.year,
    corpus: showFutureRupees ? y.corpusAtYearEndNominalInr : y.corpusAtYearEndRealInr,
    paidIn: showFutureRupees ? y.paidInToDateNominalInr : y.paidInToDateRealInr,
  }));
  return (
    <div className="h-72 w-full" role="img" aria-label="Corpus and money paid in to date, by year">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.rule} vertical={false} />
          <XAxis dataKey="year" tickFormatter={(v: number) => `Yr ${v}`} tick={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, fill: colors.ink2 }} axisLine={{ stroke: colors.rule }} tickLine={false} />
          <YAxis tickFormatter={(v: number) => rupeeCompact(v)} tick={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, fill: colors.ink2 }} axisLine={false} tickLine={false} width={64} />
          <Tooltip
            formatter={(v, name) => [rupeeCompact(Number(v)), name === 'corpus' ? 'Corpus' : 'Paid in to date']}
            labelFormatter={(v) => `Year ${v}`}
            contentStyle={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, background: colors.paper, border: `1px solid ${colors.rule}`, borderRadius: 4 }}
          />
          <Legend formatter={(v) => (v === 'corpus' ? 'Corpus' : 'Paid in to date')} wrapperStyle={{ fontSize: 11.5, fontFamily: 'ui-sans-serif, system-ui, sans-serif' }} />
          <Line isAnimationActive={false} type="monotone" dataKey="corpus" name="corpus" stroke={colors.accent} strokeWidth={2.5} dot={false} />
          <Line isAnimationActive={false} type="monotone" dataKey="paidIn" name="paidIn" stroke={colors.line2} strokeWidth={1.75} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function FlowChart({ result, showFutureRupees, theme }: { result: SipSwpSimulatorResult; showFutureRupees: boolean; theme: GraphiteTheme }) {
  const colors = graphiteChartColors(theme);
  const data = result.yearly.map((y) => ({
    year: y.year,
    paid: (showFutureRupees ? y.paidInThisYearNominalInr : y.paidInThisYearRealInr) / 12,
    withdrawn: (showFutureRupees ? y.netWithdrawalThisYearNominalInr : y.netWithdrawalThisYearRealInr) / 12,
    tax: (showFutureRupees ? y.taxThisYearNominalInr : y.taxThisYearRealInr) / 12,
  }));
  return (
    <div className="h-64 w-full" role="img" aria-label="Money in and out each month, by year">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.rule} vertical={false} />
          <XAxis dataKey="year" tickFormatter={(v: number) => `Yr ${v}`} tick={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, fill: colors.ink2 }} axisLine={{ stroke: colors.rule }} tickLine={false} />
          <YAxis tickFormatter={(v: number) => rupeeCompact(v)} tick={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, fill: colors.ink2 }} axisLine={false} tickLine={false} width={60} />
          <Tooltip formatter={(v, name) => [rupeeCompact(Number(v)), name === 'paid' ? 'SIP paid' : name === 'withdrawn' ? 'Withdrawn, after tax' : 'Tax']} labelFormatter={(v) => `Year ${v}`} contentStyle={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, background: colors.paper, border: `1px solid ${colors.rule}`, borderRadius: 4 }} />
          <Legend formatter={(v) => (v === 'paid' ? 'SIP paid' : v === 'withdrawn' ? 'Withdrawn, after tax' : 'Tax')} wrapperStyle={{ fontSize: 11.5, fontFamily: 'ui-sans-serif, system-ui, sans-serif' }} />
          <Bar isAnimationActive={false} dataKey="paid" name="paid" fill={colors.line2} fillOpacity={0.7} />
          <Bar isAnimationActive={false} dataKey="withdrawn" name="withdrawn" fill={colors.accent} fillOpacity={0.7} />
          <Bar isAnimationActive={false} dataKey="tax" name="tax" fill={colors.s3} fillOpacity={0.7} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function MixChart({ result, view, theme }: { result: SipSwpSimulatorResult; view: 'mix' | 'tax'; theme: GraphiteTheme }) {
  const colors = graphiteChartColors(theme);
  const data = result.yearly.map((y) => ({
    year: y.year,
    equity: y.equityShareAtYearEndPct,
    tax: y.taxThisYearNominalInr,
  }));
  return (
    <div className="h-64 w-full" role="img" aria-label={view === 'mix' ? 'Equity share by year' : 'Tax paid by year'}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.rule} vertical={false} />
          <XAxis dataKey="year" tickFormatter={(v: number) => `Yr ${v}`} tick={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, fill: colors.ink2 }} axisLine={{ stroke: colors.rule }} tickLine={false} />
          <YAxis
            tickFormatter={(v: number) => (view === 'mix' ? `${Math.round(v)}%` : rupeeCompact(v))}
            tick={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, fill: colors.ink2 }}
            axisLine={false}
            tickLine={false}
            width={56}
            {...(view === 'mix' ? { domain: [0, 100] } : {})}
          />
          <Tooltip formatter={(v) => [view === 'mix' ? `${Number(v).toFixed(0)}%` : rupeeCompact(Number(v)), view === 'mix' ? 'Equity share' : 'Tax']} labelFormatter={(v) => `Year ${v}`} contentStyle={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, background: colors.paper, border: `1px solid ${colors.rule}`, borderRadius: 4 }} />
          {view === 'mix' ? (
            <Line isAnimationActive={false} type="monotone" dataKey="equity" stroke={colors.accent} strokeWidth={2.25} dot={false} />
          ) : (
            <Bar isAnimationActive={false} dataKey="tax" fill={colors.s3} fillOpacity={0.7} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- main route ---------- */

export function SipSwpPlanner() {
  const { theme, toggle: toggleTheme } = useGraphiteTheme();
  const taxSettings = useSharedTaxSettings();
  const [form, setForm] = useState<FormState>(() => defaultFormState());
  const [showFutureRupees, setShowFutureRupees] = useState(false);
  const [allocationPreset, setAllocationPreset] = useState<SipSwpAllocationPresetId>(SIP_SWP_FORM_DEFAULTS.allocationPreset);
  const [mixView, setMixView] = useState<'mix' | 'tax'>('mix');

  const simulatorInput = useMemo(() => toSimulatorInput(form, taxSettings.settings), [form, taxSettings.settings]);
  const result = useMemo(() => simulateSipSwp(simulatorInput), [simulatorInput]);
  const sustainableMonthly = useMemo(() => sipSwpSustainableMonthlyWithdrawal(simulatorInput), [simulatorInput]);

  const activeHoldings = form.holdings.filter((h) => h.on);
  const hasHoldings = activeHoldings.length > 0;
  const activeWeightSum = activeHoldings.reduce((a, h) => a + Math.max(0, h.weightPct), 0);
  const activeEquitySharePct = activeWeightSum > 0 ? (activeHoldings.reduce((a, h) => a + (h.type === 'equity' ? Math.max(0, h.weightPct) : 0), 0) / activeWeightSum) * 100 : 0;

  function updateHolding(key: string, patch: Partial<HoldingRowState>) {
    setForm((f) => ({ ...f, holdings: f.holdings.map((h) => (h.key === key ? { ...h, ...patch } : h)) }));
    setAllocationPreset('custom');
  }

  function applyAllocationPreset(id: Exclude<SipSwpAllocationPresetId, 'custom'>) {
    const weights = ALLOCATION_PRESETS[id].weightByKey;
    setForm((f) => ({
      ...f,
      holdings: f.holdings.map((h) => {
        const w = weights[h.key] ?? 0;
        return { ...h, weightPct: w, on: w > 0 ? true : h.on };
      }),
    }));
    setAllocationPreset(id);
  }

  function addHolding() {
    const key = `custom-${Date.now()}`;
    setForm((f) => ({
      ...f,
      holdings: [...f.holdings, { key, name: 'New holding', on: true, type: 'equity', returnPct: 10, expenseRatioPct: 0.5, weightPct: 0 }],
    }));
    setAllocationPreset('custom');
  }

  function addOneOff() {
    if (form.oneOffWithdrawals.length >= 6) return;
    const id = `evt-${Date.now()}`;
    setForm((f) => ({
      ...f,
      oneOffWithdrawals: [
        ...f.oneOffWithdrawals,
        { id, on: true, label: 'Planned expense', year: Math.min(f.horizonYears, Math.max(2, f.sipWindowYears - 2)), amountInr: 1_000_000 },
      ],
    }));
  }

  function updateOneOff(id: string, patch: Partial<OneOffRowState>) {
    setForm((f) => ({ ...f, oneOffWithdrawals: f.oneOffWithdrawals.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
  }

  function resetToDefaults() {
    setForm(defaultFormState());
    setAllocationPreset(SIP_SWP_FORM_DEFAULTS.allocationPreset);
  }

  const deflator = showFutureRupees ? 1 : result.inflationDeflatorAtHorizon;
  const unit = showFutureRupees ? 'future ₹' : "today's ₹";
  const SS = form.withdrawalStartYear;
  const Y = form.horizonYears;
  const ssRow = result.yearly[SS - 1];
  const lastDepletionYear = result.depletionMonth !== null ? Math.floor(result.depletionMonth / 12) + 1 : null;
  const isLumpSum = form.withdrawalMode === 'lump_sum_at_start';
  const monthDivisor = isLumpSum ? 1 : 12;

  const paidBeforeWithdrawalsReal = result.yearly.slice(0, SS - 1).reduce((a, y) => a + y.paidInThisYearRealInr, 0);
  const paidBeforeWithdrawalsNominal = result.yearly.slice(0, SS - 1).reduce((a, y) => a + y.paidInThisYearNominalInr, 0);

  const totalGrossAllYears = result.yearly.reduce((a, y) => a + y.grossWithdrawalThisYearNominalInr, 0);
  const totalTaxAllYears = result.yearly.reduce((a, y) => a + y.taxThisYearNominalInr, 0);
  const totalRebalancingTaxAllYears = result.yearly.reduce((a, y) => a + y.taxOnRebalancingThisYearNominalInr, 0);
  const totalWithdrawalTax = totalTaxAllYears - totalRebalancingTaxAllYears;
  const totalOneOffReal = result.yearly.reduce((a, y) => a + y.oneOffWithdrawalThisYearRealInr, 0);

  const net1 = ssRow ? (showFutureRupees ? ssRow.netWithdrawalThisYearNominalInr : ssRow.netWithdrawalThisYearRealInr) / monthDivisor : 0;
  const gross1 = ssRow ? (showFutureRupees ? ssRow.grossWithdrawalThisYearNominalInr : ssRow.grossWithdrawalThisYearRealInr) / monthDivisor : 0;
  const tax1 = ssRow ? (showFutureRupees ? ssRow.taxThisYearNominalInr : ssRow.taxThisYearRealInr) / monthDivisor : 0;
  const rebalTax1Nominal = ssRow ? ssRow.taxOnRebalancingThisYearNominalInr / monthDivisor : 0;

  const fdMonthly = (result.corpusAtWithdrawalStartRealInr * (form.fdRatePct / 100) * (1 - taxSettings.settings.slabRatePct / 100)) / 12;

  const realXirrPct = result.xirrPct !== null ? ((1 + result.xirrPct / 100) / (1 + taxSettings.settings.inflationPct / 100) - 1) * 100 : null;

  const withdrawalModeSentence: Record<SipSwpWithdrawalMode, string> = {
    fixed: `${rupee(form.fixedMonthlyWithdrawalInr)} a month in today's money, ${form.tieFixedWithdrawalToInflation ? 'rising with inflation' : `rising ${form.fixedWithdrawalGrowthPctPerYear}% a year`}`,
    percent_of_corpus: `${form.withdrawalRatePctOfCorpus}% of the corpus a year, reset each year`,
    spread: `an equal share of what's left each month, emptying the corpus over ${form.spreadOverYears} years`,
    lump_sum_at_start: 'the whole corpus sold at the start of the withdrawal year',
  };

  let badgeText: string;
  let badgeBad = false;
  if (isLumpSum) badgeText = 'One-time exit';
  else if (form.withdrawalMode === 'spread') badgeText = 'Planned to empty';
  else if (lastDepletionYear !== null) {
    badgeText = `Runs out in year ${lastDepletionYear}`;
    badgeBad = true;
  } else badgeText = `Lasts ${Y} years`;

  const tickerContent = hasHoldings && (
    <>
      <TickerLabel>Assumptions · {form.scenario} case</TickerLabel>
      {activeHoldings.map((h) => (
        <TickerItem
          key={h.key}
          label={h.name}
          value={activeWeightSum > 0 ? pct((Math.max(0, h.weightPct) / activeWeightSum) * 100, 0) : '0%'}
          highlight={pct(netReturnPct(h, form.scenario), 2)}
        />
      ))}
    </>
  );

  return (
    <div className="graphite -m-4 min-h-screen" data-theme={theme}>
      <style>{GRAPHITE_CSS_VARS}</style>
      <GraphiteModuleHeader active="sip-swp" moduleLabel="SIP & SWP planner" theme={theme} onToggleTheme={toggleTheme} ticker={tickerContent} />

      <div className="mx-auto max-w-[1400px] p-4 sm:p-6">
        <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--acctext)' }}>
          {Y}-year plan · {unit}
        </div>
        {hasHoldings ? (
          <p className="mb-5 max-w-[70ch] text-lg leading-snug" style={{ color: 'var(--ink)' }}>
            You put in <strong>{rupeeCompact(result.totalContributedNominalInr)}</strong> ({rupeeCompact(result.totalContributedRealInr)} in today's money)
            over {form.sipWindowYears} years. The corpus peaks at <strong style={{ color: 'var(--acctext)' }}>{rupeeCompact(result.peakCorpusRealInr)}</strong> in
            today's rupees in year {result.peakCorpusYear}. Withdrawing {withdrawalModeSentence[form.withdrawalMode]}, starting year {SS},{' '}
            {isLumpSum ? (
              <>pays <strong>{rupeeCompact(net1)}</strong> after tax.</>
            ) : lastDepletionYear !== null ? (
              <>runs the money out in <strong>year {lastDepletionYear}</strong>, before the {Y}-year horizon.</>
            ) : (
              <>lasts the full horizon and leaves <strong>{rupeeCompact(result.corpusAtHorizonNominalInr / deflator)}</strong>.</>
            )}
          </p>
        ) : (
          <p className="mb-5 text-sm" style={{ color: 'var(--muted)' }}>
            Include at least one holding in the portfolio table below to see results.
          </p>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
          {/* ---------- sidebar / assumptions ---------- */}
          <aside className="rounded-lg border p-4" style={{ background: 'var(--rail)', borderColor: 'var(--rule)' }}>
            <h2 className="mb-2 mt-1 text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--acctext)' }}>
              Money in · total
            </h2>
            <FieldRow label="Lumpsum at start (₹)">
              <Stepper value={form.lumpsumInr} onChange={(v) => setForm((f) => ({ ...f, lumpsumInr: v }))} step={100_000} min={0} />
            </FieldRow>
            <FieldRow label="Monthly SIP (₹)">
              <Stepper value={form.monthlySipInr} onChange={(v) => setForm((f) => ({ ...f, monthlySipInr: v }))} step={5_000} min={0} />
            </FieldRow>
            <FieldRow label="SIP step-up" hint="% a year">
              <Stepper value={form.sipStepUpPctPerYear} onChange={(v) => setForm((f) => ({ ...f, sipStepUpPctPerYear: v }))} step={1} min={0} max={50} suffix="%" />
            </FieldRow>

            <h2 className="mb-2 mt-4 border-t pt-3 text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--acctext)', borderColor: 'var(--rule)' }}>
              Allocation across holdings
            </h2>
            <div className="mb-2.5 flex flex-wrap gap-1.5">
              {(Object.keys(ALLOCATION_PRESETS) as Exclude<SipSwpAllocationPresetId, 'custom'>[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => applyAllocationPreset(p)}
                  className="flex-1 rounded border px-2 py-1.5 text-[11.5px] font-medium"
                  style={allocationPreset === p ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)', color: 'var(--ink)' } : { borderColor: 'var(--rule)', color: 'var(--ink2)' }}
                >
                  {ALLOCATION_PRESETS[p].label}
                </button>
              ))}
            </div>
            <p className="mb-1 text-[10.5px] leading-snug" style={{ color: 'var(--muted)' }}>
              {allocationPreset === 'custom' ? "Custom split. Weights are scaled to 100% if they don't add up." : ALLOCATION_PRESETS[allocationPreset].message}
            </p>
            <p className="mb-3 text-[10.5px]" style={{ color: 'var(--muted)' }}>
              Active equity share: {pct(activeEquitySharePct, 0)}
            </p>

            <h2 className="mb-2 mt-4 border-t pt-3 text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--acctext)', borderColor: 'var(--rule)' }}>
              Timeline
            </h2>
            <SliderField label="SIP runs for" hint="years you invest monthly" value={form.sipWindowYears} onChange={(v) => setForm((f) => ({ ...f, sipWindowYears: Math.round(v) }))} min={0} max={50} step={1} />
            <SliderField label="Withdrawals start in" hint="year number" value={form.withdrawalStartYear} onChange={(v) => setForm((f) => ({ ...f, withdrawalStartYear: Math.round(v) }))} min={1} max={50} step={1} />
            <SliderField label="Total horizon" hint="years" value={form.horizonYears} onChange={(v) => setForm((f) => ({ ...f, horizonYears: Math.round(v) }))} min={1} max={50} step={1} />

            <h2 className="mb-2 mt-4 border-t pt-3 text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--acctext)', borderColor: 'var(--rule)' }}>
              Withdrawals (SWP)
            </h2>
            <select
              value={form.withdrawalMode}
              onChange={(e) => setForm((f) => ({ ...f, withdrawalMode: e.target.value as SipSwpWithdrawalMode }))}
              className="mb-3 h-8 w-full rounded border px-2 text-xs"
              style={{ background: 'var(--field)', borderColor: 'var(--rule)', color: 'var(--ink)' }}
            >
              {(Object.keys(WITHDRAWAL_MODE_LABELS) as SipSwpWithdrawalMode[]).map((m) => (
                <option key={m} value={m}>
                  {WITHDRAWAL_MODE_LABELS[m]}
                </option>
              ))}
            </select>
            {form.withdrawalMode === 'fixed' && (
              <>
                <FieldRow label="Monthly withdrawal (₹)" hint="in today's money, before tax">
                  <Stepper value={form.fixedMonthlyWithdrawalInr} onChange={(v) => setForm((f) => ({ ...f, fixedMonthlyWithdrawalInr: v }))} step={5_000} min={0} />
                </FieldRow>
                <label className="mb-2.5 flex cursor-pointer items-start gap-2 text-xs" style={{ color: 'var(--ink2)' }}>
                  <input
                    type="checkbox"
                    checked={form.tieFixedWithdrawalToInflation}
                    onChange={(e) => setForm((f) => ({ ...f, tieFixedWithdrawalToInflation: e.target.checked }))}
                    className="mt-0.5"
                  />
                  Rise with inflation each year <small className="block" style={{ color: 'var(--muted)' }}>keeps its buying power</small>
                </label>
                {!form.tieFixedWithdrawalToInflation && (
                  <FieldRow label="Yearly increase" hint="% a year, if not tied">
                    <Stepper value={form.fixedWithdrawalGrowthPctPerYear} onChange={(v) => setForm((f) => ({ ...f, fixedWithdrawalGrowthPctPerYear: v }))} step={0.5} min={0} max={20} suffix="%" />
                  </FieldRow>
                )}
              </>
            )}
            {form.withdrawalMode === 'percent_of_corpus' && (
              <SliderField
                label="Withdrawal rate"
                hint="% of the corpus a year, reset each year"
                value={form.withdrawalRatePctOfCorpus}
                onChange={(v) => setForm((f) => ({ ...f, withdrawalRatePctOfCorpus: v }))}
                min={0.5}
                max={20}
                step={0.5}
                suffix="%"
              />
            )}
            {form.withdrawalMode === 'spread' && (
              <SliderField label="Spread over" hint="years; empties the corpus by the end" value={form.spreadOverYears} onChange={(v) => setForm((f) => ({ ...f, spreadOverYears: Math.round(v) }))} min={1} max={40} step={1} />
            )}
            <select
              value={form.sellFrom}
              onChange={(e) => setForm((f) => ({ ...f, sellFrom: e.target.value as SipSwpSellFrom }))}
              className="mb-1 h-8 w-full rounded border px-2 text-xs"
              style={{ background: 'var(--field)', borderColor: 'var(--rule)', color: 'var(--ink)' }}
              aria-label="Sell from"
            >
              {(Object.keys(SELL_FROM_LABELS) as SipSwpSellFrom[]).map((s) => (
                <option key={s} value={s}>
                  {SELL_FROM_LABELS[s]}
                </option>
              ))}
            </select>

            <h2 className="mb-2 mt-4 border-t pt-3 text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--acctext)', borderColor: 'var(--rule)' }}>
              One-off withdrawals
            </h2>
            <p className="mb-2.5 text-[10.5px] leading-snug" style={{ color: 'var(--muted)' }}>
              Planned big expenses, in today's money, taken at the start of the year you set, on top of any SWP.
            </p>
            {form.oneOffWithdrawals.map((e) => (
              <div key={e.id} className="mb-2 rounded border p-2" style={{ borderColor: 'var(--rule)', background: 'var(--field)', opacity: e.on ? 1 : 0.55 }}>
                <div className="mb-1.5 flex items-center gap-1.5">
                  <input type="checkbox" checked={e.on} onChange={(ev) => updateOneOff(e.id, { on: ev.target.checked })} aria-label="Use this withdrawal" />
                  <input
                    value={e.label}
                    onChange={(ev) => updateOneOff(e.id, { label: ev.target.value })}
                    className="h-7 min-w-0 flex-1 rounded border px-1.5 text-[11.5px]"
                    style={{ borderColor: 'var(--rule)', background: 'var(--field)', color: 'var(--ink)' }}
                    aria-label="What it is for"
                  />
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, oneOffWithdrawals: f.oneOffWithdrawals.filter((x) => x.id !== e.id) }))}
                    className="h-7 w-7 rounded text-[15px]"
                    style={{ color: 'var(--muted)' }}
                    aria-label="Remove"
                  >
                    ×
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <label className="text-[10px]" style={{ color: 'var(--muted)' }}>
                    Year
                    <Stepper value={e.year} onChange={(v) => updateOneOff(e.id, { year: Math.round(v) })} step={1} min={1} max={50} />
                  </label>
                  <label className="text-[10px]" style={{ color: 'var(--muted)' }}>
                    Amount (₹)
                    <Stepper value={e.amountInr} onChange={(v) => updateOneOff(e.id, { amountInr: v })} step={100_000} min={0} />
                  </label>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={addOneOff}
              disabled={form.oneOffWithdrawals.length >= 6}
              className="mb-1 h-8 w-full rounded border text-xs font-medium disabled:opacity-50"
              style={{ borderColor: 'var(--rule)', color: 'var(--ink)' }}
            >
              + Add a one-off withdrawal
            </button>

            <h2 className="mb-2 mt-4 border-t pt-3 text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--acctext)', borderColor: 'var(--rule)' }}>
              De-risking
            </h2>
            <label className="mb-2.5 flex cursor-pointer items-start gap-2 text-xs" style={{ color: 'var(--ink2)' }}>
              <input type="checkbox" checked={form.glide} onChange={(e) => setForm((f) => ({ ...f, glide: e.target.checked }))} className="mt-0.5" />
              <span>
                Shift to a safer mix before withdrawals
                <small className="block" style={{ color: 'var(--muted)' }}>moves money from equity to your other holdings, year by year</small>
              </span>
            </label>
            {form.glide && (
              <>
                <SliderField label="Glide over" hint="years before withdrawals start" value={form.glideYears} onChange={(v) => setForm((f) => ({ ...f, glideYears: Math.round(v) }))} min={1} max={15} step={1} />
                <SliderField label="Equity share by then" hint="% of the portfolio" value={form.targetEquitySharePct} onChange={(v) => setForm((f) => ({ ...f, targetEquitySharePct: v }))} min={0} max={100} step={5} suffix="%" />
              </>
            )}
            <label className="mb-1 flex cursor-pointer items-start gap-2 text-xs" style={{ color: 'var(--ink2)' }}>
              <input type="checkbox" checked={form.rebalanceAnnually} onChange={(e) => setForm((f) => ({ ...f, rebalanceAnnually: e.target.checked }))} className="mt-0.5" />
              <span>
                Rebalance to target once a year
                <small className="block" style={{ color: 'var(--muted)' }}>selling to rebalance is taxed</small>
              </span>
            </label>

            <h2 className="mb-2 mt-4 border-t pt-3 text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--acctext)', borderColor: 'var(--rule)' }}>
              Returns scenario
            </h2>
            <div className="mb-1.5 flex gap-1.5">
              {(['bear', 'base', 'bull'] as SipSwpScenario[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, scenario: s }))}
                  className="flex-1 rounded border px-2 py-1.5 text-[11.5px] font-medium capitalize"
                  style={form.scenario === s ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)', color: 'var(--ink)' } : { borderColor: 'var(--rule)', color: 'var(--ink2)' }}
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="mb-3 text-[10.5px] leading-snug" style={{ color: 'var(--muted)' }}>
              {form.scenario === 'base'
                ? 'Returns as set in the portfolio table.'
                : `Adjusts every return: equity ${SCENARIO_ADJUSTMENTS[form.scenario].equity > 0 ? '+' : ''}${SCENARIO_ADJUSTMENTS[form.scenario].equity} pts, other ${SCENARIO_ADJUSTMENTS[form.scenario].other > 0 ? '+' : ''}${SCENARIO_ADJUSTMENTS[form.scenario].other} pts, debt ${SCENARIO_ADJUSTMENTS[form.scenario].debt > 0 ? '+' : ''}${SCENARIO_ADJUSTMENTS[form.scenario].debt} pts.`}
            </p>
            <SliderField
              label="Inflation"
              hint="% a year · shared with the REIT module"
              value={taxSettings.settings.inflationPct}
              onChange={(v) => taxSettings.updateSettings({ inflationPct: v })}
              min={0}
              max={12}
              step={0.5}
              suffix="%"
            />

            <h2 className="mb-2 mt-4 border-t pt-3 text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--acctext)', borderColor: 'var(--rule)' }}>
              Tax <span className="font-normal normal-case" style={{ color: 'var(--muted)' }}>· shared with REIT income</span>
            </h2>
            <FieldRow label="Your slab rate" hint="debt funds and short-term non-equity; 30% + cess = 31.2">
              <Stepper value={taxSettings.settings.slabRatePct} onChange={(v) => taxSettings.updateSettings({ slabRatePct: v })} step={0.01} min={0} max={45} suffix="%" />
            </FieldRow>
            <FieldRow label="Equity long-term gains" hint="held over 12 months, %">
              <Stepper value={taxSettings.settings.equityLtcgRatePct} onChange={(v) => taxSettings.updateSettings({ equityLtcgRatePct: v })} step={0.5} min={0} max={40} suffix="%" />
            </FieldRow>
            <FieldRow label="Equity short-term gains">
              <Stepper value={taxSettings.settings.equityStcgRatePct} onChange={(v) => taxSettings.updateSettings({ equityStcgRatePct: v })} step={0.5} min={0} max={40} suffix="%" />
            </FieldRow>
            <FieldRow label="Equity gains exempt (₹)" hint="a year, shared with REITs and shares">
              <Stepper value={taxSettings.settings.equityLtcgExemptionInr} onChange={(v) => taxSettings.updateSettings({ equityLtcgExemptionInr: v })} step={5_000} min={0} />
            </FieldRow>
            <FieldRow label="Other long-term gains" hint="hybrid, gold, international; over 24 months, %">
              <Stepper value={taxSettings.settings.otherLtcgRatePct} onChange={(v) => taxSettings.updateSettings({ otherLtcgRatePct: v })} step={0.5} min={0} max={40} suffix="%" />
            </FieldRow>
            <FieldRow label="Cess on gains tax %">
              <Stepper value={taxSettings.settings.capitalGainsCessPct} onChange={(v) => taxSettings.updateSettings({ capitalGainsCessPct: v })} step={0.5} min={0} max={10} suffix="%" />
            </FieldRow>

            <h2 className="mb-2 mt-4 border-t pt-3 text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--acctext)', borderColor: 'var(--rule)' }}>
              Fixed deposit comparison
            </h2>
            <FieldRow label="FD interest rate" hint="% a year; set your bank's rate">
              <Stepper value={form.fdRatePct} onChange={(v) => setForm((f) => ({ ...f, fdRatePct: v }))} step={0.05} min={0} max={15} suffix="%" />
            </FieldRow>

            <button type="button" onClick={resetToDefaults} className="mt-2 h-8 w-full rounded border text-xs font-medium" style={{ borderColor: 'var(--rule)', color: 'var(--ink)' }}>
              Reset to defaults
            </button>
          </aside>

          {/* ---------- main content ---------- */}
          <main className="flex min-w-0 flex-col gap-5">
            {/* build / withdraw / outcome panel */}
            <div className="overflow-hidden rounded-lg border" style={{ background: 'var(--sheet)', borderColor: 'var(--rule)' }}>
              <div className="flex items-center justify-between gap-2 border-b px-4 py-2" style={{ borderColor: 'var(--rule)', background: 'var(--panel)' }}>
                <span className="text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
                  Plan · {Y} years
                </span>
                <div className="flex items-center gap-2 text-[11.5px]" style={{ color: 'var(--muted)' }}>
                  <span>Figures shown in</span>
                  <Segmented options={[{ value: 'today', label: "Today's ₹" }, { value: 'future', label: 'Future ₹' }]} value={showFutureRupees ? 'future' : 'today'} onChange={(v) => setShowFutureRupees(v === 'future')} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3">
                <div className="p-5">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <span className="inline-block h-0 w-3.5 border-t-2" style={{ borderColor: 'var(--line2)' }} />
                    1. Build
                  </div>
                  <p className="mb-2.5 min-h-[3.2em] text-[11.5px] leading-snug" style={{ color: 'var(--muted)' }}>
                    You invest {rupee(form.lumpsumInr)} upfront and {rupee(form.monthlySipInr)} a month for {form.sipWindowYears} years
                    {form.sipStepUpPctPerYear > 0 ? `, stepping up ${form.sipStepUpPctPerYear}% a year.` : '.'}
                  </p>
                  <div className="num mb-0.5 text-[28px] font-medium leading-none tracking-tight">
                    {rupeeCompact(showFutureRupees ? result.corpusAtWithdrawalStartNominalInr : result.corpusAtWithdrawalStartRealInr)}
                  </div>
                  <div className="mb-2.5 text-[11px]" style={{ color: 'var(--muted)' }}>
                    Corpus when withdrawals start, year {SS}, {unit}
                  </div>
                  <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-xs">
                    <dt style={{ color: 'var(--muted)' }}>Money you put in</dt>
                    <dd className="num text-right font-semibold">{rupeeCompact(result.totalContributedNominalInr)}</dd>
                    <dt style={{ color: 'var(--muted)' }}>…in today's rupees</dt>
                    <dd className="num text-right font-semibold">{rupeeCompact(result.totalContributedRealInr)}</dd>
                    <dt className="col-span-2 my-1 h-px" style={{ background: 'var(--rule)' }} />
                    <dt style={{ color: 'var(--muted)' }}>Put in before withdrawals</dt>
                    <dd className="num text-right font-semibold">{rupeeCompact(showFutureRupees ? paidBeforeWithdrawalsNominal : paidBeforeWithdrawalsReal)}</dd>
                    <dt style={{ color: 'var(--muted)' }}>Peak corpus, today's ₹</dt>
                    <dd className="num text-right font-semibold">
                      {rupeeCompact(result.peakCorpusRealInr)} · yr {result.peakCorpusYear}
                    </dd>
                    <dt style={{ color: 'var(--muted)' }}>Equity share, year {SS}</dt>
                    <dd className="num text-right font-semibold">{pct(ssRow?.equityShareAtYearEndPct ?? result.startingEquitySharePct, 0)}</dd>
                  </dl>
                </div>
                <div className="border-t p-5 md:border-l md:border-t-0" style={{ borderColor: 'var(--rule)' }}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <span className="inline-block h-0 w-3.5 border-t-2" style={{ borderColor: 'var(--accent)' }} />
                      2. Withdraw
                    </span>
                    <span className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={badgeBad ? { background: 'var(--warn-soft)', color: 'var(--warn)' } : { background: 'var(--accent-soft)', color: 'var(--acctext)' }}>
                      {badgeText}
                    </span>
                  </div>
                  <p className="mb-2.5 min-h-[3.2em] text-[11.5px] leading-snug" style={{ color: 'var(--muted)' }}>
                    Withdrawing {withdrawalModeSentence[form.withdrawalMode]}, from year {SS}.{' '}
                    {form.sellFrom === 'safest_first' ? 'Safest holdings sold first.' : ''}
                  </p>
                  <div className="num mb-0.5 text-[28px] font-medium leading-none tracking-tight">{isLumpSum ? rupeeCompact(net1) : rupee(net1)}</div>
                  <div className="mb-2.5 text-[11px]" style={{ color: 'var(--muted)' }}>
                    {isLumpSum ? `After tax, year ${SS}, ${unit}` : `After tax a month, year ${SS}, ${unit}`}
                  </div>
                  <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-xs">
                    <dt style={{ color: 'var(--muted)' }}>{isLumpSum ? 'Before tax' : 'Before tax a month'}</dt>
                    <dd className="num text-right font-semibold">{isLumpSum ? rupeeCompact(gross1) : rupee(gross1)}</dd>
                    <dt style={{ color: 'var(--muted)' }}>{isLumpSum ? 'Tax' : 'Tax a month'}</dt>
                    <dd className="num text-right font-semibold">{isLumpSum ? rupeeCompact(tax1) : rupee(tax1)}</dd>
                    <dt style={{ color: 'var(--muted)' }}>Withdrawal rate, first year</dt>
                    <dd className="num text-right font-semibold">{ssRow?.withdrawalRatePct != null ? pct(ssRow.withdrawalRatePct, 1) : '–'}</dd>
                    <dt className="col-span-2 my-1 h-px" style={{ background: 'var(--rule)' }} />
                    <dt style={{ color: 'var(--muted)' }}>Cash taken after tax, today's ₹</dt>
                    <dd className="num text-right font-semibold">{rupeeCompact(result.totalCashTakenAfterTaxRealInr)}</dd>
                    <dt style={{ color: 'var(--muted)' }}>…of which one-off, today's ₹</dt>
                    <dd className="num text-right font-semibold">{rupeeCompact(totalOneOffReal)}</dd>
                    <dt style={{ color: 'var(--muted)' }}>Tax on gains, whole plan</dt>
                    <dd className="num text-right font-semibold">{rupeeCompact(totalTaxAllYears)}</dd>
                    <dt style={{ color: 'var(--muted)' }}>Tax per ₹100 withdrawn</dt>
                    <dd className="num text-right font-semibold">{totalGrossAllYears > 0 ? `₹${((totalWithdrawalTax / totalGrossAllYears) * 100).toFixed(1)}` : '–'}</dd>
                  </dl>
                  {rebalTax1Nominal > 0.5 && (
                    <p className="mt-2 text-[11px]" style={{ color: 'var(--muted)' }}>
                      Includes {isLumpSum ? rupeeCompact(rebalTax1Nominal) : rupee(rebalTax1Nominal)} of tax on rebalancing.
                    </p>
                  )}
                  {sustainableMonthly !== null && sustainableMonthly > 0 && (
                    <div className="mt-3">
                      <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: 'var(--p2bg)', color: 'var(--p2fg)' }}>
                        Sustainable: {rupee(sustainableMonthly)} a month to year {Y}
                      </span>
                    </div>
                  )}
                </div>
                <div className="border-t p-5 md:border-l md:border-t-0" style={{ borderColor: 'var(--rule)' }}>
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <span className="inline-block h-0 w-3.5 border-t-2 border-dashed" style={{ borderColor: 'var(--s3)' }} />
                    3. Outcome
                  </div>
                  <p className="mb-2.5 min-h-[3.2em] text-[11.5px] leading-snug" style={{ color: 'var(--muted)' }}>
                    Where the plan ends up at year {Y}, and what your money earned overall after tax.
                  </p>
                  <div className="num mb-0.5 text-[28px] font-medium leading-none tracking-tight">{rupeeCompact(result.corpusAtHorizonNominalInr / deflator)}</div>
                  <div className="mb-2.5 text-[11px]" style={{ color: 'var(--muted)' }}>
                    Corpus left at year {Y}, {unit}
                  </div>
                  <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-xs">
                    <dt style={{ color: 'var(--muted)' }}>Value if sold, after tax</dt>
                    <dd className="num text-right font-semibold">{rupeeCompact((result.corpusAtHorizonNominalInr - result.exitCapitalGainsTaxInr) / deflator)}</dd>
                    <dt className="font-semibold" style={{ color: 'var(--ink)' }}>
                      Net result, today's ₹
                    </dt>
                    <dd className="num text-right font-semibold" style={{ color: 'var(--acctext)' }}>
                      {rupeeCompact(result.netResultTodayInr)}
                    </dd>
                    <dt className="col-span-2 my-1 h-px" style={{ background: 'var(--rule)' }} />
                    <dt style={{ color: 'var(--muted)' }}>Return on your money (XIRR)</dt>
                    <dd className="num text-right font-semibold">{result.xirrPct == null ? '–' : pct(result.xirrPct, 1)}</dd>
                    <dt style={{ color: 'var(--muted)' }}>…after inflation</dt>
                    <dd className="num text-right font-semibold">{realXirrPct == null ? '–' : pct(realXirrPct, 1)}</dd>
                    <dt className="col-span-2 my-1 h-px" style={{ background: 'var(--rule)' }} />
                    <dt style={{ color: 'var(--muted)' }}>Gains tax if sold</dt>
                    <dd className="num text-right font-semibold">{rupeeCompact(result.exitCapitalGainsTaxInr / deflator)}</dd>
                  </dl>
                </div>
              </div>
            </div>

            {/* withdrawals and tax stats */}
            <Card>
              <h2 className="mb-1 text-[15px] font-semibold">Withdrawals and tax</h2>
              <p className="mb-3 max-w-[90ch] text-xs" style={{ color: 'var(--muted)' }}>
                What the plan pays you once withdrawals start, how much of it goes to tax, and how it compares with leaving the same corpus in a fixed deposit. Only the gain inside each redemption is taxed, which is why SWPs are tax-light early on.
              </p>
              <div className="grid grid-cols-1 overflow-hidden rounded-md border sm:grid-cols-2 lg:grid-cols-4" style={{ borderColor: 'var(--rule)' }}>
                <div className="border-b p-4 sm:border-b-0 sm:border-r lg:border-b-0" style={{ borderColor: 'var(--rule)', background: 'var(--hl, var(--panel))' }}>
                  <div className="min-h-[2.6em] text-[11.5px]" style={{ color: 'var(--muted)' }}>
                    {isLumpSum ? `After tax, year ${SS}` : `After-tax withdrawal a month, year ${SS}`}
                  </div>
                  <div className="num mt-1 text-2xl font-medium" style={{ color: 'var(--acctext)' }}>
                    {isLumpSum ? rupeeCompact(net1) : rupee(net1)}
                  </div>
                  <div className="mt-0.5 text-[11px]" style={{ color: 'var(--muted)' }}>
                    {isLumpSum ? rupeeCompact(gross1) : rupee(gross1)} before tax, {unit}
                  </div>
                </div>
                <div className="border-b p-4 sm:border-r lg:border-b-0" style={{ borderColor: 'var(--rule)' }}>
                  <div className="min-h-[2.6em] text-[11.5px]" style={{ color: 'var(--muted)' }}>
                    Tax per ₹100 withdrawn, year {SS}
                  </div>
                  <div className="num mt-1 text-2xl font-medium" style={{ color: 'var(--acctext)' }}>
                    {ssRow && ssRow.grossWithdrawalThisYearNominalInr > 0 ? `₹${(((ssRow.taxThisYearNominalInr - ssRow.taxOnRebalancingThisYearNominalInr) / ssRow.grossWithdrawalThisYearNominalInr) * 100).toFixed(1)}` : '–'}
                  </div>
                  <div className="mt-0.5 text-[11px]" style={{ color: 'var(--muted)' }}>
                    only the gain inside each sale is taxed
                  </div>
                </div>
                <div className="border-b p-4 sm:border-b-0 sm:border-r" style={{ borderColor: 'var(--rule)' }}>
                  <div className="min-h-[2.6em] text-[11.5px]" style={{ color: 'var(--muted)' }}>
                    Sustainable withdrawal to year {Y}
                  </div>
                  <div className="num mt-1 text-2xl font-medium">{sustainableMonthly == null ? '–' : rupee(sustainableMonthly)}</div>
                  <div className="mt-0.5 text-[11px]" style={{ color: 'var(--muted)' }}>
                    a month before tax, today's ₹, {form.tieFixedWithdrawalToInflation ? 'rising with inflation' : `rising ${form.fixedWithdrawalGrowthPctPerYear}% a year`}
                  </div>
                </div>
                <div className="p-4">
                  <div className="min-h-[2.6em] text-[11.5px]" style={{ color: 'var(--muted)' }}>
                    FD interest on the same corpus
                  </div>
                  <div className="num mt-1 text-2xl font-medium">{rupee(fdMonthly)}</div>
                  <div className="mt-0.5 text-[11px]" style={{ color: 'var(--muted)' }}>
                    a month after tax, today's ₹, at {form.fdRatePct}%
                  </div>
                </div>
              </div>
            </Card>

            {/* charts */}
            <Card>
              <h3 className="mb-2 text-sm font-semibold">Corpus, in {unit}</h3>
              <CorpusChart result={result} showFutureRupees={showFutureRupees} theme={theme} />
            </Card>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Card>
                <h3 className="mb-2 text-sm font-semibold">Money in and out each month</h3>
                <FlowChart result={result} showFutureRupees={showFutureRupees} theme={theme} />
              </Card>
              <Card>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{mixView === 'mix' ? 'Portfolio mix' : 'Tax each year'}</h3>
                  <Segmented options={[{ value: 'mix', label: 'Equity share' }, { value: 'tax', label: 'Tax each year' }]} value={mixView} onChange={setMixView} />
                </div>
                <MixChart result={result} view={mixView} theme={theme} />
              </Card>
            </div>

            {/* year by year */}
            <Card>
              <h3 className="mb-2 text-sm font-semibold">Year by year</h3>
              <div className="max-h-[480px] overflow-auto rounded-md border" style={{ borderColor: 'var(--rule)' }}>
                <table className="w-full text-xs">
                  <thead className="sticky top-0" style={{ background: 'var(--panel)' }}>
                    <tr>
                      {['Year', 'Phase', 'Paid in', 'Paid in to date', 'Withdrawn', 'One-off', 'Tax', 'After tax', 'Corpus', 'Equity share', 'Withdrawal rate'].map((h) => (
                        <th key={h} className="border-b p-2 text-right first:text-left" style={{ borderColor: 'var(--rule)' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.yearly.map((row) => (
                      <tr key={row.year} style={row.year === SS ? { background: 'var(--rowhl, var(--panel))' } : undefined}>
                        <td className="border-b p-2 num" style={{ borderColor: 'var(--rule)' }}>
                          {row.year}
                        </td>
                        <td className="border-b p-2 text-left" style={{ borderColor: 'var(--rule)' }}>
                          <span
                            className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                            style={{
                              background: row.phase === 'build' ? 'var(--p1bg)' : row.phase === 'withdraw' || row.phase === 'both' ? 'var(--p2bg)' : row.phase === 'derisk' ? 'var(--p3bg)' : row.phase === 'depleted' ? 'var(--warn-soft)' : 'var(--p4bg)',
                              color: row.phase === 'build' ? 'var(--p1fg)' : row.phase === 'withdraw' || row.phase === 'both' ? 'var(--p2fg)' : row.phase === 'derisk' ? 'var(--p3fg)' : row.phase === 'depleted' ? 'var(--warn)' : 'var(--p4fg)',
                            }}
                          >
                            {row.phase}
                          </span>
                        </td>
                        <td className="border-b p-2 text-right num" style={{ borderColor: 'var(--rule)' }}>
                          {rupee(showFutureRupees ? row.paidInThisYearNominalInr : row.paidInThisYearRealInr)}
                        </td>
                        <td className="border-b p-2 text-right num" style={{ borderColor: 'var(--rule)' }}>
                          {rupee(showFutureRupees ? row.paidInToDateNominalInr : row.paidInToDateRealInr)}
                        </td>
                        <td className="border-b p-2 text-right num" style={{ borderColor: 'var(--rule)' }}>
                          {rupee(showFutureRupees ? row.netWithdrawalThisYearNominalInr : row.netWithdrawalThisYearRealInr)}
                        </td>
                        <td className="border-b p-2 text-right num" style={{ borderColor: 'var(--rule)' }}>
                          {rupee(showFutureRupees ? row.oneOffWithdrawalThisYearNominalInr : row.oneOffWithdrawalThisYearRealInr)}
                        </td>
                        <td className="border-b p-2 text-right num" style={{ borderColor: 'var(--rule)' }}>
                          {rupee(showFutureRupees ? row.taxThisYearNominalInr : row.taxThisYearRealInr)}
                        </td>
                        <td className="border-b p-2 text-right num font-semibold" style={{ borderColor: 'var(--rule)' }}>
                          {rupee(showFutureRupees ? row.netWithdrawalThisYearNominalInr : row.netWithdrawalThisYearRealInr)}
                        </td>
                        <td className="border-b p-2 text-right num" style={{ borderColor: 'var(--rule)' }}>
                          {rupeeCompact(showFutureRupees ? row.corpusAtYearEndNominalInr : row.corpusAtYearEndRealInr)}
                        </td>
                        <td className="border-b p-2 text-right num" style={{ borderColor: 'var(--rule)' }}>
                          {pct(row.equityShareAtYearEndPct, 0)}
                        </td>
                        <td className="border-b p-2 text-right num" style={{ borderColor: 'var(--rule)' }}>
                          {row.withdrawalRatePct != null ? pct(row.withdrawalRatePct, 1) : '–'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[11px]" style={{ color: 'var(--muted)' }}>
                Money figures are in {unit}. The highlighted row is the first year of withdrawals. Tax is on that year's gains and comes out of that year's withdrawals.
              </p>
            </Card>

            {/* editable holdings table */}
            <Card>
              <h2 className="mb-1 text-[15px] font-semibold">The portfolio</h2>
              <p className="mb-3 max-w-[95ch] text-xs" style={{ color: 'var(--muted)' }}>
                Every cell is editable. Returns are long-run assumptions before costs, not forecasts. Tax type decides the rules: equity (equity funds, index funds, ETFs, listed shares), debt (debt funds, taxed at your slab rate however long you hold), or other (hybrid, gold, international: long-term after 24 months).
              </p>
              <div className="overflow-auto rounded-md border" style={{ borderColor: 'var(--rule)' }}>
                <table className="w-full text-xs">
                  <thead style={{ background: 'var(--panel)' }}>
                    <tr>
                      {['Include', 'Holding', 'Tax type', 'Allocation %', 'Return %', 'Expense ratio %', 'Net return %', ''].map((h) => (
                        <th key={h} className="border-b p-2 text-right first:text-center" style={{ borderColor: 'var(--rule)' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {form.holdings.map((h) => (
                      <tr key={h.key} style={h.on ? undefined : { opacity: 0.45 }}>
                        <td className="border-b p-2 text-center" style={{ borderColor: 'var(--rule)' }}>
                          <input type="checkbox" checked={h.on} onChange={(e) => updateHolding(h.key, { on: e.target.checked })} />
                        </td>
                        <td className="border-b p-2" style={{ borderColor: 'var(--rule)' }}>
                          <input value={h.name} onChange={(e) => updateHolding(h.key, { name: e.target.value })} className="w-36 rounded border px-1.5 py-1 text-xs" style={{ borderColor: 'var(--rule)', background: 'var(--field)' }} />
                        </td>
                        <td className="border-b p-2 text-left" style={{ borderColor: 'var(--rule)' }}>
                          <select
                            value={h.type}
                            onChange={(e) => updateHolding(h.key, { type: e.target.value as SipSwpHoldingType })}
                            className="h-7 rounded border px-1.5 text-xs"
                            style={{ borderColor: 'var(--rule)', background: 'var(--field)', color: 'var(--ink)' }}
                          >
                            {(Object.keys(TAX_TYPE_LABELS) as SipSwpHoldingType[]).map((t) => (
                              <option key={t} value={t}>
                                {TAX_TYPE_LABELS[t]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="border-b p-2" style={{ borderColor: 'var(--rule)' }}>
                          <input
                            type="number"
                            step={5}
                            value={h.weightPct}
                            onChange={(e) => updateHolding(h.key, { weightPct: parseFloat(e.target.value) || 0 })}
                            className="num w-16 rounded border px-1.5 py-1 text-right text-xs"
                            style={{ borderColor: 'var(--rule)', background: 'var(--field)' }}
                          />
                        </td>
                        <td className="border-b p-2" style={{ borderColor: 'var(--rule)' }}>
                          <input
                            type="number"
                            step={0.25}
                            value={h.returnPct}
                            onChange={(e) => updateHolding(h.key, { returnPct: parseFloat(e.target.value) || 0 })}
                            className="num w-16 rounded border px-1.5 py-1 text-right text-xs"
                            style={{ borderColor: 'var(--rule)', background: 'var(--field)' }}
                          />
                        </td>
                        <td className="border-b p-2" style={{ borderColor: 'var(--rule)' }}>
                          <input
                            type="number"
                            step={0.05}
                            min={0}
                            value={h.expenseRatioPct}
                            onChange={(e) => updateHolding(h.key, { expenseRatioPct: parseFloat(e.target.value) || 0 })}
                            className="num w-16 rounded border px-1.5 py-1 text-right text-xs"
                            style={{ borderColor: 'var(--rule)', background: 'var(--field)' }}
                          />
                        </td>
                        <td className="border-b p-2 text-right num" style={{ borderColor: 'var(--rule)' }}>
                          {pct(netReturnPct(h, form.scenario), 2)}
                        </td>
                        <td className="border-b p-2 text-right" style={{ borderColor: 'var(--rule)' }}>
                          <button type="button" onClick={() => setForm((f) => ({ ...f, holdings: f.holdings.filter((x) => x.key !== h.key) }))} className="rounded border px-2 py-1 text-[11px]" style={{ borderColor: 'var(--rule)', color: 'var(--ink2)' }}>
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={addHolding} className="mt-3 h-8 rounded border px-3 text-xs font-medium" style={{ borderColor: 'var(--rule)', color: 'var(--ink)' }}>
                + Add a holding
              </button>
            </Card>

            {/* result by holding */}
            <Card>
              <h2 className="mb-1 text-[15px] font-semibold">Result by holding</h2>
              <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
                Values in {unit}. Gains realised and amounts sold are in future rupees and include selling to rebalance or de-risk.
              </p>
              <div className="overflow-auto rounded-md border" style={{ borderColor: 'var(--rule)' }}>
                <table className="w-full text-xs">
                  <thead style={{ background: 'var(--panel)' }}>
                    <tr>
                      {['Holding', 'Tax type', 'Allocation', 'Net return', `Value at year ${SS}`, `Value at year ${Y}`, 'Gains realised', 'Sold over the plan'].map((h) => (
                        <th key={h} className="border-b p-2 text-right first:text-left" style={{ borderColor: 'var(--rule)' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.holdings.map((h) => (
                      <tr key={h.key}>
                        <td className="border-b p-2" style={{ borderColor: 'var(--rule)' }}>
                          {h.name}
                        </td>
                        <td className="border-b p-2 text-right" style={{ borderColor: 'var(--rule)' }}>
                          {TAX_TYPE_LABELS[h.type]}
                        </td>
                        <td className="border-b p-2 text-right num" style={{ borderColor: 'var(--rule)' }}>
                          {pct(h.weightPct, 1)}
                        </td>
                        <td className="border-b p-2 text-right num" style={{ borderColor: 'var(--rule)' }}>
                          {pct(h.netReturnPct, 2)}
                        </td>
                        <td className="border-b p-2 text-right num" style={{ borderColor: 'var(--rule)' }}>
                          {rupeeCompact(h.valueAtWithdrawalStartInr / (showFutureRupees ? 1 : Math.pow(1 + taxSettings.settings.inflationPct / 100, (SS - 1))))}
                        </td>
                        <td className="border-b p-2 text-right num" style={{ borderColor: 'var(--rule)' }}>
                          {rupeeCompact(h.valueAtHorizonInr / deflator)}
                        </td>
                        <td className="border-b p-2 text-right num" style={{ borderColor: 'var(--rule)' }}>
                          {rupeeCompact(h.gainsRealisedInr)}
                        </td>
                        <td className="border-b p-2 text-right num" style={{ borderColor: 'var(--rule)' }}>
                          {rupeeCompact(h.soldOverPlanInr)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* assumptions / provenance */}
            <Card>
              <h2 className="mb-2 text-[15px] font-semibold">Assumptions &amp; data</h2>
              <ul className="list-disc space-y-1.5 pl-5 text-xs" style={{ color: 'var(--ink2)' }}>
                <li>Holdings, returns, expense ratios and allocation are illustrative starting points you're expected to edit — not fund data or forecasts. The lumpsum is invested up front and the SIP every month it runs, split by your allocation.</li>
                <li>Withdrawals sell units first-in, first-out, so the oldest units go first, as the tax rules require — only the gain on the units sold is taxed, not the whole withdrawal. Tax is worked out once a year on that year's gains and paid out of that year's withdrawals; in a year with no withdrawals (while de-risking, say), it's paid by selling from the portfolio early the next year.</li>
                <li>The slab rate, equity LTCG/STCG rates, the shared gains exemption and inflation are shared with the REIT income module (editing either module updates both) — see that module's own tax fields.</li>
                <li>
                  The ₹1.25 lakh equity long-term exemption is one shared annual allowance across every equity-like gain a person realises in real life — direct equity, equity funds, REIT/InvIT units. This tool does not net the two modules' exposure against each other: each takes the full exemption as its own input, so adding the REIT module's and this module's results together would double-count it.
                </li>
                <li>De-risking moves the equity share in a straight line from your starting mix to the target over the glide years, rebalancing at the start of each year; selling to rebalance realises gains and is taxed. The sustainable withdrawal is the largest fixed monthly amount, in today's money and following your yearly-increase setting, that lasts to the end of the horizon under these assumptions.</li>
                <li>Not modelled: exit loads, stamp duty on purchases, TDS timing, surcharge on gains, and market ups and downs — returns are a smooth average, not a real sequence; a downturn just before withdrawals start would hurt more than the averages here suggest.</li>
              </ul>
            </Card>
          </main>
        </div>
      </div>
    </div>
  );
}
