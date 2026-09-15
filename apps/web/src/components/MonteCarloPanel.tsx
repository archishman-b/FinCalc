import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { getCostInflationIndexRules } from '@fincalc/data';
import { formatINR } from '@fincalc/ui';
import {
  runSensitivityAnalysis,
  type CompareOptions,
  type MonteCarloResult,
  type MonteCarloScenarioHorizonSummary,
  type SensitivityAssumption,
} from '@fincalc/engine';

import { DEFAULT_TRIALS, SHORT_ASSUMPTION_LABEL, volatilityForSeries } from '../lib/monte-carlo-assumptions';
import { runMonteCarloInWorker } from '../lib/monte-carlo-client';
import type { HorizonYears, LayerOneInputs, LayerOneResult } from '../lib/scenario-builder';
import { usePalette } from '../lib/theme';
import { Amount } from './Amount';
import { Callout } from './CalcShell';

interface TornadoRow {
  key: string;
  label: string;
  scenarioName: string;
  low: number;
  base: number;
  high: number;
  swing: number;
}

interface MonteCarloPanelProps {
  layerOne: LayerOneResult;
  /** The exact inputs buildLayerOneComparison(layerOne) was built from — the worker needs these, since it re-derives layerOne itself rather than receiving it across postMessage (see monte-carlo-client.ts's module doc). */
  layerOneInputs: LayerOneInputs;
  horizonYears: HorizonYears;
}

/**
 * Phase 7 (brief §3/§6): the tornado chart (always-on, synchronous — see runSensitivityAnalysis's
 * own module doc for why this needs no worker) and the Monte Carlo distribution (opt-in, worker-
 * backed — see monte-carlo-client.ts for why it needs one). Both reuse the same assumptions and
 * volatility defaults as the rest of Phase 7, so the two views agree with each other and with the
 * deterministic headline above them.
 */
