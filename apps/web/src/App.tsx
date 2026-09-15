import { lazy, Suspense } from 'react';

import { ComingSoon } from './routes/ComingSoon';
import { Home } from './routes/Home';
import { useRoute } from './lib/router';

// Recharts (and its d3 dependencies) is the single biggest slice of the
// bundle and only the Comparator route needs it — code-split it so the
// entry router (door 5's "traffic driver", per brief §4) stays fast on a
// phone even before anyone picks a door.
const Comparator = lazy(() => import('./routes/Comparator').then((m) => ({ default: m.Comparator })));

/**
 * Phase 5 shell: the entry router (brief §4's five doors) plus the Layer-1
 * flow for door 3, the flagship Allocation Comparator. The other four
 * doors get an honest "this phase is coming" state rather than a dead
 * link — see routes/ComingSoon.tsx.
 */
export function App() {
  const route = useRoute();

  return (
    <div className="min-h-dvh bg-paper text-ink">
      {route === 'home' && <Home />}
      {route === 'comparator' && (
        <Suspense fallback={<div className="px-5 py-10 text-ink-muted sm:px-8">Loading…</div>}>
          <Comparator />
        </Suspense>
      )}
      {(route === 'afford' || route === 'rent-vs-buy' || route === 'retirement' || route === 'calculators') && (
        <ComingSoon route={route} />
      )}
    </div>
  );
}
