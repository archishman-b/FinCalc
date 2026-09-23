import { useState } from 'react';

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

/** Reads a numeric field off a ReitIndexedDistributionRow, defaulting to 0 — used in ReitIndexedPayoutChart's tooltip, where every field beyond `date` is typed loosely as `number | string`. */
function num(v: number | string | undefined): number {
  return typeof v === 'number' ? v : 0;
}

/**
 * A padded [min, max] y-domain for one REIT's indexed values within a
 * visible row slice — each panel in ReitIndexedPayoutChart's small
 * multiples gets its own range computed this way (e.g. ~80–105) instead of
 * every REIT sharing one 0–120ish scale, so a REIT whose payouts barely
 * move isn't rendered as a near-flat line just because another REIT in the
 * same selection swings much wider. Recomputed whenever the visible window
 * (the Brush range) changes, so zooming in tightens the range further.
 * Falls back to a fixed band when the REIT has no visible values, so the
 * panel still renders a sane axis rather than a degenerate [0, 0].
 */
function reitYDomain(rows: readonly Record<string, number | string>[], reitId: string): [number, number] {
  const values = rows.map((r) => r[`${reitId}_indexed`]).filter((v): v is number => typeof v === 'number');
  if (values.length === 0) return [90, 110];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [min - 5, max + 5];
  const pad = Math.max((max - min) * 0.15, 1);
  return [Math.floor(min - pad), Math.ceil(max + pad)];
}

/** Fixed per-panel geometry in ReitIndexedPayoutChart's small multiples — the same margin and y-axis width on every panel keep their plot areas pixel-aligned, so a given date lines up vertically across panels even though each is its own independent Recharts instance. */
const REIT_PANEL_MARGIN = { top: 4, right: 8, left: 0, bottom: 0 };
const REIT_PANEL_Y_AXIS_WIDTH = 42;

/**
 * Point-in-time view of what one or more REITs' dividend payouts have
 * actually looked like: a stack of small-multiple panels, one per REIT,
 * each its own line (indexed to 100 at that REIT's own FY2026-27 base
 * record — see reitIndexedDistributionSeries) with a dot at every date
 * that REIT actually disclosed a distribution. `connectNulls` draws a
 * plain visual connector across the other REITs' rows in between, not a
 * real value.
 *
 * Two earlier revisions put every REIT on one shared chart — first as
 * stacked bars (Recharts had to shrink every bar's width per REIT
 * selected, no amount of retuning the default window or an explicit bar
 * size kept a 5-REIT selection legible), then as overlaid lines on one
 * shared y-axis (legible, but a REIT with a narrow payout range still got
 * visually flattened by sharing a ~0–120 scale with a REIT that swings
 * wider). Per explicit user ask, this splits each REIT into its own panel
 * with its own y-axis domain (reitYDomain — e.g. ~80–105, not 0–120 for
 * every REIT), sharing one x-axis: only the bottom panel draws date ticks,
 * and the other panels' plot areas are pixel-aligned to it (same margin,
 * same fixed y-axis width) so a given date still lines up vertically
 * across panels.
 *
 * A single Brush (Recharts' built-in pan/zoom scrollbar) sits under the
 * bottom panel only — its range is lifted into this component's own state
 * and applied to every panel's data (the bottom panel gets the Brush's
 * usual auto-windowing; the other panels are handed the pre-sliced visible
 * rows directly, since they have no Brush of their own to do that
 * windowing), so dragging it pans/zooms all 5 panels together. It defaults
 * to the trailing ~12 months of history (defaultBrushStartIndex).
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
  const rows = data as Record<string, number | string>[];
  const [range, setRange] = useState(() => ({
    start: defaultBrushStartIndex(rows as { date: string }[]),
    end: Math.max(0, rows.length - 1),
  }));

  if (rows.length === 0 || series.length === 0) {
    return <p className="text-sm text-ink-muted">Select at least one REIT above to see its payout history.</p>;
  }

  const visible = rows.slice(range.start, range.end + 1);

  return (
    <div role="img" aria-label={ariaLabel}>
      {series.map((s, i) => {
        const isLast = i === series.length - 1;
        const domain = reitYDomain(visible, s.reitId);
        return (
          <div key={s.reitId} className="mb-1">
            <div className="mb-0.5 flex items-center gap-1.5 text-xs" style={{ color: palette.inkMuted }}>
              <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
              {s.label}
            </div>
            <div style={{ height: isLast ? 96 : 68 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={isLast ? rows : visible} margin={REIT_PANEL_MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" stroke={palette.hairline} vertical={false} />
                  <XAxis
                    dataKey="date"
                    hide={!isLast}
                    tickFormatter={(v: string) => formatShortDate(v)}
                    tick={{ ...TICK_STYLE, fill: palette.inkMuted }}
                    axisLine={{ stroke: palette.hairline }}
                    tickLine={false}
                    interval="preserveStartEnd"
                    minTickGap={28}
                  />
                  <YAxis
                    domain={domain}
                    tickCount={3}
                    tickFormatter={(v: number) => v.toFixed(0)}
                    tick={{ ...TICK_STYLE, fill: palette.inkMuted }}
                    axisLine={false}
                    tickLine={false}
                    width={REIT_PANEL_Y_AXIS_WIDTH}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const row = payload[0]?.payload as Record<string, number | string> | undefined;
                      if (!row || typeof row[`${s.reitId}_indexed`] !== 'number') return null;
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
                          <div style={{ fontWeight: 600, color: s.color }}>
                            {s.label} · {formatShortDate(String(row.date))}
                          </div>
                          <div>1. Payout per share: {formatINR(num(row[`${s.reitId}_totalDpuInr`]), { decimals: 2 })}</div>
                          <div>2. Share price: {formatINR(num(row[`${s.reitId}_priceInr`]), { decimals: 2 })}</div>
                          <div>3. Yield % (absolute): {num(row[`${s.reitId}_grossYieldPct`]).toFixed(2)}%</div>
                          <div>
                            4. Split of payout: Interest {formatINR(num(row[`${s.reitId}_interestInr`]), { decimals: 2 })} · Dividend{' '}
                            {formatINR(num(row[`${s.reitId}_dividendInr`]), { decimals: 2 })} · Rental{' '}
                            {formatINR(num(row[`${s.reitId}_rentalInr`]), { decimals: 2 })} · Return of capital{' '}
                            {formatINR(num(row[`${s.reitId}_returnOfCapitalInr`]), { decimals: 2 })}
                          </div>
                          <div>5. Yield % (effective, after tax): {num(row[`${s.reitId}_postTaxYieldPct`]).toFixed(2)}%</div>
                        </div>
                      );
                    }}
                  />
                  <Line
                    isAnimationActive={false}
                    type="monotone"
                    dataKey={`${s.reitId}_indexed`}
                    stroke={s.color}
                    strokeWidth={2.5}
                    dot={{ r: 3, strokeWidth: 0, fill: s.color }}
                    activeDot={{ r: 5 }}
                    connectNulls
                  />
                  {isLast && (
                    <Brush
                      dataKey="date"
                      height={22}
                      travellerWidth={8}
                      startIndex={range.start}
                      endIndex={range.end}
                      stroke={palette.rust}
                      fill={palette.paper}
                      tickFormatter={(v: string) => formatShortDate(v)}
                      onChange={(r: { startIndex?: number; endIndex?: number }) => {
                        if (typeof r.startIndex === 'number' && typeof r.endIndex === 'number') {
                          setRange({ start: r.startIndex, end: r.endIndex });
                        }
                      }}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })}
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
