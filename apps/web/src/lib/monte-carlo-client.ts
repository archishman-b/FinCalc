/**
 * Main-thread wrapper around the Monte Carlo Web Worker (../workers/monte-carlo.worker.ts).
 *
 * Why a worker at all: runMonteCarlo's benchmarked cost is under a second for 10,000 trials
 * across 4 horizons on a realistic Layer 1 comparison (see comparator/monte-carlo.ts's module
 * doc), but that is still long enough to visibly freeze the UI thread if run inline — a slider
 * drag or a click would stall until the run finishes. Running it in a worker keeps the brief's
 * "UI never freezes" requirement (Phase 7) true regardless of trial count.
 *
 * Why the worker reconstructs scenarios instead of receiving them directly: Scenario, Position,
 * and MarketContext objects carry function properties (Position.project, MarketContext.rate,
 * exit-config resolvers) that cannot cross postMessage's structured-clone boundary. So only the
 * plain, serializable LayerOneInputs cross the boundary, and the worker calls the exact same pure
 * buildLayerOneComparison() function the main thread already used to build its deterministic
 * result — the worker's scenarios are therefore guaranteed identical to the main thread's, not a
 * separate re-implementation that could drift from it.
 */
import type { MonteCarloResult } from '@fincalc/engine';

import type { LayerOneInputs } from './scenario-builder';

export interface MonteCarloJob {
  jobId: string;
  inputs: LayerOneInputs;
  trials: number;
  horizonsMonths?: number[];
  seed?: number;
}

export type MonteCarloJobResponse =
  | { jobId: string; ok: true; result: MonteCarloResult }
  | { jobId: string; ok: false; error: string };

interface PendingJob {
  resolve: (result: MonteCarloResult) => void;
  reject: (error: Error) => void;
}

let worker: Worker | null = null;
const pending = new Map<string, PendingJob>();
let nextJobId = 0;

function ensureWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL('../workers/monte-carlo.worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (event: MessageEvent<MonteCarloJobResponse>) => {
    const response = event.data;
    const job = pending.get(response.jobId);
    if (!job) return; // stale or unknown job id — ignore rather than throw
    pending.delete(response.jobId);
    if (response.ok) job.resolve(response.result);
    else job.reject(new Error(response.error));
  };
  w.onerror = (event: ErrorEvent) => {
    // A worker-level error (e.g. a load/syntax failure) carries no jobId to route to a single
    // caller — fail every outstanding job rather than leaving their promises hanging forever.
    const error = new Error(event.message || 'The Monte Carlo simulation worker failed unexpectedly.');
    for (const [id, job] of pending) {
      job.reject(error);
      pending.delete(id);
    }
  };
  worker = w;
  return w;
}

export interface RunMonteCarloInWorkerOptions {
  horizonsMonths?: number[];
  /** Defaults to the engine's own fixed constant (see MonteCarloOptions.seed) when omitted. */
  seed?: number;
}

/** Runs a Monte Carlo simulation for the given Layer 1 inputs off the main thread. */
export function runMonteCarloInWorker(
  inputs: LayerOneInputs,
  trials: number,
  options: RunMonteCarloInWorkerOptions = {},
): Promise<MonteCarloResult> {
  const w = ensureWorker();
  const jobId = `mc-${nextJobId++}`;
  const job: MonteCarloJob = {
    jobId,
    inputs,
    trials,
    ...(options.horizonsMonths !== undefined ? { horizonsMonths: options.horizonsMonths } : {}),
    ...(options.seed !== undefined ? { seed: options.seed } : {}),
  };
  return new Promise<MonteCarloResult>((resolve, reject) => {
    pending.set(jobId, { resolve, reject });
    w.postMessage(job);
  });
}

/** Terminates the underlying worker, if one has been created, and rejects any in-flight jobs. */
export function terminateMonteCarloWorker(): void {
  if (!worker) return;
  const error = new Error('The Monte Carlo simulation worker was terminated before it could finish.');
  for (const [id, job] of pending) {
    job.reject(error);
    pending.delete(id);
  }
  worker.terminate();
  worker = null;
}
