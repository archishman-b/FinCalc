import { lazy, Suspense } from 'react';

import { Home } from './routes/Home';
import { useRoute } from './lib/router';

// Each Graphite module is its own code-split chunk, same as before — a
// visitor only ever downloads the one module they open.
const ReitPortfolioBuilder = lazy(() =>
  import('./routes/tier1/ReitPortfolioBuilder').then((m) => ({ default: m.ReitPortfolioBuilder })),
);
const SipSwpPlanner = lazy(() => import('./routes/tier1/SipSwpPlanner').then((m) => ({ default: m.SipSwpPlanner })));
const EpfVpfPlanner = lazy(() => import('./routes/tier1/EpfVpfPlanner').then((m) => ({ default: m.EpfVpfPlanner })));
const NpsPlanner = lazy(() => import('./routes/tier1/NpsPlanner').then((m) => ({ default: m.NpsPlanner })));

const LOADING = <div className="px-5 py-10 text-ink-muted sm:px-8">Loading…</div>;

/**
 * Four modules — REIT income, SIP & SWP, EPF & VPF, NPS (Tier I) — plus a
 * small landing page linking to all of them. Everything else the app used
 * to ship (the flagship Allocation Comparator, the Tier 1 grid and its
 * eight calculators, Monte Carlo/sensitivity analysis, scenario sharing
 * and persistence, live market-context adapters) was removed, routes and
 * all; see claude/decisions-and-workflow.md for the full account of what
 * went and why, and for the EPF & VPF / NPS build (Phase 15).
 */
export function App() {
  const route = useRoute();

  return (
    <div className="min-h-dvh bg-paper text-ink">
      {route === 'home' && <Home />}
      {route === 'calc-reit-portfolio' && (
        <Suspense fallback={LOADING}>
          <ReitPortfolioBuilder />
        </Suspense>
      )}
      {route === 'calc-sip-swp' && (
        <Suspense fallback={LOADING}>
          <SipSwpPlanner />
        </Suspense>
      )}
      {route === 'calc-epf-vpf' && (
        <Suspense fallback={LOADING}>
          <EpfVpfPlanner />
        </Suspense>
      )}
      {route === 'calc-nps' && (
        <Suspense fallback={LOADING}>
          <NpsPlanner />
        </Suspense>
      )}
    </div>
  );
}
