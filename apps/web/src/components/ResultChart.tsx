import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { formatINR } from '@fincalc/ui';
import type { ComparisonResult } from '@fincalc/engine';

import { usePalette } from '../lib/theme';

interface ResultChartProps {
  result: ComparisonResult;
  horizonsMonths: readonly number[];
}

/** The "one chart" Phase 5's done-when bar asks for: terminal net worth per scenario, grouped by horizon — real data straight from a real compare() run, not a mockup. */
export function ResultChart({ result, horizonsMonths }: ResultChartProps) {
  const palette = usePalette();
  const [buy, rent] = result.scenarios;
  if (!buy || !rent) return null;

  const data = horizonsMonths.map((months, i) => ({
    horizon: `${months / 12}yr`,
    [buy.scenarioName]: buy.perHorizon[i]?.terminalNetWorth ?? 0,
    [rent.scenarioName]: rent.perHorizon[i]?.terminalNetWorth ?? 0,
  }));

  return (
    <div className="h-72 w-full" role="img" aria-label={`Terminal net worth by horizon, ${buy.scenarioName} versus ${rent.scenarioName}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={palette.hairline} vertical={false} />
          <XAxis
            dataKey="horizon"
            tick={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, fill: palette.inkMuted }}
            axisLine={{ stroke: palette.hairline }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => formatINR(v, { compact: true, decimals: 0 })}
            tick={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, fill: palette.inkMuted }}
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
          <Legend wrapperStyle={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif', fontSize: 13, color: palette.ink }} />
          <Bar isAnimationActive={false} dataKey={buy.scenarioName} fill={palette.rust} radius={[2, 2, 0, 0]} />
          <Bar isAnimationActive={false} dataKey={rent.scenarioName} fill={palette.moss} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