export function MonteCarloPanel({ layerOne, layerOneInputs, horizonYears }: MonteCarloPanelProps) {
  const selectedHorizonMonths = horizonYears * 12;
  const [buyScenario, rentScenario] = layerOne.scenarios;
  const palette = usePalette();

  // --- Sensitivity / tornado chart: cheap, so it runs on every render rather than being gated behind a button. ---
  const tornado = useMemo<TornadoRow[]>(() => {
    const baseOptions: CompareOptions = {
      scenarios: [...layerOne.scenarios],
      ctx: layerOne.ctx,
      horizonsMonths: [...layerOne.horizonsMonths],
      startFy: layerOne.startFy,
      household: layerOne.household,
      cii: getCostInflationIndexRules(),
    };
    // ±1 standard deviation either side of the mean — the same volatility assumptions the
    // simulation below uses, so "what moves the outcome" and "the simulated range" agree on what
    // a plausible swing looks like.
    const assumptions: SensitivityAssumption[] = layerOne.assumptions.map((a) => {
      const vol = volatilityForSeries(a.id);
      return { seriesId: a.id, label: SHORT_ASSUMPTION_LABEL[a.id] ?? a.label, lowRate: a.rate - vol, highRate: a.rate + vol };
    });

    const rows: TornadoRow[] = [];
    for (const scenario of layerOne.scenarios) {
      const perScenario = runSensitivityAnalysis(baseOptions, scenario.id, selectedHorizonMonths, assumptions);
      for (const bar of perScenario.bars) {
        // An assumption that structurally can't affect this scenario (e.g. property appreciation
        // for a scenario with no property position) reports an exact zero swing — leaving it out
        // is a real finding, not a rounding omission (see sensitivity.test.ts's own "solo" case).
        if (bar.swing <= 0) continue;
        rows.push({
          key: `${scenario.id}:${bar.seriesId}`,
          label: `${scenario.name}: ${bar.label}`,
          scenarioName: scenario.name,
          low: bar.low,
          base: bar.base,
          high: bar.high,
          swing: bar.swing,
        });
      }
    }
    rows.sort((a, b) => b.swing - a.swing);
    return rows;
  }, [layerOne, selectedHorizonMonths]);

  // --- Monte Carlo distribution: heavy enough to run off the main thread, and opt-in since not every visitor needs it. ---
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<MonteCarloResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runSimulation() {
    setStatus('running');
    setError(null);
    try {
      const mc = await runMonteCarloInWorker(layerOneInputs, DEFAULT_TRIALS, {
        horizonsMonths: [...layerOne.horizonsMonths],
      });
      setResult(mc);
      setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The simulation failed to run. Try again.');
      setStatus('error');
    }
  }

  const buySummary = result?.byScenario.find((s) => s.scenarioId === buyScenario.id && s.horizonMonths === selectedHorizonMonths) ?? null;
  const rentSummary = result?.byScenario.find((s) => s.scenarioId === rentScenario.id && s.horizonMonths === selectedHorizonMonths) ?? null;
  const winProb = result?.headToHeadWinProbability?.find((h) => h.horizonMonths === selectedHorizonMonths) ?? null;
  let rows: MonteCarloScenarioHorizonSummary[] | null = null;
  if (buySummary && rentSummary) rows = [buySummary, rentSummary];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-lg text-ink">What moves the outcome</h2>
        <p className="mt-1 max-w-md text-sm text-ink-muted">
          Each bar shows how far {horizonYears}-year net worth swings if that one assumption ran one standard deviation
          below or above its expected rate, holding everything else fixed.
        </p>
        {tornado.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">No assumption meaningfully moves either scenario&rsquo;s outcome at this horizon.</p>
        ) : (
          <div className="mt-4" style={{ height: Math.max(120, tornado.length * 44) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tornado} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={palette.hairline} horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(v: number) => formatINR(v, { compact: true, decimals: 0 })}
                  tick={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, fill: palette.inkMuted }}
                  axisLine={{ stroke: palette.hairline }}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={170}
                  tick={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif', fontSize: 12, fill: palette.ink }}
                  axisLine={false}
                  tickLine={false}
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
                <Bar dataKey="swing" radius={[0, 2, 2, 0]}>
                  {tornado.map((bar) => (
                    <Cell key={bar.key} fill={bar.scenarioName === buyScenario.name ? palette.rust : palette.moss} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg text-ink">Simulated range of outcomes</h2>
        <p className="mt-1 max-w-md text-sm text-ink-muted">
          {DEFAULT_TRIALS.toLocaleString('en-IN')} simulated paths with correlated, year-to-year randomness in each
          assumption — the actual shape of the distribution, not just the bear/base/bull points above.
        </p>

        {status === 'idle' && (
          <button
            type="button"
            onClick={() => void runSimulation()}
            className="mt-4 w-fit rounded-sm border border-rust px-4 py-2 text-sm text-rust hover:bg-rust hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rust"
          >
            Run Monte Carlo simulation →
          </button>
        )}

        {status === 'running' && (
          <p className="mt-4 text-sm text-ink-muted" role="status" aria-live="polite">
            Running {DEFAULT_TRIALS.toLocaleString('en-IN')} simulated paths…
          </p>
        )}

        {status === 'error' && error && <Callout>{error}</Callout>}

        {status === 'done' && rows && (
          <div className="mt-4 flex flex-col gap-6">
            {winProb && (
              <p className="max-w-md text-sm text-ink">
                {buyScenario.name} came out ahead of {rentScenario.name} in{' '}
                <span className="font-mono tabular-nums text-ink">{(winProb.firstScenarioWinsFraction * 100).toFixed(0)}%</span>{' '}
                of simulated paths at {horizonYears} years.
              </p>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-sm">
                <caption className="sr-only">Simulated terminal net worth percentiles at {horizonYears} years</caption>
                <thead>
                  <tr className="border-b border-hairline text-left text-ink-muted">
                    <th className="py-2 pr-3 font-normal">Scenario</th>
                    <th className="py-2 pr-3 font-normal">P5</th>
                    <th className="py-2 pr-3 font-normal">P25</th>
                    <th className="py-2 pr-3 font-normal">Median</th>
                    <th className="py-2 pr-3 font-normal">P75</th>
                    <th className="py-2 pr-3 font-normal">P95</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.scenarioId} className="border-b border-hairline/60">
                      <td className="py-2 pr-3 align-top text-ink">{s.scenarioName}</td>
                      <td className="py-2 pr-3 align-top">
                        <Amount value={s.p5} />
                      </td>
                      <td className="py-2 pr-3 align-top">
                        <Amount value={s.p25} />
                      </td>
                      <td className="py-2 pr-3 align-top">
                        <Amount value={s.p50} className="text-ink" />
                      </td>
                      <td className="py-2 pr-3 align-top">
                        <Amount value={s.p75} />
                      </td>
                      <td className="py-2 pr-3 align-top">
                        <Amount value={s.p95} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              type="button"
              onClick={() => void runSimulation()}
              className="w-fit text-sm text-ink-muted hover:text-rust focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rust"
            >
              Re-run simulation
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
