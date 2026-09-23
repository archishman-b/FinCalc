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
 * The array index the Brush should default to, so the chart opens on
 * roughly the last year of history rather than the full multi-year span —
 * mirroring the point-in-time Brush's "show 1 year at a time, then pan/zoom
 * for more" ask. ReitIndexedPayoutChart plots one line per REIT (with dots
 * at actual disclosure dates) rather than grouped bars, so point density
 * doesn't degrade readability the way it used to — a plain trailing-365-
 * days default is enough, with no need to shrink further for busier
 * multi-REIT selections.
 */
function defaultBrushStartIndex(data: readonly { date: string }[]): number {
  if (data.length === 0) return 0;
  const last = new Date(`${data[data.length - 1]!.date}T00:00:00Z`);
  const cutoff = new Date(last);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const idx = data.findIndex((row) => row.date >= cutoffIso);
  return idx === -1 ? 0 : idx;
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

/** Reads a numeric field off a ReitIndexedDistributionRow, defaulting to 0 — used in ReitIndexedPayoutChart's tooltip, where every field beyond `date` is typed loosely as `number | string`. */
function num(v: number | string | undefined): number {
  return typeof v === 'number' ? v : 0;
}

/**
 * Point-in-time view of what one or more REITs' dividend payouts have
 * actually looked like: one line per REIT, indexed to 100 at that REIT's
 * own FY2026-27 base record (see reitIndexedDistributionSeries), with a
 * dot at every date that REIT actually disclosed a distribution —
 * `connectNulls` draws a plain visual connector across the other REITs'
 * rows in between, not a real value. Each REIT gets its own `series[].color`
 * (drives both the line/dots and the legend).
 *
 * An earlier revision rendered these same point-in-time payouts as stacked
 * bars, but with several REITs' worth of disclosure dates sharing one axis,
 * Recharts had to shrink every bar's width per REIT selected — no amount
 * of retuning the default window or an explicit bar size kept a 5-REIT
 * selection legible. A line-plus-dot rendering has no such failure mode at
 * any REIT count, which is why this replaces the bars outright. All the
 * detail that used to be visible as stacked bar segments — the four-
 * component rupee split, the actual per-unit payout and price, both yield
 * %s (gross and effective post-tax) — now lives in the hover tooltip for
 * that REIT's dot instead, per explicit user ask, rather than being
 * visually stacked.
 *
 * A Brush (Recharts' built-in pan/zoom scrollbar) sits under the chart,
 * defaulting to the trailing ~12 months of history (defaultBrushStartIndex)
 * — dragging its handles narrows or widens the window, dragging the window
 * itself pans across the full listed history, satisfying "show 1 year at a
 * time... slider to zoom in & out and navigate across."
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
        <ComposedChart data={data as Record<string, number | string>[]} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null;
              const points = payload
                .map((p) => {
                  const key = String(p.dataKey ?? '');
                  const reitId = key.endsWith('_indexed') ? key.slice(0, -'_indexed'.length) : '';
                  const s = series.find((x) => x.reitId === reitId);
                  const row = p.payload as Record<string, number | string> | undefined;
                  if (!s || !row || typeof row[`${reitId}_indexed`] !== 'number') return null;
                  return { s, row, reitId };
                })
                .filter((x): x is { s: (typeof series)[number]; row: Record<string, number | string>; reitId: string } => x !== null);
              if (points.length === 0) return null;
              return (
                <div
                  style={{
                    fontFamily: 'ui-monospace, monospace',
                    fontSize: 12.5,
                    lineHeight: 1.5,
                    background: palette.paper,
                    border: `1px solid ${palette.hairline}`,
                    borderRadius: 4,
                    color: palette.ink,
                    padding: '8px 10px',
                    maxWidth: 300,
                  }}
                >
                  {points.map(({ s, row, reitId }) => (
                    <div key={reitId} style={{ marginBottom: 4 }}>
                      <div style={{ fontWeight: 600, color: s.color }}>
                        {s.label} · {formatShortDate(String(row.date))}
                      </div>
                      <div>1. Payout per share: {formatINR(num(row[`${reitId}_totalDpuInr`]), { decimals: 2 })}</div>
                      <div>2. Share price: {formatINR(num(row[`${reitId}_priceInr`]), { decimals: 2 })}</div>
                      <div>3. Yield % (absolute): {num(row[`${reitId}_grossYieldPct`]).toFixed(2)}%</div>
                      <div>
                        4. Split of payout: Interest {formatINR(num(row[`${reitId}_interestInr`]), { decimals: 2 })} · Dividend{' '}
                        {formatINR(num(row[`${reitId}_dividendInr`]), { decimals: 2 })} · Rental{' '}
                        {formatINR(num(row[`${reitId}_rentalInr`]), { decimals: 2 })} · Return of capital{' '}
                        {formatINR(num(row[`${reitId}_returnOfCapitalInr`]), { decimals: 2 })}
                      </div>
                      <div>5. Yield % (effective, after tax): {num(row[`${reitId}_postTaxYieldPct`]).toFixed(2)}%</div>
                    </div>
                  ))}
                </div>
              );
            }}
          />
          <Legend content={() => renderFixedLegend(series.map((s) => ({ value: s.label, type: 'line' as const, color: s.color })), palette.ink)} />
          {series.map((s) => (
            <Line
              key={s.reitId}
              isAnimationActive={false}
              yAxisId="index"
              type="monotone"
              dataKey={`${s.reitId}_indexed`}
              name={s.label}
              stroke={s.color}
              strokeWidth={2.5}
              dot={{ r: 3.5, strokeWidth: 0, fill: s.color }}
              activeDot={{ r: 5.5 }}
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
