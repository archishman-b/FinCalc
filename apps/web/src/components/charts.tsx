import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  ComposedChart,
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
