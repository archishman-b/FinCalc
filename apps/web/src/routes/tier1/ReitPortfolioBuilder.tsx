import { Fragment, useMemo, useState } from 'react';
import {
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
import { getReitPortfolioSnapshot, getReitPortfolioSnapshotAsOf, getReitPortfolioSnapshotCaveat } from '@fincalc/data';
import {
  letOutFlatNetYieldPct,
  rankWeights,
  reitPostTaxYieldPct,
  simulateReitPortfolio,
  type ReitPortfolioSimulationResult,
  type ReitPortfolioSimulatorInput,
  type ReitPortfolioSimulatorReitInput,
  type ReitPortfolioStrategy,
  type ReitPortfolioYearRow,
} from '@fincalc/engine';

import { Card, FieldRow, Segmented, SliderField, Stepper } from '../../components/GraphiteFields';
import { GraphiteModuleHeader, TickerItem, TickerLabel } from '../../components/GraphiteModuleHeader';
import { GRAPHITE_CSS_VARS, graphiteChartColors, useGraphiteTheme, type GraphiteTheme } from '../../lib/graphite-theme';
import { useSharedTaxSettings, type SharedTaxSettings } from '../../lib/shared-tax-settings';

/**
 * REIT Portfolio Builder — a full port of a hand-built single-file
 * prototype (reit-simulator.html, saved as a project doc) the user
 * verified separately and treated as the spec, not code to copy. This
 * route follows its own "Graphite terminal" visual identity rather than
 * the rest of FinCalc's paper/ink theme (Phase 5) — scoped entirely to
 * this component and the SIP & SWP module via the shared `.graphite`
 * custom-property block (lib/graphite-theme.ts), so no other route is
 * affected. Colour values are the prototype's own (light and dark), ported
 * verbatim; the one deliberate departure is typography: the prototype
 * loads Geist/Geist Mono from Google Fonts, but FinCalc's Phase 5 design
 * plan is explicit that "nothing about the visual system makes a network
 * request" — so this uses the same system-stack substitution (ui-sans-serif
 * / ui-monospace) the rest of the app already uses, rather than adding the
 * app's first external font request.
 *
 * The shared Graphite topbar (module tabs + theme toggle + a per-module
 * ticker slot) lives in components/GraphiteModuleHeader.tsx — this route
 * supplies its own ticker content (REIT name/price/yield) below.
 *
 * The simulation itself is entirely `@fincalc/engine`'s
 * `simulateReitPortfolio()` (see reit-portfolio-simulator.ts for why this
 * doesn't reuse `reitPosition()`) — this file is presentation only: it
 * builds the simulator's input from form state, runs all three strategies,
 * and renders the result. Every REIT's starting price/yield/component
 * split comes from `@fincalc/data`'s `reit-portfolio-snapshot` pack (a
 * separate, deliberately-dated snapshot from the older `reit-instruments`
 * pack — see that pack's own module doc comment for why).
 */

function rupee(v: number): string {
  return formatINR(v, { decimals: 0 });
}
function rupeeCompact(v: number): string {
  return formatINR(v, { compact: true, decimals: 2 });
}
function pct(v: number): string {
  return `${v.toFixed(2)}%`;
}
/** Adapts a form row (which names its yield field `yieldPct`) to the shape `reitPostTaxYieldPct`/`rankWeights` expect (`distributionYieldPct`), without renaming the form field itself. */
function toYieldInput(r: Pick<ReitRowState, 'yieldPct' | 'interestPct' | 'dividendPct' | 'returnOfCapitalPct'>): Pick<ReitPortfolioSimulatorReitInput, 'distributionYieldPct' | 'interestPct' | 'dividendPct' | 'returnOfCapitalPct'> {
  return {
    distributionYieldPct: r.yieldPct,
    interestPct: r.interestPct,
    dividendPct: r.dividendPct,
    returnOfCapitalPct: r.returnOfCapitalPct,
  };
}

function monthsToWords(m: number): string {
  const y = Math.floor(m / 12);
  const mo = m % 12;
  const parts: string[] = [];
  if (y) parts.push(`${y} ${y === 1 ? 'yr' : 'yrs'}`);
  if (mo) parts.push(`${mo} mo`);
  return `after ${m} months (${parts.join(' ')})`;
}

interface ReitRowState {
  id: string;
  name: string;
  on: boolean;
  priceInr: number;
  yieldPct: number;
  interestPct: number;
  dividendPct: number;
  returnOfCapitalPct: number;
  growthOverridePct: number | null;
  priceCagrSinceListingPct: number | null;
  weightPct: number;
}

function defaultReitRows(): ReitRowState[] {
  return getReitPortfolioSnapshot().map((r) => ({
    id: r.id,
    name: r.name,
    on: true,
    priceInr: r.priceInr,
    yieldPct: r.distributionYieldPct,
    interestPct: r.componentSplit.interestPct,
    dividendPct: r.componentSplit.dividendPct,
    returnOfCapitalPct: r.componentSplit.returnOfCapitalPct,
    growthOverridePct: null,
    priceCagrSinceListingPct: r.priceCagrSinceListingPct,
    weightPct: r.defaultAllocationWeightPct,
  }));
}

interface FormState {
  reits: ReitRowState[];
  lumpsumInr: number;
  monthlySipInr: number;
  sipStepUpPct: number;
  brokeragePct: number;
  contributionWindowYears: number;
  horizonYears: number;
  harvestPct: number;
  unitPriceGrowthPct: number;
  tieDistributionGrowthToPrice: boolean;
  distributionGrowthPct: number;
  taxDividendComponent: boolean;
  reinvestmentSplit: 'allocation' | 'same_reit';
  rentalGrossYieldPct: number;
  rentalVacancyMonths: number;
  rentalMaintenancePct: number;
  rentalPropertyTaxPct: number;
}

function defaultFormState(): FormState {
  return {
    reits: defaultReitRows(),
    lumpsumInr: 5_000_000,
    monthlySipInr: 100_000,
    sipStepUpPct: 0,
    brokeragePct: 0,
    contributionWindowYears: 15,
    horizonYears: 25,
    harvestPct: 100,
    unitPriceGrowthPct: 3,
    tieDistributionGrowthToPrice: true,
    distributionGrowthPct: 3,
    taxDividendComponent: false,
    reinvestmentSplit: 'allocation',
    rentalGrossYieldPct: 3,
    rentalVacancyMonths: 1,
    rentalMaintenancePct: 10,
    rentalPropertyTaxPct: 5,
  };
}

function toSimulatorInput(form: FormState, tax: SharedTaxSettings): ReitPortfolioSimulatorInput {
  const reits: ReitPortfolioSimulatorReitInput[] = form.reits
    .filter((r) => r.on)
    .map((r) => ({
      id: r.id,
      name: r.name,
      priceInr: r.priceInr,
      distributionYieldPct: r.yieldPct,
      interestPct: r.interestPct,
      dividendPct: r.dividendPct,
      returnOfCapitalPct: r.returnOfCapitalPct,
      growthOverridePct: r.growthOverridePct,
      priceCagrSinceListingPct: r.priceCagrSinceListingPct,
      weightPct: r.weightPct,
    }));
  return {
    reits,
    lumpsumInr: form.lumpsumInr,
    monthlySipInr: form.monthlySipInr,
    sipStepUpPctPerYear: form.sipStepUpPct,
    brokeragePct: form.brokeragePct,
    contributionWindowYears: form.contributionWindowYears,
    horizonYears: form.horizonYears,
    harvestPct: form.harvestPct,
    unitPriceGrowthPct: form.unitPriceGrowthPct,
    tieDistributionGrowthToPrice: form.tieDistributionGrowthToPrice,
    distributionGrowthPct: form.distributionGrowthPct,
    inflationPct: tax.inflationPct,
    slabRatePct: tax.slabRatePct,
    taxDividendComponent: form.taxDividendComponent,
    ltcgRatePct: tax.equityLtcgRatePct,
    stcgRatePct: tax.equityStcgRatePct,
    ltcgExemptionInr: tax.equityLtcgExemptionInr,
    capitalGainsCessPct: tax.capitalGainsCessPct,
    reinvestmentSplit: form.reinvestmentSplit,
  };
}

/* `FieldRow`/`Stepper`/`SliderField`/`Segmented`/`Card` used to be defined here, as
   private, unexported functions — extracted to `components/GraphiteFields.tsx` once
   the SIP & SWP planner needed the identical Graphite-themed building blocks, so both
   routes share one copy rather than two that could drift. See that file's own module
   doc comment. */

/* ---------- charts: 3-strategy line comparisons, Graphite-coloured ---------- */

const STRATEGY_LABELS: Record<ReitPortfolioStrategy, string> = {
  withdraw: '1. Withdraw',
  reinvest_harvest: '2. Reinvest, harvest',
  auto_offramp: '3. Off-ramp',
};
const STRATEGY_ORDER: ReitPortfolioStrategy[] = ['withdraw', 'reinvest_harvest', 'auto_offramp'];

function StrategyLinesChart({
  results,
  valueOf,
  ariaLabel,
  formatter,
  theme,
}: {
  results: Record<ReitPortfolioStrategy, ReitPortfolioSimulationResult>;
  valueOf: (row: ReitPortfolioYearRow) => number;
  ariaLabel: string;
  formatter: (v: number) => string;
  theme: GraphiteTheme;
}) {
  const colors = graphiteChartColors(theme);
  const strategyColor: Record<ReitPortfolioStrategy, string> = { withdraw: colors.line2, reinvest_harvest: colors.accent, auto_offramp: colors.s3 };
  const years = results.withdraw.yearly.map((r) => r.year);
  const data = years.map((year, i) => {
    const row: Record<string, number> = { year };
    for (const s of STRATEGY_ORDER) row[s] = valueOf(results[s].yearly[i]!);
    return row;
  });
  return (
    <div className="h-64 w-full" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.rule} vertical={false} />
          <XAxis dataKey="year" tickFormatter={(v: number) => `Yr ${v}`} tick={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, fill: colors.ink2 }} axisLine={{ stroke: colors.rule }} tickLine={false} />
          <YAxis tickFormatter={(v: number) => formatter(v)} tick={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, fill: colors.ink2 }} axisLine={false} tickLine={false} width={60} />
          <Tooltip
            formatter={(v, name) => [formatter(Number(v)), STRATEGY_LABELS[name as ReitPortfolioStrategy] ?? String(name)]}
            labelFormatter={(v) => `Year ${v}`}
            contentStyle={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, background: colors.paper, border: `1px solid ${colors.rule}`, borderRadius: 4 }}
          />
          <Legend formatter={(v) => STRATEGY_LABELS[v as ReitPortfolioStrategy] ?? v} wrapperStyle={{ fontSize: 11.5, fontFamily: 'ui-sans-serif, system-ui, sans-serif' }} />
          {STRATEGY_ORDER.map((s) => (
            <Line
              key={s}
              isAnimationActive={false}
              type="monotone"
              dataKey={s}
              stroke={strategyColor[s]}
              strokeWidth={s === 'reinvest_harvest' ? 2.5 : 1.75}
              dot={false}
              {...(s === 'auto_offramp' ? { strokeDasharray: '5 4' } : {})}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- main route ---------- */

export function ReitPortfolioBuilder() {
  const { theme, toggle: toggleTheme } = useGraphiteTheme();
  const taxSettings = useSharedTaxSettings();
  const [form, setForm] = useState<FormState>(() => defaultFormState());
  const [showFutureRupees, setShowFutureRupees] = useState(false);
  const [incomeView, setIncomeView] = useState<'payouts' | 'cash'>('payouts');
  const [ybyTab, setYbyTab] = useState<ReitPortfolioStrategy | 'compare'>('auto_offramp');
  const [allocationPreset, setAllocationPreset] = useState<'equal' | 'yield' | 'growth' | 'custom'>('equal');

  const simulatorInput = useMemo(() => toSimulatorInput(form, taxSettings.settings), [form, taxSettings.settings]);
  const results = useMemo<Record<ReitPortfolioStrategy, ReitPortfolioSimulationResult>>(
    () => ({
      withdraw: simulateReitPortfolio(simulatorInput, 'withdraw'),
      reinvest_harvest: simulateReitPortfolio(simulatorInput, 'reinvest_harvest'),
      auto_offramp: simulateReitPortfolio(simulatorInput, 'auto_offramp'),
    }),
    [simulatorInput],
  );

  const activeReits = form.reits.filter((r) => r.on);
  const hasReits = activeReits.length > 0;

  const rentalYieldPct = useMemo(
    () =>
      letOutFlatNetYieldPct({
        grossRentalYieldPct: form.rentalGrossYieldPct,
        vacancyMonthsPerYear: form.rentalVacancyMonths,
        maintenancePctOfGrossYield: form.rentalMaintenancePct,
        propertyTaxPctOfGrossYield: form.rentalPropertyTaxPct,
        slabRatePct: taxSettings.settings.slabRatePct,
      }),
    [form.rentalGrossYieldPct, form.rentalVacancyMonths, form.rentalMaintenancePct, form.rentalPropertyTaxPct, taxSettings.settings.slabRatePct],
  );

  const portfolioYieldToday = useMemo(() => {
    const weightSum = activeReits.reduce((a, r) => a + Math.max(0, r.weightPct), 0);
    if (weightSum <= 0 || activeReits.length === 0) return { grossPct: 0, netPct: 0 };
    let grossPct = 0;
    let netPct = 0;
    for (const r of activeReits) {
      const w = Math.max(0, r.weightPct) / weightSum;
      grossPct += w * r.yieldPct;
      netPct += w * reitPostTaxYieldPct(toYieldInput(r), taxSettings.settings.slabRatePct, form.taxDividendComponent);
    }
    return { grossPct, netPct };
  }, [activeReits, taxSettings.settings.slabRatePct, form.taxDividendComponent]);

  const best = STRATEGY_ORDER.reduce((a, s) => (results[s].netResultTodayInr > results[a].netResultTodayInr ? s : a), 'withdraw' as ReitPortfolioStrategy);

  function updateReit(id: string, patch: Partial<ReitRowState>) {
    setForm((f) => ({ ...f, reits: f.reits.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
    setAllocationPreset('custom');
  }

  function applyPreset(preset: 'equal' | 'yield' | 'growth') {
    setForm((f) => {
      const on = f.reits.filter((r) => r.on);
      if (on.length === 0) return f;
      let weights: number[];
      if (preset === 'equal') {
        weights = on.map(() => 100 / on.length);
      } else if (preset === 'yield') {
        weights = rankWeights(on, (r) => reitPostTaxYieldPct(toYieldInput(r), taxSettings.settings.slabRatePct, f.taxDividendComponent));
      } else {
        const growths = on.map((r) => r.growthOverridePct ?? f.unitPriceGrowthPct);
        const sameGrowth = growths.every((g) => Math.abs(g - growths[0]!) < 1e-9);
        weights = rankWeights(on, sameGrowth ? (r) => r.priceCagrSinceListingPct ?? 0 : (r) => r.growthOverridePct ?? f.unitPriceGrowthPct);
      }
      const byId = new Map(on.map((r, i) => [r.id, Math.round(weights[i]! * 10) / 10]));
      return { ...f, reits: f.reits.map((r) => (r.on ? { ...r, weightPct: byId.get(r.id) ?? 0 } : { ...r, weightPct: 0 })) };
    });
    setAllocationPreset(preset);
  }

  function resetToDefaults() {
    setForm(defaultFormState());
    setAllocationPreset('equal');
  }

  const asOf = getReitPortfolioSnapshotAsOf();
  const caveat = getReitPortfolioSnapshotCaveat();

  const bestResult = results[best];
  const deflator = showFutureRupees ? 1 : bestResult.inflationDeflatorAtHorizon;

  const tickerContent = hasReits && (
    <>
      <TickerLabel>Inputs · {asOf}</TickerLabel>
      {activeReits.map((r) => (
        <TickerItem key={r.id} label={r.name} value={formatINR(r.priceInr, { decimals: 2 })} highlight={pct(r.yieldPct)} />
      ))}
    </>
  );

  return (
    <div className="graphite -m-4 min-h-screen" data-theme={theme}>
      <style>{GRAPHITE_CSS_VARS}</style>
      <GraphiteModuleHeader
        active="reit"
        moduleLabel="REIT income simulator"
        theme={theme}
        onToggleTheme={toggleTheme}
        ticker={tickerContent}
      />

      <div className="mx-auto max-w-[1400px] p-4 sm:p-6">
        <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--acctext)' }}>
          {form.horizonYears}-year outlook · {showFutureRupees ? 'future rupees' : "today's rupees"}
        </div>
        {hasReits ? (
          <p className="mb-5 max-w-[70ch] text-lg leading-snug" style={{ color: 'var(--ink)' }}>
            Over <strong>{form.horizonYears} years</strong> ({form.contributionWindowYears}-year contribution window
            {form.horizonYears > form.contributionWindowYears ? `, then ${form.horizonYears - form.contributionWindowYears} more years harvesting ${Math.round(form.harvestPct)}%` : ', no harvesting period'}
            ), strategy <strong>{STRATEGY_LABELS[best]}</strong> ends with the best net result:{' '}
            <strong style={{ color: 'var(--acctext)' }}>{rupeeCompact(bestResult.netResultTodayInr)}</strong> in today's rupees after everything put in and taken out.
            {results.auto_offramp.offRampMonth !== null && <> The off-ramp stops the SIP {monthsToWords(results.auto_offramp.offRampMonth)}.</>} Your allocation yields{' '}
            <em style={{ color: 'var(--acctext)', fontStyle: 'normal', fontWeight: 700 }}>{pct(portfolioYieldToday.netPct)} after tax</em> today, against{' '}
            <strong>{pct(rentalYieldPct)}</strong> for a let-out flat at the rental assumptions below.
          </p>
        ) : (
          <p className="mb-5 text-sm" style={{ color: 'var(--muted)' }}>
            Include at least one REIT in the table below to see results.
          </p>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
          {/* ---------- sidebar / assumptions ---------- */}
          <aside
            className="graphite-scroll rounded-lg border p-4 lg:sticky lg:top-[76px] lg:max-h-[calc(100vh-100px)] lg:overflow-y-auto"
            style={{ background: 'var(--rail)', borderColor: 'var(--rule)' }}
          >
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
              <Stepper value={form.sipStepUpPct} onChange={(v) => setForm((f) => ({ ...f, sipStepUpPct: v }))} step={0.5} min={0} max={50} suffix="%" />
            </FieldRow>
            <FieldRow label="Buying cost" hint="brokerage + STT, % of each buy">
              <Stepper value={form.brokeragePct} onChange={(v) => setForm((f) => ({ ...f, brokeragePct: v }))} step={0.01} min={0} max={5} suffix="%" />
            </FieldRow>

            <h2 className="mb-2 mt-4 border-t pt-3 text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--acctext)', borderColor: 'var(--rule)' }}>
              Allocation across REITs
            </h2>
            <div className="mb-2.5 flex flex-wrap gap-1.5">
              {(['equal', 'yield', 'growth'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className="flex-1 rounded border px-2 py-1.5 text-[11.5px] font-medium"
                  style={allocationPreset === p ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)', color: 'var(--ink)' } : { borderColor: 'var(--rule)', color: 'var(--ink2)' }}
                >
                  {p === 'equal' ? 'Equal' : p === 'yield' ? 'Net yield' : 'Price growth'}
                </button>
              ))}
            </div>

            <h2 className="mb-2 mt-4 border-t pt-3 text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--acctext)', borderColor: 'var(--rule)' }}>
              Timeline
            </h2>
            <SliderField label="Contribution window" hint="years you pay the SIP" value={form.contributionWindowYears} onChange={(v) => setForm((f) => ({ ...f, contributionWindowYears: Math.round(v) }))} min={1} max={40} step={1} />
            <SliderField label="Total horizon" hint="years, at least the window" value={form.horizonYears} onChange={(v) => setForm((f) => ({ ...f, horizonYears: Math.max(Math.round(v), form.contributionWindowYears) }))} min={1} max={40} step={1} />
            <SliderField label="Harvesting after the window" hint="% of payouts taken as cash in strategies 2 and 3" value={form.harvestPct} onChange={(v) => setForm((f) => ({ ...f, harvestPct: v }))} min={0} max={100} step={1} suffix="%" />

            <h2 className="mb-2 mt-4 border-t pt-3 text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--acctext)', borderColor: 'var(--rule)' }}>
              Growth and inflation
            </h2>
            <SliderField label="Unit price growth" hint="% a year, all REITs unless overridden" value={form.unitPriceGrowthPct} onChange={(v) => setForm((f) => ({ ...f, unitPriceGrowthPct: v }))} min={-5} max={15} step={0.5} suffix="%" />
            <label className="mb-2.5 flex cursor-pointer items-start gap-2 text-xs" style={{ color: 'var(--ink2)' }}>
              <input type="checkbox" checked={form.tieDistributionGrowthToPrice} onChange={(e) => setForm((f) => ({ ...f, tieDistributionGrowthToPrice: e.target.checked }))} className="mt-0.5" />
              Payouts grow with the unit price (keeps today's yield constant)
            </label>
            {!form.tieDistributionGrowthToPrice && (
              <FieldRow label="Payout growth" hint="% a year, since not tied">
                <Stepper value={form.distributionGrowthPct} onChange={(v) => setForm((f) => ({ ...f, distributionGrowthPct: v }))} step={0.1} min={-20} max={30} suffix="%" />
              </FieldRow>
            )}
            <SliderField
              label="Inflation"
              hint="% a year · shared with the SIP & SWP module"
              value={taxSettings.settings.inflationPct}
              onChange={(v) => taxSettings.updateSettings({ inflationPct: v })}
              min={0}
              max={12}
              step={0.5}
              suffix="%"
            />

            <h2 className="mb-2 mt-4 border-t pt-3 text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--acctext)', borderColor: 'var(--rule)' }}>
              Tax <span className="font-normal normal-case" style={{ color: 'var(--muted)' }}>· shared with SIP &amp; SWP</span>
            </h2>
            <FieldRow label="Tax on interest & other income" hint="30% + 4% cess = 31.2">
              <Stepper value={taxSettings.settings.slabRatePct} onChange={(v) => taxSettings.updateSettings({ slabRatePct: v })} step={0.01} min={0} max={45} suffix="%" />
            </FieldRow>
            <label className="mb-2.5 flex cursor-pointer items-start gap-2 text-xs" style={{ color: 'var(--ink2)' }}>
              <input type="checkbox" checked={form.taxDividendComponent} onChange={(e) => setForm((f) => ({ ...f, taxDividendComponent: e.target.checked }))} className="mt-0.5" />
              <span>
                Tax the dividend component too
                <small className="block" style={{ color: 'var(--muted)' }}>
                  FY2025-26 rule for SPVs on the concessional regime; exempt from FY2026-27
                </small>
              </span>
            </label>
            <FieldRow label="Long-term gains rate" hint="held over 12 months">
              <Stepper value={taxSettings.settings.equityLtcgRatePct} onChange={(v) => taxSettings.updateSettings({ equityLtcgRatePct: v })} step={0.1} min={0} max={40} suffix="%" />
            </FieldRow>
            <FieldRow label="Short-term gains rate">
              <Stepper value={taxSettings.settings.equityStcgRatePct} onChange={(v) => taxSettings.updateSettings({ equityStcgRatePct: v })} step={0.1} min={0} max={40} suffix="%" />
            </FieldRow>
            <FieldRow label="Long-term gains exempt (₹)">
              <Stepper value={taxSettings.settings.equityLtcgExemptionInr} onChange={(v) => taxSettings.updateSettings({ equityLtcgExemptionInr: v })} step={5_000} min={0} />
            </FieldRow>
            <FieldRow label="Cess on gains tax">
              <Stepper value={taxSettings.settings.capitalGainsCessPct} onChange={(v) => taxSettings.updateSettings({ capitalGainsCessPct: v })} step={0.1} min={0} max={10} suffix="%" />
            </FieldRow>

            <h2 className="mb-2 mt-4 border-t pt-3 text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--acctext)', borderColor: 'var(--rule)' }}>
              Rental comparison
            </h2>
            <FieldRow label="Gross rental yield" hint="% of property value a year">
              <Stepper value={form.rentalGrossYieldPct} onChange={(v) => setForm((f) => ({ ...f, rentalGrossYieldPct: v }))} step={0.1} min={0} max={15} suffix="%" />
            </FieldRow>
            <FieldRow label="Vacancy" hint="months a year">
              <Stepper value={form.rentalVacancyMonths} onChange={(v) => setForm((f) => ({ ...f, rentalVacancyMonths: v }))} step={0.5} min={0} max={12} />
            </FieldRow>
            <FieldRow label="Maintenance & repairs" hint="landlord-paid">
              <Stepper value={form.rentalMaintenancePct} onChange={(v) => setForm((f) => ({ ...f, rentalMaintenancePct: v }))} step={1} min={0} max={100} suffix="%" />
            </FieldRow>
            <FieldRow label="Property tax">
              <Stepper value={form.rentalPropertyTaxPct} onChange={(v) => setForm((f) => ({ ...f, rentalPropertyTaxPct: v }))} step={0.5} min={0} max={50} suffix="%" />
            </FieldRow>

            <h2 className="mb-2 mt-4 border-t pt-3 text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--acctext)', borderColor: 'var(--rule)' }}>
              Reinvesting payouts
            </h2>
            <select
              value={form.reinvestmentSplit}
              onChange={(e) => setForm((f) => ({ ...f, reinvestmentSplit: e.target.value as FormState['reinvestmentSplit'] }))}
              className="mb-3 h-8 w-full rounded border px-2 text-xs"
              style={{ background: 'var(--field)', borderColor: 'var(--rule)', color: 'var(--ink)' }}
            >
              <option value="allocation">In your allocation proportions</option>
              <option value="same_reit">Back into the REIT that paid</option>
            </select>
            <button type="button" onClick={resetToDefaults} className="h-8 w-full rounded border text-xs font-medium" style={{ borderColor: 'var(--rule)', color: 'var(--ink)' }}>
              Reset to {asOf} data
            </button>
          </aside>

          {/* ---------- main content ---------- */}
          <main className="flex min-w-0 flex-col gap-5">
            {/* three-strategy panel */}
            <div className="overflow-hidden rounded-lg border" style={{ background: 'var(--sheet)', borderColor: 'var(--rule)' }}>
              <div className="flex items-center justify-between gap-2 border-b px-4 py-2" style={{ borderColor: 'var(--rule)', background: 'var(--panel)' }}>
                <span className="text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
                  Strategies · {form.horizonYears} years
                </span>
                <div className="flex items-center gap-2 text-[11.5px]" style={{ color: 'var(--muted)' }}>
                  <span>Figures shown in</span>
                  <Segmented options={[{ value: 'today', label: "Today's ₹" }, { value: 'future', label: 'Future ₹' }]} value={showFutureRupees ? 'future' : 'today'} onChange={(v) => setShowFutureRupees(v === 'future')} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3">
                {STRATEGY_ORDER.map((s, i) => {
                  const r = results[s];
                  const isBest = s === best;
                  return (
                    <div key={s} className={i > 0 ? 'border-t p-5 md:border-l md:border-t-0' : 'p-5'} style={{ borderColor: 'var(--rule)' }}>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-sm font-semibold">
                          <span className="inline-block h-0 w-3.5 border-t-2" style={{ borderColor: s === 'withdraw' ? 'var(--line2)' : s === 'reinvest_harvest' ? 'var(--accent)' : 'var(--s3)', borderStyle: s === 'auto_offramp' ? 'dashed' : 'solid' }} />
                          {STRATEGY_LABELS[s]}
                        </span>
                        {isBest && (
                          <span className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ background: 'var(--accent-soft)', color: 'var(--acctext)' }}>
                            Best net result
                          </span>
                        )}
                      </div>
                      <p className="mb-2.5 min-h-[3.2em] text-[11.5px] leading-snug" style={{ color: 'var(--muted)' }}>
                        {s === 'withdraw' && 'You pay the SIP through the window. Every payout comes to you as cash, the whole way.'}
                        {s === 'reinvest_harvest' && 'You pay the SIP and reinvest every payout through the window. After it, you take the harvesting share as cash.'}
                        {s === 'auto_offramp' && "Like 2, but your SIP stops for good once monthly post-tax payouts reach the monthly SIP. Payouts then fund the growth on their own."}
                      </p>
                      <div className="num mb-0.5 text-[28px] font-medium leading-none tracking-tight">{rupeeCompact(r.portfolioValueAtHorizonInr / deflator)}</div>
                      <div className="mb-2.5 text-[11px]" style={{ color: 'var(--muted)' }}>
                        Portfolio value at year {form.horizonYears}, {showFutureRupees ? 'future ₹' : "today's ₹"}
                      </div>
                      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-xs">
                        <dt style={{ color: 'var(--muted)' }}>Value if sold, after gains tax</dt>
                        <dd className="num text-right font-semibold">{rupeeCompact((r.portfolioValueAtHorizonInr - r.exitCapitalGainsTaxInr) / deflator)}</dd>
                        <dt style={{ color: 'var(--muted)' }}>Post-tax payouts/mo, final year</dt>
                        <dd className="num text-right font-semibold">{rupee(r.finalYearPostTaxPayoutPerMonthInr / deflator)}</dd>
                        <dt style={{ color: 'var(--muted)' }}>Cash taken/mo, final year</dt>
                        <dd className="num text-right font-semibold">{rupee(r.finalYearCashTakenPerMonthInr / deflator)}</dd>
                        <dt className="col-span-2 my-1 h-px" style={{ background: 'var(--rule)' }} />
                        <dt style={{ color: 'var(--muted)' }}>Total money put in</dt>
                        <dd className="num text-right font-semibold">{rupeeCompact(r.totalContributedNominalInr)}</dd>
                        <dt style={{ color: 'var(--muted)' }}>…in today's rupees</dt>
                        <dd className="num text-right font-semibold">{rupeeCompact(r.totalContributedRealInr)}</dd>
                        <dt style={{ color: 'var(--muted)' }}>Cash taken, today's rupees</dt>
                        <dd className="num text-right font-semibold">{rupeeCompact(r.totalCashTakenRealInr)}</dd>
                        <dt className="font-semibold" style={{ color: 'var(--ink)' }}>
                          Net result, today's rupees
                        </dt>
                        <dd className="num text-right font-semibold" style={{ color: 'var(--acctext)' }}>
                          {rupeeCompact(r.netResultTodayInr)}
                        </dd>
                      </dl>
                      {s === 'auto_offramp' && (
                        <div className="mt-3">
                          {r.offRampMonth !== null ? (
                            <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: 'var(--p2bg)', color: 'var(--p2fg)' }}>
                              SIP stops {monthsToWords(r.offRampMonth)}
                            </span>
                          ) : (
                            <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: 'var(--warn-soft)', color: 'var(--ink)' }}>
                              Payouts never reach the SIP within the window — behaves like strategy 2
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* monthly income + rental comparison */}
            <Card>
              <h2 className="mb-1 text-[15px] font-semibold">Monthly income</h2>
              <p className="mb-3 max-w-[90ch] text-xs" style={{ color: 'var(--muted)' }}>
                The post-tax income this portfolio generates, and how it compares with letting out a flat of the same value. Rental uses the 30% standard deduction on rent less property tax.
              </p>
              <div className="grid grid-cols-1 overflow-hidden rounded-md border sm:grid-cols-2 lg:grid-cols-4" style={{ borderColor: 'var(--rule)' }}>
                <div className="border-b p-4 sm:border-b-0 sm:border-r lg:border-b-0" style={{ borderColor: 'var(--rule)', background: 'var(--hl, var(--panel))' }}>
                  <div className="min-h-[2.6em] text-[11.5px]" style={{ color: 'var(--muted)' }}>
                    REIT post-tax yield today, your allocation
                  </div>
                  <div className="num mt-1 text-2xl font-medium" style={{ color: 'var(--acctext)' }}>
                    {pct(portfolioYieldToday.netPct)}
                  </div>
                  <div className="mt-0.5 text-[11px]" style={{ color: 'var(--muted)' }}>
                    {pct(portfolioYieldToday.grossPct)} before tax
                  </div>
                </div>
                <div className="border-b p-4 sm:border-r lg:border-b-0" style={{ borderColor: 'var(--rule)' }}>
                  <div className="min-h-[2.6em] text-[11.5px]" style={{ color: 'var(--muted)' }}>
                    REIT income per ₹1 Cr invested today
                  </div>
                  <div className="num mt-1 text-2xl font-medium" style={{ color: 'var(--acctext)' }}>
                    {rupee((portfolioYieldToday.netPct / 100) * 1e7 / 12)}
                  </div>
                  <div className="mt-0.5 text-[11px]" style={{ color: 'var(--muted)' }}>
                    a month, after tax
                  </div>
                </div>
                <div className="border-b p-4 sm:border-b-0 sm:border-r" style={{ borderColor: 'var(--rule)' }}>
                  <div className="min-h-[2.6em] text-[11.5px]" style={{ color: 'var(--muted)' }}>
                    Let-out flat post-tax yield
                  </div>
                  <div className="num mt-1 text-2xl font-medium">{pct(rentalYieldPct)}</div>
                  <div className="mt-0.5 text-[11px]" style={{ color: 'var(--muted)' }}>
                    {pct(form.rentalGrossYieldPct)} gross, after vacancy, costs and tax
                  </div>
                </div>
                <div className="p-4">
                  <div className="min-h-[2.6em] text-[11.5px]" style={{ color: 'var(--muted)' }}>
                    Flat income per ₹1 Cr of value
                  </div>
                  <div className="num mt-1 text-2xl font-medium">{rupee((rentalYieldPct / 100) * 1e7 / 12)}</div>
                  <div className="mt-0.5 text-[11px]" style={{ color: 'var(--muted)' }}>
                    a month, after tax
                  </div>
                </div>
              </div>
            </Card>

            {/* charts */}
            <Card>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Portfolio value, in {showFutureRupees ? 'future rupees' : "today's rupees"}</h3>
              </div>
              <StrategyLinesChart
                results={results}
                valueOf={(row) => (showFutureRupees ? row.valueNominalInr : row.valueRealInr)}
                ariaLabel="Portfolio value by year for the three strategies"
                formatter={rupeeCompact}
                theme={theme}
              />
            </Card>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Card>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{incomeView === 'cash' ? 'Cash you take each month' : 'Post-tax income each month'}</h3>
                  <Segmented options={[{ value: 'payouts', label: 'Payouts generated' }, { value: 'cash', label: 'Cash you take' }]} value={incomeView} onChange={setIncomeView} />
                </div>
                <StrategyLinesChart
                  results={results}
                  valueOf={(row) => (incomeView === 'cash' ? (showFutureRupees ? row.cashTakenThisYearNominalInr : row.cashTakenThisYearRealInr) : showFutureRupees ? row.postTaxPayoutsThisYearNominalInr : row.postTaxPayoutsThisYearRealInr) / 12}
                  ariaLabel="Monthly income by year for the three strategies"
                  formatter={rupee}
                  theme={theme}
                />
              </Card>
              <Card>
                <h3 className="mb-2 text-sm font-semibold">What you pay in each month</h3>
                <StrategyLinesChart
                  results={results}
                  valueOf={(row) => row.outOfPocketThisYearNominalInr / 12}
                  ariaLabel="Monthly out-of-pocket SIP by year for the three strategies"
                  formatter={rupee}
                  theme={theme}
                />
              </Card>
            </div>

            {/* year-by-year table */}
            <Card>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">Year by year</h3>
                <Segmented
                  options={[
                    { value: 'withdraw', label: 'Strategy 1' },
                    { value: 'reinvest_harvest', label: 'Strategy 2' },
                    { value: 'auto_offramp', label: 'Strategy 3' },
                    { value: 'compare', label: 'Compare' },
                  ]}
                  value={ybyTab}
                  onChange={setYbyTab}
                />
              </div>
              <div className="max-h-[480px] overflow-auto rounded-md border" style={{ borderColor: 'var(--rule)' }}>
                <table className="w-full text-xs">
                  {ybyTab === 'compare' ? (
                    <>
                      <thead className="sticky top-0" style={{ background: 'var(--panel)' }}>
                        <tr>
                          <th className="sticky left-0 border-b p-2 text-left" style={{ borderColor: 'var(--rule)', background: 'var(--panel)' }}>
                            Year
                          </th>
                          {STRATEGY_ORDER.map((s) => (
                            <th key={s} className="border-b border-l p-2 text-center" style={{ borderColor: 'var(--rule)' }}>
                              {STRATEGY_LABELS[s]}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {results.withdraw.yearly.map((_, i) => {
                          const year = results.withdraw.yearly[i]!.year;
                          const netValues = STRATEGY_ORDER.map((s) => results[s].yearly[i]!.netIfSoldRealInr);
                          const bestIdx = netValues.indexOf(Math.max(...netValues));
                          return (
                            <tr key={year}>
                              <td className="sticky left-0 border-b p-2 num" style={{ borderColor: 'var(--rule)', background: 'var(--sheet)' }}>
                                {year}
                              </td>
                              {STRATEGY_ORDER.map((s, si) => (
                                <td key={s} className="border-b border-l p-2 text-right num" style={{ borderColor: 'var(--rule)', fontWeight: si === bestIdx ? 700 : 400 }}>
                                  {rupeeCompact(results[s].yearly[i]!.netIfSoldRealInr)}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </>
                  ) : (
                    <>
                      <thead className="sticky top-0" style={{ background: 'var(--panel)' }}>
                        <tr>
                          {['Year', 'Phase', 'Paid in', 'Paid in to date', 'Post-tax payouts', 'Reinvested', 'Cash taken', 'Tax', 'Value', 'Net if sold'].map((h) => (
                            <th key={h} className="border-b p-2 text-right first:text-left" style={{ borderColor: 'var(--rule)' }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {results[ybyTab].yearly.map((row) => (
                          <tr key={row.year}>
                            <td className="border-b p-2 num" style={{ borderColor: 'var(--rule)' }}>
                              {row.year}
                            </td>
                            <td className="border-b p-2 text-left" style={{ borderColor: 'var(--rule)' }}>
                              <span
                                className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                                style={{
                                  background: row.phase === 'contributing' ? 'var(--p1bg)' : row.phase === 'harvesting' ? 'var(--p3bg)' : row.phase === 'holding' ? 'var(--p4bg)' : 'var(--p2bg)',
                                  color: row.phase === 'contributing' ? 'var(--p1fg)' : row.phase === 'harvesting' ? 'var(--p3fg)' : row.phase === 'holding' ? 'var(--p4fg)' : 'var(--p2fg)',
                                }}
                              >
                                {row.phase.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="border-b p-2 text-right num" style={{ borderColor: 'var(--rule)' }}>
                              {rupee(row.paidInThisYearNominalInr)}
                            </td>
                            <td className="border-b p-2 text-right num" style={{ borderColor: 'var(--rule)' }}>
                              {rupee(showFutureRupees ? row.paidInToDateNominalInr : row.paidInToDateRealInr)}
                            </td>
                            <td className="border-b p-2 text-right num" style={{ borderColor: 'var(--rule)' }}>
                              {rupee(showFutureRupees ? row.postTaxPayoutsThisYearNominalInr : row.postTaxPayoutsThisYearRealInr)}
                            </td>
                            <td className="border-b p-2 text-right num" style={{ borderColor: 'var(--rule)' }}>
                              {rupee(showFutureRupees ? row.reinvestedThisYearNominalInr : row.reinvestedThisYearRealInr)}
                            </td>
                            <td className="border-b p-2 text-right num" style={{ borderColor: 'var(--rule)' }}>
                              {rupee(showFutureRupees ? row.cashTakenThisYearNominalInr : row.cashTakenThisYearRealInr)}
                            </td>
                            <td className="border-b p-2 text-right num" style={{ borderColor: 'var(--rule)' }}>
                              {rupee(showFutureRupees ? row.taxOnPayoutsThisYearNominalInr : row.taxOnPayoutsThisYearRealInr)}
                            </td>
                            <td className="border-b p-2 text-right num" style={{ borderColor: 'var(--rule)' }}>
                              {rupeeCompact(showFutureRupees ? row.valueNominalInr : row.valueRealInr)}
                            </td>
                            <td className="border-b p-2 text-right num font-semibold" style={{ borderColor: 'var(--rule)' }}>
                              {rupeeCompact(row.netIfSoldRealInr)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </>
                  )}
                </table>
              </div>
              <p className="mt-2 text-[11px]" style={{ color: 'var(--muted)' }}>
                Money figures are in {showFutureRupees ? 'future ₹' : "today's ₹"}. "Net if sold" is the value after capital-gains tax plus all cash taken, minus all money paid in, in today's rupees.
              </p>
            </Card>

            {/* editable REIT table */}
            <Card>
              <h2 className="mb-1 text-[15px] font-semibold">The REITs</h2>
              <p className="mb-3 max-w-[95ch] text-xs" style={{ color: 'var(--muted)' }}>
                Every cell is editable. Yield is the annualised payout divided by price. The three components must add to 100 — "interest" includes other taxable income such as treasury returns. Leave price growth blank to use the global rate.
              </p>
              <div className="overflow-auto rounded-md border" style={{ borderColor: 'var(--rule)' }}>
                <table className="w-full text-xs">
                  <thead style={{ background: 'var(--panel)' }}>
                    <tr>
                      {['Include', 'REIT', 'Price ₹', 'Yield %', 'Interest %', 'Dividend %', 'RoC %', 'Sum', 'Growth % (model)', 'CAGR since listing %', ''].map((h) => (
                        <th key={h} className="border-b p-2 text-right first:text-center" style={{ borderColor: 'var(--rule)' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {form.reits.map((r) => {
                      const sum = r.interestPct + r.dividendPct + r.returnOfCapitalPct;
                      const sumOff = Math.abs(sum - 100) > 0.05;
                      return (
                        <tr key={r.id} style={r.on ? undefined : { opacity: 0.45 }}>
                          <td className="border-b p-2 text-center" style={{ borderColor: 'var(--rule)' }}>
                            <input type="checkbox" checked={r.on} onChange={(e) => updateReit(r.id, { on: e.target.checked })} />
                          </td>
                          <td className="border-b p-2" style={{ borderColor: 'var(--rule)' }}>
                            <input value={r.name} onChange={(e) => updateReit(r.id, { name: e.target.value })} className="w-32 rounded border px-1.5 py-1 text-xs" style={{ borderColor: 'var(--rule)', background: 'var(--field)' }} />
                          </td>
                          {(
                            [
                              ['priceInr', 0.01],
                              ['yieldPct', 0.01],
                              ['interestPct', 0.1],
                              ['dividendPct', 0.1],
                              ['returnOfCapitalPct', 0.1],
                            ] as const
                          ).map(([key, step]) => (
                            <td key={key} className="border-b p-2" style={{ borderColor: 'var(--rule)' }}>
                              <input
                                type="number"
                                step={step}
                                value={r[key]}
                                onChange={(e) => updateReit(r.id, { [key]: parseFloat(e.target.value) || 0 } as Partial<ReitRowState>)}
                                className="num w-16 rounded border px-1.5 py-1 text-right text-xs"
                                style={{ borderColor: 'var(--rule)', background: 'var(--field)' }}
                              />
                            </td>
                          ))}
                          <td className="border-b p-2 text-right num" style={{ borderColor: 'var(--rule)', color: sumOff ? 'var(--warn)' : undefined, fontWeight: sumOff ? 700 : 400 }}>
                            {sum.toFixed(1)}
                          </td>
                          <td className="border-b p-2" style={{ borderColor: 'var(--rule)' }}>
                            <input
                              type="number"
                              step={0.1}
                              placeholder="global"
                              value={r.growthOverridePct ?? ''}
                              onChange={(e) => updateReit(r.id, { growthOverridePct: e.target.value === '' ? null : parseFloat(e.target.value) })}
                              className="num w-16 rounded border px-1.5 py-1 text-right text-xs"
                              style={{ borderColor: 'var(--rule)', background: 'var(--field)' }}
                            />
                          </td>
                          <td className="border-b p-2 text-right num" style={{ borderColor: 'var(--rule)' }}>
                            {r.priceCagrSinceListingPct ?? '—'}
                          </td>
                          <td className="border-b p-2 text-right" style={{ borderColor: 'var(--rule)' }}>
                            <button type="button" onClick={() => setForm((f) => ({ ...f, reits: f.reits.filter((x) => x.id !== r.id) }))} className="rounded border px-2 py-1 text-[11px]" style={{ borderColor: 'var(--rule)', color: 'var(--ink2)' }}>
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    reits: [...f.reits, { id: `custom-${Date.now()}`, name: 'New REIT', on: true, priceInr: 100, yieldPct: 6, interestPct: 30, dividendPct: 40, returnOfCapitalPct: 30, growthOverridePct: null, priceCagrSinceListingPct: null, weightPct: 0 }],
                  }))
                }
                className="mt-3 h-8 rounded border px-3 text-xs font-medium"
                style={{ borderColor: 'var(--rule)', color: 'var(--ink)' }}
              >
                + Add a REIT
              </button>
            </Card>

            {/* per-REIT results */}
            <Card>
              <h2 className="mb-1 text-[15px] font-semibold">Result by REIT</h2>
              <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
                Value and monthly post-tax payout in {showFutureRupees ? 'future ₹' : "today's ₹"} at year {form.horizonYears}.
              </p>
              <div className="overflow-auto rounded-md border" style={{ borderColor: 'var(--rule)' }}>
                <table className="w-full text-xs">
                  <thead style={{ background: 'var(--panel)' }}>
                    <tr>
                      <th className="border-b p-2 text-left" style={{ borderColor: 'var(--rule)' }}>
                        REIT
                      </th>
                      <th className="border-b p-2 text-right" style={{ borderColor: 'var(--rule)' }}>
                        Allocation
                      </th>
                      <th className="border-b p-2 text-right" style={{ borderColor: 'var(--rule)' }}>
                        Post-tax yield
                      </th>
                      {STRATEGY_ORDER.map((s) => (
                        <th key={s} colSpan={2} className="border-b border-l p-2 text-center" style={{ borderColor: 'var(--rule)' }}>
                          {STRATEGY_LABELS[s]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.withdraw.reits.map((baseRow, i) => (
                      <tr key={baseRow.id}>
                        <td className="border-b p-2" style={{ borderColor: 'var(--rule)' }}>
                          {baseRow.name}
                        </td>
                        <td className="border-b p-2 text-right num" style={{ borderColor: 'var(--rule)' }}>
                          {baseRow.weightPct.toFixed(1)}%
                        </td>
                        <td className="border-b p-2 text-right num" style={{ borderColor: 'var(--rule)' }}>
                          {pct(baseRow.postTaxYieldTodayPct)}
                        </td>
                        {STRATEGY_ORDER.map((s) => {
                          const row = results[s].reits[i]!;
                          return (
                            <Fragment key={s}>
                              <td className="border-b border-l p-2 text-right num" style={{ borderColor: 'var(--rule)' }}>
                                {rupeeCompact(row.valueAtHorizonInr / deflator)}
                              </td>
                              <td className="border-b p-2 text-right num" style={{ borderColor: 'var(--rule)' }}>
                                {rupee(row.finalYearPostTaxPayoutPerMonthInr / deflator)}
                              </td>
                            </Fragment>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* assumptions / provenance */}
            <Card>
              <h2 className="mb-2 text-[15px] font-semibold">Assumptions & data</h2>
              <ul className="list-disc space-y-1.5 pl-5 text-xs" style={{ color: 'var(--ink2)' }}>
                <li>REIT prices, yields and component splits are a snapshot as of {asOf}, supplied directly rather than pulled from an official filing — not independently cross-checked against BSE/NSE disclosures.</li>
                {caveat && <li>{caveat}</li>}
                <li>The lumpsum and SIP are split across REITs by your allocation. Payouts arrive every quarter on units held before the quarter ends; fractional units are allowed.</li>
                <li>Each payout is split into interest (taxed at your rate when received), dividend (exempt unless ticked) and return of capital (not taxed, but lowers your cost; anything beyond your cost is taxed at your rate).</li>
                <li>Off-ramp test (strategy 3): after each quarterly payout, the post-tax payout across all REITs divided by 3 is compared with your total monthly SIP, step-up included. Once it's equal or higher, the SIP stops for the rest of the window and doesn't restart.</li>
                <li>"Net result" is the value if sold after gains tax, plus all cash you took, minus all money you put in, each converted to today's rupees at the date it happened. Gains tax applies lot by lot: units held over 12 months at the long-term rate after the exemption, the rest at the short-term rate, plus cess.</li>
                <li>Rental comparison: rent collected for (12 − vacancy) months, less property tax and landlord maintenance; taxed at your rate on 70% of (rent less property tax), per the 30% standard deduction. It compares income only — property price growth, loans and exit costs are left to the full Allocation Comparator.</li>
                <li>Slab rate, long/short-term gains rates, the gains exemption and inflation are shared with the SIP &amp; SWP module (editing either module updates both). The ₹1.25 lakh exemption is one real-life shared annual allowance across every equity-like gain a person realises — direct equity, equity funds, REIT/InvIT units — and this tool does not net the two modules' exposure against each other, so adding both modules' results together would double-count it.</li>
              </ul>
            </Card>
          </main>
        </div>
      </div>
    </div>
  );
}
