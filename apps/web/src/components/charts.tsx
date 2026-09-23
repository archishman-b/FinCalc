import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatINR } from '@fincalc/ui';

import { usePalette } from '../lib/theme';

/**
 * Phase 9.1 (user feedback: "too textual... show all the relevant graphs
 * — for example, for the amortisation schedules — and charts and
 * interactive elements"): a small set of reusable recharts wrappers,
 * matching ResultChart.tsx's established visual language (the paper/ink
 * palette from theme.ts, tabular-mono ticks, the same tooltip/legend
 * styling) instead of each Tier 1 calculator hand-rolling its own. Every
 * chart here is real output from a real computation run through the
 * engine — the same discipline ResultChart.tsx documents for the
 * Comparator's chart — never a mockup or placeholder series.
 */

const TICK_STYLE = { fontFamily: 'ui-monospace, monospace', fontSize: 12 } as const;
const LEGEND_STYLE = { fontFamily: 'ui-sans-serif, system-ui, sans-serif', fontSize: 13 } as const;

/** The EMI calculator's amortisation schedule: principal vs. interest paid each year (stacked bars), with the declining outstanding balance as an overlaid line on a secondary axis. */
export function AmortizationChart({
  data,
}: {
  data: { year: number; principal: number; interest: number; balance: number }[];
}) {
  const palette = usePalette();
  return (
    <div className="h-80 w-full" role="img" aria-label="Amortisation schedule: principal and interest paid per year, with the outstanding balance declining over the loan's tenure">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={palette.hairline} vertical={false} />
          <XAxis
            dataKey="year"
            tickFormatter={(v: number) => `Yr ${v}`}
            tick={{ ...TICK_STYLE, fill: palette.inkMuted }}
            axisLine={{ stroke: palette.hairline }}
            tickLine={false}
          />
          <YAxis
            yAxisId="flow"
            tickFormatter={(v: number) => formatINR(v, { compact: true, decimals: 0 })}
            tick={{ ...TICK_STYLE, fill: palette.inkMuted }}
            axisLine={false}
            tickLine={false}
            width={64}
          />
          <YAxis
            yAxisId="balance"
            orientation="right"
            tickFormatter={(v: number) => formatINR(v, { compact: true, decimals: 0 })}
            tick={{ ...TICK_STYLE, fill: palette.inkMuted }}
            axisLine={false}
            tickLine={false}
            width={64}
          />
          <Tooltip
            formatter={(v, name) => [formatINR(Number(v), { compact: true }), name]}
            labelFormatter={(v) => `Year ${v}`}
            contentStyle={{
              fontFamily: 'ui-monospace, monospace',
              fontSize: 13,
              background: palette.paper,
              border: `1px solid ${palette.hairline}`,
              borderRadius: 4,
              color: palette.ink,
            }}
          />
          <Legend wrapperStyle={{ ...LEGEND_STYLE, color: palette.ink }} />
          <Bar isAnimationActive={false} yAxisId="flow" dataKey="principal" name="Principal repaid" stackId="pay" fill={palette.moss} radius={[0, 0, 0, 0]} />
          <Bar isAnimationActive={false} yAxisId="flow" dataKey="interest" name="Interest paid" stackId="pay" fill={palette.rust} radius={[2, 2, 0, 0]} />
          <Line
            isAnimationActive={false}
            yAxisId="balance"
            type="monotone"
            dataKey="balance"
            name="Outstanding balance"
            stroke={palette.ink}
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Two named series plotted as lines against a shared x-axis — the refinance calculator's cumulative-interest race, and the inflation calculator's nominal-cost-vs-real-value comparison. */
export function TwoLineChart({
  data,
  seriesAKey,
  seriesAName,
  seriesBKey,
  seriesBName,
  xKey,
  xTickFormatter,
  ariaLabel,
}: {
  data: Record<string, number>[];
  seriesAKey: string;
  seriesAName: string;
  seriesBKey: string;
  seriesBName: string;
  xKey: string;
  xTickFormatter: (v: number) => string;
  ariaLabel: string;
}) {
  const palette = usePalette();
  return (
    <div className="h-72 w-full" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={palette.hairline} vertical={false} />
          <XAxis
            dataKey={xKey}
            tickFormatter={xTickFormatter}
            tick={{ ...TICK_STYLE, fill: palette.inkMuted }}
            axisLine={{ stroke: palette.hairline }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => formatINR(v, { compact: true, decimals: 0 })}
            tick={{ ...TICK_STYLE, fill: palette.inkMuted }}
            axisLine={false}
            tickLine={false}
            width={64}
          />
          <Tooltip
            formatter={(v, name) => [formatINR(Number(v), { compact: true }), name]}
            contentStyle={{
              fontFamily: 'ui-monospace, monospace',
              fontSize: 13,
              background: palette.paper,
              border: `1px solid ${palette.hairline}`,
              borderRadius: 4,
              color: palette.ink,
            }}
          />
          <Legend wrapperStyle={{ ...LEGEND_STYLE, color: palette.ink }} />
          <Area isAnimationActive={false} type="monotone" dataKey={seriesAKey} name={seriesAName} stroke={palette.rust} fill={palette.rust} fillOpacity={0.12} strokeWidth={2} />
          <Area isAnimationActive={false} type="monotone" dataKey={seriesBKey} name={seriesBName} stroke={palette.moss} fill={palette.moss} fillOpacity={0.12} strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Cumulative amount invested vs. the resulting value, growing year by year — SIP and fixed-income products both share this exact shape (a flat/rising "in" line and a compounding "out" line). */
export function GrowthChart({ data, ariaLabel }: { data: { year: number; invested: number; value: number }[]; ariaLabel: string }) {
  const palette = usePalette();
  return (
    <div className="h-72 w-full" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={palette.hairline} vertical={false} />
          <XAxis
            dataKey="year"
            tickFormatter={(v: number) => `Yr ${v}`}
            tick={{ ...TICK_STYLE, fill: palette.inkMuted }}
            axisLine={{ stroke: palette.hairline }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => formatINR(v, { compact: true, decimals: 0 })}
            tick={{ ...TICK_STYLE, fill: palette.inkMuted }}
            axisLine={false}
            tickLine={false}
            width={64}
          />
          <Tooltip
            formatter={(v, name) => [formatINR(Number(v), { compact: true }), name]}
            labelFormatter={(v) => `Year ${v}`}
            contentStyle={{
              fontFamily: 'ui-monospace, monospace',
              fontSize: 13,
              background: palette.paper,
              border: `1px solid ${palette.hairline}`,
              borderRadius: 4,
              color: palette.ink,
            }}
          />
          <Legend wrapperStyle={{ ...LEGEND_STYLE, color: palette.ink }} />
          <Area isAnimationActive={false} type="monotone" dataKey="value" name="Value" stroke={palette.rust} fill={palette.rust} fillOpacity={0.15} strokeWidth={2} />
          <Area isAnimationActive={false} type="monotone" dataKey="invested" name="Invested" stroke={palette.ink} fill={palette.ink} fillOpacity={0.06} strokeWidth={1.5} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * The REIT Portfolio Builder's version of GrowthChart, with a third series
 * overlaid: each year's own gross distributions (dividend/interest/rental/
 * return-of-capital combined), as bars on a secondary right-hand axis —
 * the "rent actually collected that year" number sitting alongside the
 * cumulative invested-vs-value lines, the same dual-axis shape
 * AmortizationChart uses for flow-vs-balance. Distributions are a flow
 * (paid out, not retained in the portfolio's value), so they get their own
 * axis rather than stacking into the cumulative value area — stacking them
 * in would make the "value" line's scale misleading.
 */
export function GrowthWithIncomeChart({
  data,
  ariaLabel,
}: {
  data: { year: number; invested: number; value: number; distributions: number }[];
  ariaLabel: string;
}) {
  const palette = usePalette();
  return (
    <div className="h-72 w-full" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={palette.hairline} vertical={false} />
          <XAxis
            dataKey="year"
            tickFormatter={(v: number) => `Yr ${v}`}
            tick={{ ...TICK_STYLE, fill: palette.inkMuted }}
            axisLine={{ stroke: palette.hairline }}
            tickLine={false}
          />
          <YAxis
            yAxisId="cumulative"
            tickFormatter={(v: number) => formatINR(v, { compact: true, decimals: 0 })}
            tick={{ ...TICK_STYLE, fill: palette.inkMuted }}
            axisLine={false}
            tickLine={false}
            width={64}
          />
          <YAxis
            yAxisId="income"
            orientation="right"
            tickFormatter={(v: number) => formatINR(v, { compact: true, decimals: 0 })}
            tick={{ ...TICK_STYLE, fill: palette.inkMuted }}
            axisLine={false}
            tickLine={false}
            width={64}
          />
          <Tooltip
            formatter={(v, name) => [formatINR(Number(v), { compact: true }), name]}
            labelFormatter={(v) => `Year ${v}`}
            contentStyle={{
              fontFamily: 'ui-monospace, monospace',
              fontSize: 13,
              background: palette.paper,
              border: `1px solid ${palette.hairline}`,
              borderRadius: 4,
              color: palette.ink,
            }}
          />
          <Legend wrapperStyle={{ ...LEGEND_STYLE, color: palette.ink }} />
          <Bar isAnimationActive={false} yAxisId="income" dataKey="distributions" name="Distributions that year" fill={palette.moss} fillOpacity={0.55} radius={[2, 2, 0, 0]} />
          <Area isAnimationActive={false} yAxisId="cumulative" type="monotone" dataKey="value" name="Portfolio value" stroke={palette.rust} fill={palette.rust} fillOpacity={0.15} strokeWidth={2} />
          <Area isAnimationActive={false} yAxisId="cumulative" type="monotone" dataKey="invested" name="Invested" stroke={palette.ink} fill={palette.ink} fillOpacity={0.06} strokeWidth={1.5} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Parses an ISO date ("2026-05-04") into a short display label ("4 May 26"), for axis ticks and tooltips. */
function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' });
}

/**
 * A fixed pixel width for each REIT's stacked bar in ReitIndexedPayoutChart.
 * Left unset, Recharts divides each category's band evenly across every
 * REIT group declared in the chart — even a category where only one REIT
 * actually disclosed that day still has its bar squeezed down to
 * (band width / REITs selected), which is what turned 5-REIT columns into
 * unreadable slivers. A fixed size keeps every REIT's column legible
 * regardless of selection count; defaultBrushStartIndex's row cap is what
 * keeps that many fixed-width columns from overflowing the chart.
 */
const REIT_BAR_SIZE = 10;

/**
 * The array index the Brush should default to, so the chart opens on
 * roughly the last year of history rather than the full multi-year span —
 * mirroring the point-in-time Brush's "show 1 year at a time, then pan/zoom
 * for more" ask.
 *
 * With several REITs selected at once, though, a full calendar year of
 * *combined* disclosure dates can pack in far more columns than a bar chart
 * renders legibly: each additional REIT both adds columns (its own
 * disclosure dates) and shrinks every column (Recharts divides each
 * category's width across all selected REITs' stacked groups, whether or
 * not a given REIT actually disclosed on that exact date) — the two effects
 * compound, which is what turned the "Return of capital" segments into a
 * near-continuous smear with all 5 REITs selected. So this also caps the
 * default window to the most recent `maxVisibleRows` rows and takes
 * whichever of the two candidate windows is narrower. A 1-2 REIT selection
 * never has enough rows in a year to hit that cap and still opens on the
 * full last-12-months view unchanged; a busy 4-5 REIT selection opens
 * tighter by default, and the Brush remains free to widen back out.
 */
function defaultBrushStartIndex(data: readonly { date: string }[], maxVisibleRows = 8): number {
  if (data.length === 0) return 0;
  const last = new Date(`${data[data.length - 1]!.date}T00:00:00Z`);
  const cutoff = new Date(last);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const idxByDate = data.findIndex((row) => row.date >= cutoffIso);
  const startByDate = idxByDate === -1 ? 0 : idxByDate;
  const startByCount = Math.max(0, data.length - maxVisibleRows);
  return Math.max(startByDate, startByCount);
}

/**
 * Recharts' auto-generated `<Legend>` for a stacked-bar-plus-line
 * ComposedChart doesn't preserve JSX declaration order (confirmed against
 * AmortizationChart's already-shipped 2-bar-plus-line chart, which has the
 * same scramble) — with 5 series here rather than 3, that's confusing
 * enough to warrant a fixed rendering order. The library's own `payload`
 * override prop for this exists at runtime but isn't in this version's
 * type declarations (`Omit<Props, ... | 'payload' | ...>`), so this
 * renders the legend itself via the documented `content` render-prop
 * instead, matching LEGEND_STYLE.
 */
function renderFixedLegend(items: { value: string; type: 'square' | 'line'; color: string }[], ink: string) {
  return (
    <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 pt-2" style={{ ...LEGEND_STYLE, color: ink }}>
      {items.map((item) => (
        <li key={item.value} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            style={
              item.type === 'line'
                ? { display: 'inline-block', width: 12, height: 2, background: item.color }
                : { display: 'inline-block', width: 10, height: 10, background: item.color }
            }
          />
          {item.value}
        </li>
      ))}
    </ul>
  );
}

/**
 * Point-in-time view of what one or more REITs' dividend payouts have
 * actually looked like — one stacked column per REIT per actual
 * disclosure date (interest/dividend/rental/return-of-capital, the same
 * four-color scheme every other chart here uses), not bucketed or
 * blended together. Each REIT gets its own `stackId` (its dataKeys are
 * `${reitId}_interest` etc.) so two REITs never sum into one bar even if
 * their dates happened to coincide — in practice they sit at their own
 * distinct positions along one shared date axis. The four component
 * colors stay constant across REITs (position and the tooltip carry
 * which REIT a given column belongs to); the post-tax yield line for
 * each selected REIT, though, needs its own color, since multiple yield
 * lines can overlay directly — `series[].color` supplies that (and
 * drives the legend's per-REIT line entries).
 *
 * A Brush (Recharts' built-in pan/zoom scrollbar) sits under the chart,
 * defaulting to roughly the most recent year of the visible REITs' data,
 * clamped tighter when several REITs are selected at once so the default
 * view stays legible (defaultBrushStartIndex) — dragging its handles
 * narrows or widens the window, dragging the window itself pans across the
 * full listed history, satisfying "show 1 year at a time... slider to zoom
 * in & out and navigate across."
 */
export function ReitIndexedPayoutChart({
  data,
  series,
  ariaLabel,
}: {
  data: readonly Record<string, number | string>[];
  series: readonly { reitId: string; label: string; color: string }[];
  ariaLabel: string;
}) {
  const palette = usePalette();
  if (data.length === 0 || series.length === 0) {
    return <p className="text-sm text-ink-muted">Select at least one REIT above to see its payout history.</p>;
  }
  const brushStart = defaultBrushStartIndex(data as { date: string }[]);
  return (
    <div className="h-[26rem] w-full" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data as Record<string, number | string>[]}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          barCategoryGap="16%"
          barGap={2}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={palette.hairline} vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(v: string) => formatShortDate(v)}
            tick={{ ...TICK_STYLE, fill: palette.inkMuted }}
            axisLine={{ stroke: palette.hairline }}
            tickLine={false}
          />
          <YAxis
            yAxisId="index"
            tickFormatter={(v: number) => v.toFixed(0)}
            tick={{ ...TICK_STYLE, fill: palette.inkMuted }}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          <YAxis
            yAxisId="yieldPct"
            orientation="right"
            tickFormatter={(v: number) => `${v.toFixed(1)}%`}
            tick={{ ...TICK_STYLE, fill: palette.inkMuted }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip
            labelFormatter={(v) => formatShortDate(String(v))}
            formatter={(v, name) => (String(name).includes('yield') ? [`${Number(v).toFixed(2)}%`, name] : [Number(v).toFixed(1), name])}
            contentStyle={{
              fontFamily: 'ui-monospace, monospace',
              fontSize: 13,
              background: palette.paper,
              border: `1px solid ${palette.hairline}`,
              borderRadius: 4,
              color: palette.ink,
            }}
          />
          <Legend
            content={() =>
              renderFixedLegend(
                [
                  { value: 'Interest', type: 'square', color: palette.rust },
                  { value: 'Dividend', type: 'square', color: palette.moss },
                  { value: 'Rental', type: 'square', color: palette.ochre },
                  { value: 'Return of capital', type: 'square', color: palette.ink },
                  ...series.map((s) => ({ value: `${s.label} yield`, type: 'line' as const, color: s.color })),
                ],
                palette.ink,
              )
            }
          />
          {series.flatMap((s) => [
            <Bar key={`${s.reitId}-interest`} isAnimationActive={false} yAxisId="index" dataKey={`${s.reitId}_interest`} name={`${s.label} · Interest`} stackId={s.reitId} fill={palette.rust} barSize={REIT_BAR_SIZE} />,
            <Bar key={`${s.reitId}-dividend`} isAnimationActive={false} yAxisId="index" dataKey={`${s.reitId}_dividend`} name={`${s.label} · Dividend`} stackId={s.reitId} fill={palette.moss} barSize={REIT_BAR_SIZE} />,
            <Bar key={`${s.reitId}-rental`} isAnimationActive={false} yAxisId="index" dataKey={`${s.reitId}_rental`} name={`${s.label} · Rental`} stackId={s.reitId} fill={palette.ochre} barSize={REIT_BAR_SIZE} />,
            <Bar
              key={`${s.reitId}-returnOfCapital`}
              isAnimationActive={false}
              yAxisId="index"
              dataKey={`${s.reitId}_returnOfCapital`}
              name={`${s.label} · Return of capital`}
              stackId={s.reitId}
              fill={palette.ink}
              radius={[2, 2, 0, 0]}
              barSize={REIT_BAR_SIZE}
            />,
          ])}
          {series.map((s) => (
            <Line
              key={`${s.reitId}-yield`}
              isAnimationActive={false}
              yAxisId="yieldPct"
              type="monotone"
              dataKey={`${s.reitId}_yieldPct`}
              name={`${s.label} yield`}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ))}
          <Brush
            dataKey="date"
            height={22}
            travellerWidth={8}
            startIndex={brushStart}
            endIndex={data.length - 1}
            stroke={palette.rust}
            fill={palette.paper}
            tickFormatter={(v: string) => formatShortDate(v)}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** A short list of labelled amounts as vertical bars — the capital-gains breakdown (gain / tax / net) and any other "a few numbers, side by side" comparison. Each bar takes its own color from `data`, defaulting to rust when not given, so a caller can highlight e.g. "tax" differently from "net proceeds" without a second series. */
export function BreakdownBarChart({
  data,
  ariaLabel,
}: {
  data: { label: string; value: number; color?: string }[];
  ariaLabel: string;
}) {
  const palette = usePalette();
  return (
    <div className="h-64 w-full" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={palette.hairline} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif', fontSize: 12, fill: palette.inkMuted }}
            axisLine={{ stroke: palette.hairline }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => formatINR(v, { compact: true, decimals: 0 })}
            tick={{ ...TICK_STYLE, fill: palette.inkMuted }}
            axisLine={false}
            tickLine={false}
            width={64}
          />
          <Tooltip
            formatter={(v) => formatINR(Number(v), { compact: true })}
            contentStyle={{
              fontFamily: 'ui-monospace, monospace',
              fontSize: 13,
              background: palette.paper,
              border: `1px solid ${palette.hairline}`,
              borderRadius: 4,
              color: palette.ink,
            }}
          />
          <Bar isAnimationActive={false} dataKey="value" radius={[2, 2, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.color ?? palette.rust} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Grouped bars comparing the same set of metrics across exactly two named scenarios (old vs. new tax regime, current vs. refinanced loan). */
export function GroupedComparisonChart({
  data,
  seriesAName,
  seriesBName,
  ariaLabel,
}: {
  data: { metric: string; a: number; b: number }[];
  seriesAName: string;
  seriesBName: string;
  ariaLabel: string;
}) {
  const palette = usePalette();
  return (
    <div className="h-72 w-full" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={palette.hairline} vertical={false} />
          <XAxis
            dataKey="metric"
            tick={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif', fontSize: 12, fill: palette.inkMuted }}
            axisLine={{ stroke: palette.hairline }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => formatINR(v, { compact: true, decimals: 0 })}
            tick={{ ...TICK_STYLE, fill: palette.inkMuted }}
            axisLine={false}
            tickLine={false}
            width={64}
          />
          <Tooltip
            formatter={(v, name) => [formatINR(Number(v), { compact: true }), name]}
            contentStyle={{
              fontFamily: 'ui-monospace, monospace',
              fontSize: 13,
              background: palette.paper,
              border: `1px solid ${palette.hairline}`,
              borderRadius: 4,
              color: palette.ink,
            }}
          />
          <Legend wrapperStyle={{ ...LEGEND_STYLE, color: palette.ink }} />
          <Bar isAnimationActive={false} dataKey="a" name={seriesAName} fill={palette.ink} radius={[2, 2, 0, 0]} />
          <Bar isAnimationActive={false} dataKey="b" name={seriesBName} fill={palette.rust} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Phase 9.4 (user feedback: "instead of bars... line charts would be
 * better... showing the year on year change, as well as the possible
 * cutovers"): two net-worth trajectories plotted as continuous lines over
 * every year of the horizon, with a vertical reference line marking each
 * year the two series actually cross. Rent vs Buy's replacement for
 * ResultChart.tsx's four-bucket bar chart — ResultChart itself is
 * untouched and still used by the flagship Comparator, whose own results
 * table and CSV export depend on those same four discrete horizons.
 */
export function NetWorthTrajectoryChart({
  data,
  seriesAKey,
  seriesAName,
  seriesBKey,
  seriesBName,
  crossoverYears,
  ariaLabel,
}: {
  data: { year: number; [key: string]: number }[];
  seriesAKey: string;
  seriesAName: string;
  seriesBKey: string;
  seriesBName: string;
  crossoverYears: readonly number[];
  ariaLabel: string;
}) {
  const palette = usePalette();
  return (
    <div className="h-80 w-full" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={palette.hairline} vertical={false} />
          <XAxis
            dataKey="year"
            tickFormatter={(v: number) => `Yr ${v}`}
            tick={{ ...TICK_STYLE, fill: palette.inkMuted }}
            axisLine={{ stroke: palette.hairline }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => formatINR(v, { compact: true, decimals: 0 })}
            tick={{ ...TICK_STYLE, fill: palette.inkMuted }}
            axisLine={false}
            tickLine={false}
            width={64}
          />
          <Tooltip
            formatter={(v, name) => [formatINR(Number(v), { compact: true }), name]}
            labelFormatter={(v) => `Year ${v}`}
            contentStyle={{
              fontFamily: 'ui-monospace, monospace',
              fontSize: 13,
              background: palette.paper,
              border: `1px solid ${palette.hairline}`,
              borderRadius: 4,
              color: palette.ink,
            }}
          />
          <Legend wrapperStyle={{ ...LEGEND_STYLE, color: palette.ink }} />
          {crossoverYears.map((y) => (
            <ReferenceLine
              key={y}
              x={y}
              stroke={palette.ink}
              strokeOpacity={0.45}
              strokeDasharray="4 4"
              label={{ value: `Crosses Yr ${y}`, position: 'insideTopLeft', fill: palette.inkMuted, fontSize: 11 }}
            />
          ))}
          <Line isAnimationActive={false} type="monotone" dataKey={seriesAKey} name={seriesAName} stroke={palette.rust} strokeWidth={2} dot={false} />
          <Line isAnimationActive={false} type="monotone" dataKey={seriesBKey} name={seriesBName} stroke={palette.moss} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
