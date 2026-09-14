import { listRulePacks } from '@fincalc/data';
import { ENGINE_VERSION } from '@fincalc/engine';
import { formatINR } from '@fincalc/ui';

/**
 * Phase 0 placeholder. It exists to prove the pipeline end to end — workspace
 * imports, Tailwind, the Pages base path — not to preview the product. The
 * real shell arrives in Phase 5 after the design plan.
 */
export function App() {
  const packs = listRulePacks().length;

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-between px-5 py-10 text-neutral-900 sm:px-8 dark:text-neutral-100">
      <header className="space-y-6">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">FinCalc</p>
        <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          Where does the same monthly rupee end up?
        </h1>
        <p className="max-w-prose text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
          A decision tool for Indian households. It compares housing, land and listed REIT allocations on
          equal monthly outflow — after tax, transaction costs and exit friction — and tells you the return
          each option needs to earn to come out ahead.
        </p>
        <p className="max-w-prose text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
          Everything runs in your browser. Nothing you enter leaves this page.
        </p>
      </header>

      <footer className="mt-16 space-y-2 border-t border-neutral-200 pt-6 text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
        <p>
          Phase 0 — scaffold. Engine {ENGINE_VERSION} · {packs} rule packs · built {__BUILD_DATE__} · wiring check{' '}
          <span className="tabular-nums text-neutral-700 dark:text-neutral-300">{formatINR(12_34_567)}</span>
        </p>
        <p>Information, not advice. FinCalc is not SEBI- or IRDAI-registered investment advice.</p>
      </footer>
    </main>
  );
}
