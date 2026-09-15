/**
 * Monte Carlo Web Worker: runs runMonteCarlo() off the main thread so the UI never freezes,
 * however many trials are requested (see ../lib/monte-carlo-client.ts's module doc for the full
 * rationale, including why this file reconstructs scenarios from LayerOneInputs rather than
 * receiving them directly across postMessage).
 *
 * Typing note: this file needs the worker globals `self.onmessage` / `self.postMessage` typed,
 * but apps/web/tsconfig.json's project-wide `lib` is `["ES2022", "DOM", "DOM.Iterable"]`, which
 * every non-worker file in the app needs. Adding `/// <reference lib="webworker" />` here would
 * pull the `webworker` lib's own declaration of the global `self` into the same TS program and
 * conflict with DOM's incompatible one (`Window & typeof globalThis` vs `WorkerGlobalScope`).
 * Rather than fight that conflict, only the two APIs this file actually uses are typed, via a
 * local interface and a cast — there is no ambient redeclaration, so there is nothing to
 * conflict. At runtime `self` is whatever global scope the file executes in (a real
 * WorkerGlobalScope when loaded as a Worker, which is the only way this file is ever loaded).
 */
import { getCostInflationIndexRules } from '@fincalc/data';
import { runMonteCarlo, type StochasticSeriesConfig } from '@fincalc/engine';

import { buildDefaultCorrelationMatrix, volatilityForSeries } from '../lib/monte-carlo-assumptions';
import type { MonteCarloJob, MonteCarloJobResponse } from '../lib/monte-carlo-client';
import { buildLayerOneComparison } from '../lib/scenario-builder';

interface WorkerScope {
  onmessage: ((event: { data: MonteCarloJob }) => void) | null;
  postMessage: (message: MonteCarloJobResponse) => void;
}

const workerSelf = self as unknown as WorkerScope;

workerSelf.onmessage = (event) => {
  const job = event.data;
  try {
    // Reconstructs the exact same scenarios/ctx/household the main thread built for its
    // deterministic result — see the module doc above for why this must be a reconstruction
    // via the same pure function rather than data passed across postMessage.
    const layerOne = buildLayerOneComparison(job.inputs);

    const stochasticSeries: StochasticSeriesConfig[] = layerOne.assumptions.map((assumption) => ({
      seriesId: assumption.id,
      annualMean: assumption.rate,
      annualVolatility: volatilityForSeries(assumption.id),
    }));
    const correlationMatrix = buildDefaultCorrelationMatrix(stochasticSeries.map((s) => s.seriesId));

    const result = runMonteCarlo({
      scenarios: [...layerOne.scenarios],
      baseCtx: layerOne.ctx,
      stochasticSeries,
      correlationMatrix,
      horizonsMonths: job.horizonsMonths ?? [...layerOne.horizonsMonths],
      startFy: layerOne.startFy,
      household: layerOne.household,
      cii: getCostInflationIndexRules(),
      trials: job.trials,
      ...(job.seed !== undefined ? { seed: job.seed } : {}),
    });

    workerSelf.postMessage({ jobId: job.jobId, ok: true, result });
  } catch (error) {
    workerSelf.postMessage({
      jobId: job.jobId,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
